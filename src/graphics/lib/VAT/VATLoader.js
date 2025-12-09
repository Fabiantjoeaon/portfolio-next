import * as THREE from "three/webgpu";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

/**
 * Loads VAT (Vertex Animation Texture) assets exported from OpenVAT.
 * https://extensions.blender.org/add-ons/openvat/
 *
 * Expects a base path like '/assets/scenes/meadow/flowers/rose_vat/GNRose'
 * and will load:
 *   - {basePath}.fbx - the mesh with VAT_UV mapping
 *   - {basePath}_vat.exr - the vertex animation texture
 *   - {basePath}-remap_info.json - min/max bounds and frame count
 */
export class VATLoader {
  constructor() {
    this.fbxLoader = new FBXLoader();
    this.gltfLoader = new GLTFLoader();
    this.exrLoader = new EXRLoader();
  }

  /**
   * Load all VAT assets from a base path
   * @param {string} basePath - Base path without extension
   * @param {string} meshFormat - Mesh format: 'glb', 'gltf', or 'fbx' (default: 'glb')
   * @returns {Promise<{geometry: THREE.BufferGeometry, vatTexture: THREE.DataTexture, remapInfo: Object}>}
   */
  async load(basePath, meshFormat = "glb") {
    const meshExtension =
      meshFormat === "gltf" ? "gltf" : meshFormat === "fbx" ? "fbx" : "glb";
    const loadMesh =
      meshExtension === "fbx"
        ? this.loadFBX(`${basePath}.${meshExtension}`)
        : this.loadGLTF(`${basePath}.${meshExtension}`);

    const [meshResult, vatTexture, remapInfo] = await Promise.all([
      loadMesh,
      this.loadEXR(`${basePath}_vat.exr`),
      this.loadJSON(`${basePath}-remap_info.json`),
    ]);

    console.log("meshResult", meshResult);

    const geometry = meshResult.geometry;

    // Store texture dimensions in remapInfo for the material
    remapInfo.textureWidth = vatTexture.image.width;
    remapInfo.textureHeight = vatTexture.image.height;

    return {
      geometry,
      vatTexture,
      remapInfo,
    };
  }

  /**
   * Load cloth demo VAT assets (different format with separate pos/rot/col textures)
   * @param {string} basePath - Base path like '/assets/.../cloth' (without _pos.exr etc)
   * @returns {Promise<{geometry: THREE.BufferGeometry, posTexture: THREE.DataTexture, rotTexture: THREE.DataTexture, colTexture: THREE.DataTexture}>}
   */
  async loadClothDemo(basePath) {
    const [meshResult, posTexture, rotTexture, colTexture] = await Promise.all([
      this.loadFBX(`${basePath}_mesh.fbx`),
      this.loadEXR(`${basePath}_pos.exr`),
      this.loadEXR(`${basePath}_rot.exr`),
      this.loadEXR(`${basePath}_col.exr`),
    ]);

    console.log("Cloth demo loaded:");
    console.log(
      "  Mesh vertices:",
      meshResult.geometry.attributes.position.count
    );
    console.log(
      "  Position texture:",
      posTexture.image.width,
      "x",
      posTexture.image.height
    );
    console.log(
      "  Rotation texture:",
      rotTexture.image.width,
      "x",
      rotTexture.image.height
    );
    console.log(
      "  Color texture:",
      colTexture.image.width,
      "x",
      colTexture.image.height
    );
    console.log(
      "  Geometry attributes:",
      Object.keys(meshResult.geometry.attributes)
    );

    return {
      geometry: meshResult.geometry,
      posTexture,
      rotTexture,
      colTexture,
    };
  }

  /**
   * Load FBX and extract ALL mesh geometries, merging them
   * OpenVAT exports may contain multiple meshes (e.g., stem + flower)
   * @param {string} url
   * @returns {Promise<{geometry: THREE.BufferGeometry}>}
   */
  async loadFBX(url) {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group) => {
          const meshes = [];

          // Log ALL objects in the FBX to understand the structure
          console.log("VAT FBX: Full hierarchy:");
          group.traverse((child) => {
            const type = child.type;
            const name = child.name || "(unnamed)";
            const hasGeo = child.geometry
              ? `vertices: ${child.geometry.attributes.position?.count}`
              : "no geometry";
            const hasMat = child.material
              ? Array.isArray(child.material)
                ? `${child.material.length} materials`
                : "1 material"
              : "no material";
            console.log(`  - ${type}: "${name}" | ${hasGeo} | ${hasMat}`);
          });

          group.traverse((child) => {
            if (child.isMesh) {
              const geo = child.geometry;
              const vertCount = geo.attributes.position.count;

              console.log(`VAT FBX: Found mesh "${child.name}"`);
              console.log(`  - Vertices: ${vertCount}`);
              console.log(`  - Attributes:`, Object.keys(geo.attributes));

              // Log UV channels
              for (const [name, attr] of Object.entries(geo.attributes)) {
                if (name.startsWith("uv")) {
                  const minU = Math.min(
                    ...Array.from(attr.array).filter(
                      (_, i) => i % attr.itemSize === 0
                    )
                  );
                  const maxU = Math.max(
                    ...Array.from(attr.array).filter(
                      (_, i) => i % attr.itemSize === 0
                    )
                  );
                  console.log(
                    `  - ${name}: count=${attr.count}, U range: ${minU.toFixed(
                      4
                    )} to ${maxU.toFixed(4)}`
                  );
                }
              }

              meshes.push(child);
            }
          });

          if (meshes.length === 0) {
            reject(new Error("No mesh found in FBX file"));
            return;
          }

          console.log(`VAT FBX: Found ${meshes.length} mesh(es), merging...`);

          // Merge all meshes into one geometry
          let geometry;
          if (meshes.length === 1) {
            geometry = meshes[0].geometry;
          } else {
            geometry = this._mergeGeometries(meshes);
          }

          // Setup VAT lookup from the appropriate UV channel
          this._setupVATLookup(geometry);

          console.log(
            `VAT FBX: Final merged geometry has ${geometry.attributes.position.count} vertices`
          );
          resolve({ geometry });
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Load GLTF/GLB and extract ALL mesh geometries, merging them
   * OpenVAT exports may contain multiple meshes (e.g., stem + flower)
   * @param {string} url
   * @returns {Promise<{geometry: THREE.BufferGeometry}>}
   */
  async loadGLTF(url) {
    return new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => {
          const meshes = [];

          gltf.scene.traverse((child) => {
            if (child.isMesh) {
              const geo = child.geometry;
              const vertCount = geo.attributes.position.count;

              console.log(`VAT GLTF: Found mesh "${child.name}"`);
              console.log(`  - Vertices: ${vertCount}`);
              console.log(`  - Attributes:`, Object.keys(geo.attributes));

              // Log UV channels
              for (const [name, attr] of Object.entries(geo.attributes)) {
                if (name.startsWith("uv")) {
                  const minU = Math.min(
                    ...Array.from(attr.array).filter(
                      (_, i) => i % attr.itemSize === 0
                    )
                  );
                  const maxU = Math.max(
                    ...Array.from(attr.array).filter(
                      (_, i) => i % attr.itemSize === 0
                    )
                  );
                  console.log(
                    `  - ${name}: count=${attr.count}, U range: ${minU.toFixed(
                      4
                    )} to ${maxU.toFixed(4)}`
                  );
                }
              }

              meshes.push(child);
            }
          });

          if (meshes.length === 0) {
            reject(new Error("No mesh found in GLTF file"));
            return;
          }

          console.log(`VAT GLTF: Found ${meshes.length} mesh(es), merging...`);

          // Merge all meshes into one geometry
          let geometry;
          if (meshes.length === 1) {
            geometry = meshes[0].geometry;
          } else {
            geometry = this._mergeGeometries(meshes);
          }

          // Setup VAT lookup from the appropriate UV channel
          this._setupVATLookup(geometry);

          console.log(
            `VAT GLTF: Final merged geometry has ${geometry.attributes.position.count} vertices`
          );
          resolve({ geometry });
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Merge multiple mesh geometries into one
   * Preserves all attributes including UVs
   * @param {THREE.Mesh[]} meshes
   * @returns {THREE.BufferGeometry}
   */
  _mergeGeometries(meshes) {
    const merged = new THREE.BufferGeometry();

    // Collect all attribute data
    const allPositions = [];
    const allNormals = [];
    const allUVs = [];
    const allUV1s = [];
    const allIndices = [];
    let indexOffset = 0;

    for (const mesh of meshes) {
      const geo = mesh.geometry;

      // Apply mesh transform to positions
      mesh.updateMatrixWorld(true);
      const positions = geo.attributes.position;
      const normals = geo.attributes.normal;
      const uvs = geo.attributes.uv;
      const uv1s = geo.attributes.uv1;

      // Transform positions by mesh world matrix
      const tempPos = new THREE.Vector3();
      const tempNorm = new THREE.Vector3();
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(
        mesh.matrixWorld
      );

      for (let i = 0; i < positions.count; i++) {
        // Position
        tempPos.set(positions.getX(i), positions.getY(i), positions.getZ(i));
        tempPos.applyMatrix4(mesh.matrixWorld);
        allPositions.push(tempPos.x, tempPos.y, tempPos.z);

        // Normal
        if (normals) {
          tempNorm.set(normals.getX(i), normals.getY(i), normals.getZ(i));
          tempNorm.applyMatrix3(normalMatrix).normalize();
          allNormals.push(tempNorm.x, tempNorm.y, tempNorm.z);
        }

        // UV
        if (uvs) {
          allUVs.push(uvs.getX(i), uvs.getY(i));
        }

        // UV1 (VAT UV)
        if (uv1s) {
          allUV1s.push(uv1s.getX(i), uv1s.getY(i));
        }
      }

      // Handle indices
      if (geo.index) {
        for (let i = 0; i < geo.index.count; i++) {
          allIndices.push(geo.index.getX(i) + indexOffset);
        }
      } else {
        // Non-indexed geometry - create sequential indices
        for (let i = 0; i < positions.count; i++) {
          allIndices.push(i + indexOffset);
        }
      }

      indexOffset += positions.count;
    }

    // Set attributes on merged geometry
    merged.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(allPositions, 3)
    );
    if (allNormals.length > 0) {
      merged.setAttribute(
        "normal",
        new THREE.Float32BufferAttribute(allNormals, 3)
      );
    }
    if (allUVs.length > 0) {
      merged.setAttribute("uv", new THREE.Float32BufferAttribute(allUVs, 2));
    }
    if (allUV1s.length > 0) {
      merged.setAttribute("uv1", new THREE.Float32BufferAttribute(allUV1s, 2));
    }

    merged.setIndex(allIndices);

    return merged;
  }

  /**
   * Setup the vatLookup attribute from UV data
   * OpenVAT uses a dedicated UV channel where U = vertex index / texture width
   * @param {THREE.BufferGeometry} geometry
   */
  _setupVATLookup(geometry) {
    // Try different UV channel names that OpenVAT might use
    // In FBX exports, the VAT_UV channel usually maps to uv1 or uv2
    const uvChannels = ["uv1", "uv2", "uv"];
    let vatUV = null;
    let channelName = "";

    for (const name of uvChannels) {
      if (geometry.attributes[name]) {
        const attr = geometry.attributes[name];
        // Check if this looks like a VAT UV (values should span 0-1 for vertex indexing)
        let minU = Infinity,
          maxU = -Infinity;
        for (let i = 0; i < Math.min(attr.count, 100); i++) {
          const u = attr.array[i * attr.itemSize];
          minU = Math.min(minU, u);
          maxU = Math.max(maxU, u);
        }
        console.log(
          `VAT: Checking ${name} - U range: ${minU.toFixed(
            4
          )} to ${maxU.toFixed(4)}`
        );

        // VAT UV should have values spanning a good portion of 0-1
        if (maxU > minU && maxU <= 1.0) {
          vatUV = attr;
          channelName = name;
          break;
        }
      }
    }

    if (!vatUV) {
      console.warn("VAT: No suitable UV channel found for VAT lookup");
      // Create a fallback based on vertex index
      this._createFallbackVATLookup(geometry);
      return;
    }

    console.log(`VAT: Using ${channelName} for VAT lookup`);

    // Create vatLookup attribute from the UV.x values
    const vertexCount = geometry.attributes.position.count;
    const vatLookup = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      // The U coordinate maps directly to the texture column
      vatLookup[i] = vatUV.array[i * vatUV.itemSize];
    }

    geometry.setAttribute("vatLookup", new THREE.BufferAttribute(vatLookup, 1));

    // Count unique values
    const uniqueValues = new Set(vatLookup);
    console.log(
      `VAT: Created vatLookup with ${uniqueValues.size} unique values for ${vertexCount} vertices`
    );
  }

  /**
   * Create fallback VAT lookup when no UV channel is found
   * This assumes vertices are ordered to match texture columns
   * @param {THREE.BufferGeometry} geometry
   */
  _createFallbackVATLookup(geometry) {
    const vertexCount = geometry.attributes.position.count;
    const vatLookup = new Float32Array(vertexCount);

    for (let i = 0; i < vertexCount; i++) {
      // Normalize vertex index to 0-1 range, sampling center of texel
      vatLookup[i] = (i + 0.5) / vertexCount;
    }

    geometry.setAttribute("vatLookup", new THREE.BufferAttribute(vatLookup, 1));
    console.log(`VAT: Created fallback vatLookup for ${vertexCount} vertices`);
  }

  /**
   * Load EXR texture with settings optimized for VAT lookup
   * @param {string} url
   * @returns {Promise<THREE.DataTexture>}
   */
  async loadEXR(url) {
    return new Promise((resolve, reject) => {
      this.exrLoader.load(
        url,
        (texture) => {
          // Critical: use NearestFilter to avoid interpolation between vertices
          texture.minFilter = THREE.NearestFilter;
          texture.magFilter = THREE.NearestFilter;
          texture.wrapS = THREE.ClampToEdgeWrapping;
          texture.wrapT = THREE.ClampToEdgeWrapping;

          // Prevent any color space conversions - we need raw values
          texture.colorSpace = THREE.NoColorSpace;

          // EXR files are top-to-bottom, flipY=false means V=0 is at top
          // We'll flip in shader to match OpenVAT convention
          texture.flipY = false;

          texture.needsUpdate = true;

          console.log(
            `VAT EXR: Loaded ${texture.image.width}x${texture.image.height}, flipY=${texture.flipY}`
          );
          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Load remap info JSON
   * OpenVAT format: { "os-remap": { "Min": [x,y,z], "Max": [x,y,z], "Frames": n } }
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async loadJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load JSON: ${url}`);
    }
    const data = await response.json();

    // Parse the OpenVAT remap info structure
    const osRemap = data["os-remap"];
    return {
      min: new THREE.Vector3(...osRemap.Min),
      max: new THREE.Vector3(...osRemap.Max),
      frames: osRemap.Frames,
    };
  }
}

// Singleton instance for convenience
export const vatLoader = new VATLoader();

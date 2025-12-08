import * as THREE from "three/webgpu";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { EXRLoader } from "three/addons/loaders/EXRLoader.js";

/**
 * Loads VAT (Vertex Animation Texture) assets.
 * Expects a base path like '/assets/scenes/meadow/flowers/roseNormal_vat/GNRose'
 * and will load:
 *   - {basePath}.fbx - the mesh
 *   - {basePath}_vat.exr - the vertex animation texture
 *   - {basePath}-remap_info.json - min/max bounds and frame count
 */
export class VATLoader {
  constructor() {
    this.fbxLoader = new FBXLoader();
    this.exrLoader = new EXRLoader();
  }

  /**
   * Load all VAT assets from a base path
   * @param {string} basePath - Base path without extension (e.g., '/assets/.../GNRose')
   * @returns {Promise<{geometry: THREE.BufferGeometry, vatTexture: THREE.DataTexture, remapInfo: Object, vertexCount: number}>}
   */
  async load(basePath) {
    const [fbxResult, vatTexture, remapInfo] = await Promise.all([
      this.loadFBX(`${basePath}.fbx`),
      this.loadEXR(`${basePath}_vat.exr`),
      this.loadJSON(`${basePath}-remap_info.json`),
    ]);

    // Add vertex count to remapInfo for material to know the total
    const geometry = fbxResult.geometry;
    
    // Calculate the actual vertex count used in the VAT texture
    // The texture width should match the number of unique vertices in the VAT
    const vatVertexCount = vatTexture.image.width;
    
    return {
      geometry,
      vatTexture,
      remapInfo: {
        ...remapInfo,
        vatVertexCount,
      },
    };
  }

  /**
   * Load FBX and extract ALL mesh geometries, merging them into one
   * Also creates a vatLookup attribute for proper VAT lookup
   * @param {string} url
   * @returns {Promise<{geometry: THREE.BufferGeometry}>}
   */
  async loadFBX(url) {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group) => {
          const meshes = [];

          group.traverse((child) => {
            if (child.isMesh) {
              console.log(`VAT: Found mesh "${child.name}" with ${child.geometry.attributes.position.count} vertices`);
              meshes.push(child);
            }
          });

          if (meshes.length === 0) {
            reject(new Error("No mesh found in FBX file"));
            return;
          }

          console.log(`VAT: Found ${meshes.length} mesh(es) in FBX`);

          let geometry;
          if (meshes.length === 1) {
            // Single mesh - use directly
            geometry = meshes[0].geometry;
          } else {
            // Multiple meshes - merge them
            geometry = this._mergeGeometries(meshes);
          }

          // Create vatLookup attribute based on UV1 values
          this._createVATIndexAttribute(geometry);

          resolve({ geometry });
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Merge multiple mesh geometries into one
   * @param {THREE.Mesh[]} meshes
   * @returns {THREE.BufferGeometry}
   */
  _mergeGeometries(meshes) {
    // Collect all geometries with their world transforms
    const geometries = meshes.map(mesh => {
      const geo = mesh.geometry.clone();
      
      // Apply mesh transform to geometry
      mesh.updateMatrixWorld(true);
      geo.applyMatrix4(mesh.matrixWorld);
      
      return geo;
    });

    // Use BufferGeometryUtils to merge
    const { mergeGeometries } = THREE.BufferGeometryUtils;
    if (mergeGeometries) {
      return mergeGeometries(geometries, false);
    }

    // Fallback: manual merge
    return this._manualMergeGeometries(geometries);
  }

  /**
   * Manually merge geometries if BufferGeometryUtils isn't available
   * @param {THREE.BufferGeometry[]} geometries
   * @returns {THREE.BufferGeometry}
   */
  _manualMergeGeometries(geometries) {
    const merged = new THREE.BufferGeometry();
    
    // Collect all attribute arrays
    const positions = [];
    const normals = [];
    const uvs = [];
    const uv1s = [];
    
    for (const geo of geometries) {
      const pos = geo.attributes.position;
      const norm = geo.attributes.normal;
      const uv = geo.attributes.uv;
      const uv1 = geo.attributes.uv1;
      
      for (let i = 0; i < pos.count; i++) {
        positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (norm) normals.push(norm.getX(i), norm.getY(i), norm.getZ(i));
        if (uv) uvs.push(uv.getX(i), uv.getY(i));
        if (uv1) uv1s.push(uv1.getX(i), uv1.getY(i));
      }
    }
    
    merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    if (normals.length > 0) merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    if (uvs.length > 0) merged.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    if (uv1s.length > 0) merged.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1s, 2));
    
    return merged;
  }

  /**
   * Create a vatLookup attribute that stores the correct U coordinate for VAT sampling
   * Uses the original UV1.x coordinates which map to specific texture columns
   * @param {THREE.BufferGeometry} geometry
   */
  _createVATIndexAttribute(geometry) {
    const uv1 = geometry.attributes.uv1;
    if (!uv1) {
      console.warn("VAT: No uv1 attribute found, VAT lookup may not work correctly");
      return;
    }

    const vertexCount = geometry.attributes.position.count;
    const vatLookup = new Float32Array(vertexCount);
    const uniqueUValues = new Set();
    
    for (let i = 0; i < vertexCount; i++) {
      const u = uv1.array[i * 2];
      vatLookup[i] = u;
      uniqueUValues.add(u);
    }
    
    geometry.setAttribute('vatLookup', new THREE.BufferAttribute(vatLookup, 1));
    geometry.userData.vatVertexCount = uniqueUValues.size;
    
    console.log(`VAT: Created vatLookup with ${uniqueUValues.size} unique U coordinates for ${vertexCount} vertices`);
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
          texture.needsUpdate = true;

          resolve(texture);
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Load remap info JSON
   * @param {string} url
   * @returns {Promise<Object>}
   */
  async loadJSON(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to load JSON: ${url}`);
    }
    const data = await response.json();

    // Parse the remap info structure
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


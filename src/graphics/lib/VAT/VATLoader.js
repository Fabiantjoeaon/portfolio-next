import * as THREE from "three/webgpu";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
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
    this.exrLoader = new EXRLoader();
  }

  /**
   * Load all VAT assets from a base path
   * @param {string} basePath - Base path without extension
   * @returns {Promise<{geometry: THREE.BufferGeometry, vatTexture: THREE.DataTexture, remapInfo: Object}>}
   */
  async load(basePath) {
    const [fbxResult, vatTexture, remapInfo] = await Promise.all([
      this.loadFBX(`${basePath}.fbx`),
      this.loadEXR(`${basePath}_vat.exr`),
      this.loadJSON(`${basePath}-remap_info.json`),
    ]);

    const geometry = fbxResult.geometry;
    
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
   * Load FBX and extract the mesh geometry
   * OpenVAT exports include a VAT_UV channel for texture lookup
   * @param {string} url
   * @returns {Promise<{geometry: THREE.BufferGeometry}>}
   */
  async loadFBX(url) {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group) => {
          let geometry = null;
          let totalVertices = 0;

          group.traverse((child) => {
            if (child.isMesh) {
              const geo = child.geometry;
              const vertCount = geo.attributes.position.count;
              totalVertices += vertCount;
              
              console.log(`VAT FBX: Found mesh "${child.name}"`);
              console.log(`  - Vertices: ${vertCount}`);
              console.log(`  - Attributes:`, Object.keys(geo.attributes));
              
              // Log UV channels
              for (const [name, attr] of Object.entries(geo.attributes)) {
                if (name.startsWith('uv')) {
                  console.log(`  - ${name}: itemSize=${attr.itemSize}, count=${attr.count}`);
                }
              }
              
              if (!geometry) {
                geometry = geo;
              }
            }
          });

          if (!geometry) {
            reject(new Error("No mesh found in FBX file"));
            return;
          }

          // Setup VAT lookup from the appropriate UV channel
          // OpenVAT stores VAT coordinates in UV channel (might be uv, uv1, or uv2)
          this._setupVATLookup(geometry);

          console.log(`VAT FBX: Total vertices loaded: ${totalVertices}`);
          resolve({ geometry });
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Setup the vatLookup attribute from UV data
   * OpenVAT uses a dedicated UV channel where U = vertex index / texture width
   * @param {THREE.BufferGeometry} geometry
   */
  _setupVATLookup(geometry) {
    // Try different UV channel names that OpenVAT might use
    // In FBX exports, the VAT_UV channel usually maps to uv1 or uv2
    const uvChannels = ['uv1', 'uv2', 'uv'];
    let vatUV = null;
    let channelName = '';
    
    for (const name of uvChannels) {
      if (geometry.attributes[name]) {
        const attr = geometry.attributes[name];
        // Check if this looks like a VAT UV (values should span 0-1 for vertex indexing)
        let minU = Infinity, maxU = -Infinity;
        for (let i = 0; i < Math.min(attr.count, 100); i++) {
          const u = attr.array[i * attr.itemSize];
          minU = Math.min(minU, u);
          maxU = Math.max(maxU, u);
        }
        console.log(`VAT: Checking ${name} - U range: ${minU.toFixed(4)} to ${maxU.toFixed(4)}`);
        
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
    
    geometry.setAttribute('vatLookup', new THREE.BufferAttribute(vatLookup, 1));
    
    // Count unique values
    const uniqueValues = new Set(vatLookup);
    console.log(`VAT: Created vatLookup with ${uniqueValues.size} unique values for ${vertexCount} vertices`);
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
    
    geometry.setAttribute('vatLookup', new THREE.BufferAttribute(vatLookup, 1));
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
          texture.needsUpdate = true;

          console.log(`VAT EXR: Loaded ${texture.image.width}x${texture.image.height}`);
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

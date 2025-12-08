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
   * Load FBX and extract the first mesh geometry
   * Also creates a vatIndex attribute for proper VAT lookup
   * @param {string} url
   * @returns {Promise<{geometry: THREE.BufferGeometry}>}
   */
  async loadFBX(url) {
    return new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (group) => {
          let geometry = null;

          group.traverse((child) => {
            if (child.isMesh && !geometry) {
              geometry = child.geometry;
            }
          });

          if (!geometry) {
            reject(new Error("No mesh found in FBX file"));
            return;
          }

          // Create vatIndex attribute based on unique UV1 values
          // This maps each vertex to its correct VAT texture column
          this._createVATIndexAttribute(geometry);

          resolve({ geometry });
        },
        undefined,
        reject
      );
    });
  }

  /**
   * Create a vatLookup attribute that stores the correct U coordinate for VAT sampling
   * This preserves the original UV1.x coordinates which map to specific texture columns
   * @param {THREE.BufferGeometry} geometry
   */
  _createVATIndexAttribute(geometry) {
    const uv1 = geometry.attributes.uv1;
    if (!uv1) {
      console.warn("VAT: No uv1 attribute found, VAT lookup may not work correctly");
      return;
    }

    const vertexCount = geometry.attributes.position.count;
    
    // The UV1.x values already contain the correct normalized U coordinates
    // for VAT texture sampling. We just need to copy them to a float attribute.
    // Multiple vertices may share the same U coordinate (expected for VAT).
    const vatLookup = new Float32Array(vertexCount);
    
    // Count unique values for logging
    const uniqueUValues = new Set();
    
    for (let i = 0; i < vertexCount; i++) {
      const u = uv1.array[i * 2];
      vatLookup[i] = u;
      uniqueUValues.add(u);
    }
    
    // Create the vatLookup attribute (stores normalized U coordinate directly)
    geometry.setAttribute('vatLookup', new THREE.BufferAttribute(vatLookup, 1));
    
    console.log(`VAT: Created vatLookup attribute with ${uniqueUValues.size} unique U coordinates for ${vertexCount} vertices`);
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


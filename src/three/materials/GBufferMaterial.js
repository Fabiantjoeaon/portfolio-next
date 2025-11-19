import * as THREE from "three";
import { color } from "three/tsl";
import { NodeMaterial } from "three/webgpu";

/**
 * Node-based GBuffer material writing to two color attachments:
 *  - [0] Albedo (unlit)
 *  - [1] View-space normals mapped to 0..1
 *
 * This material is intended to be assigned as scene.overrideMaterial
 * during the GBuffer pass.
 */
export function createGBufferMaterial(albedoHex = 0xffffff) {
  const material = new NodeMaterial();

  const albedoNode = color(new THREE.Color(albedoHex));
  material.colorNode = albedoNode;

  // Avoid depth write conflicts for transparency; use default opaque here.
  material.transparent = false;
  return material;
}

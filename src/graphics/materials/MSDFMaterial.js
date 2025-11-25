import * as THREE from "three/webgpu";
import {
  texture,
  uv,
  uniform,
  vec3,
  vec4,
  float,
  min,
  max,
  smoothstep,
  mul,
  add,
  attribute,
  positionLocal,
} from "three/tsl";
import { NodeMaterial } from "three/webgpu";

/**
 * MSDF (Multi-channel Signed Distance Field) Material for text rendering.
 * Uses TSL to implement the MSDF sampling algorithm for crisp text at any scale.
 */
export function createMSDFMaterial(msdfTexture, options = {}) {
  const material = new NodeMaterial();

  // Uniforms
  const colorUniform = uniform(new THREE.Color(options.color || 0xffffff));
  const opacityUniform = uniform(
    options.opacity !== undefined ? options.opacity : 1.0
  );
  const pixelScaleUniform = uniform(
    options.pixelScale !== undefined ? options.pixelScale : 1.0 / 512.0
  );

  // UV attribute (base quad UVs: 0,0 to 1,1)
  const uvNode = uv();

  // Instance attributes for per-character data
  // Each character instance has:
  // - instancePosition: world position offset (vec3)
  // - instanceScale: scale for character size (vec3)
  // - charUVOffset: UV offset into atlas (vec2)
  // - charUVScale: UV scale for character size (vec2)
  const instancePosition = attribute("instancePosition", "vec3");
  const instanceScale = attribute("instanceScale", "vec3");
  const charUVOffset = attribute("charUVOffset", "vec2");
  const charUVScale = attribute("charUVScale", "vec2");

  // Transform vertex position: scale the base quad, then translate
  const scaledPos = mul(positionLocal, instanceScale);
  const finalPos = add(scaledPos, instancePosition);
  material.positionNode = finalPos;

  // Calculate final UV by transforming base quad UV with character-specific atlas coords
  const finalUV = add(mul(uvNode, charUVScale), charUVOffset);

  // Sample MSDF texture
  const msdfSample = texture(msdfTexture, finalUV);

  // Implement MSDF median function: median(r, g, b)
  // median = max(min(r, g), min(max(r, g), b))
  const r = msdfSample.r;
  const g = msdfSample.g;
  const b = msdfSample.b;

  const minRG = min(r, g);
  const maxRG = max(r, g);
  const minMaxRGB = min(maxRG, b);
  const medianDist = max(minRG, minMaxRGB);

  // Apply smoothstep for anti-aliased edges
  // alpha = smoothstep(0.5 - pixelScale, 0.5 + pixelScale, distance)
  const threshold = float(0.5);
  const alphaNode = smoothstep(
    threshold.sub(pixelScaleUniform),
    threshold.add(pixelScaleUniform),
    medianDist
  );

  // Combine color and alpha
  material.colorNode = vec4(
    mul(vec3(colorUniform), opacityUniform),
    mul(alphaNode, opacityUniform)
  );

  // Enable transparency
  material.transparent = true;
  material.side = THREE.DoubleSide;
  material.depthWrite = false;

  // Store references for later updates
  material.userData.colorUniform = colorUniform;
  material.userData.opacityUniform = opacityUniform;
  material.userData.pixelScaleUniform = pixelScaleUniform;

  return material;
}

/**
 * Helper to update material color
 */
export function setMSDFColor(material, color) {
  if (material.userData.colorUniform) {
    if (color instanceof THREE.Color) {
      material.userData.colorUniform.value.copy(color);
    } else {
      material.userData.colorUniform.value.set(color);
    }
  }
}

/**
 * Helper to update material opacity
 */
export function setMSDFOpacity(material, opacity) {
  if (material.userData.opacityUniform) {
    material.userData.opacityUniform.value = opacity;
  }
}

/**
 * Helper to update pixel scale for sharpness control
 */
export function setMSDFPixelScale(material, pixelScale) {
  if (material.userData.pixelScaleUniform) {
    material.userData.pixelScaleUniform.value = pixelScale;
  }
}

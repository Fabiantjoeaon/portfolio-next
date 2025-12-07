import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  attribute,
  positionLocal,
  uniform,
  vec3,
  vec4,
  float,
  mul,
  add,
} from "three/tsl";

/**
 * Creates a rounded rectangle shape
 * @param {number} width - Width of rectangle
 * @param {number} height - Height of rectangle
 * @param {number} radius - Corner radius
 * @returns {THREE.Shape}
 */
function createRoundedRectShape(width, height, radius) {
  const shape = new THREE.Shape();
  const hw = width / 2;
  const hh = height / 2;
  const r = Math.min(radius, hw, hh);

  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.absarc(hw - r, -hh + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hh - r);
  shape.absarc(hw - r, hh - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hh);
  shape.absarc(-hw + r, hh - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hh + r);
  shape.absarc(-hw + r, -hh + r, r, Math.PI, Math.PI * 1.5, false);

  return shape;
}

/**
 * Creates the geometry for a single tile (rounded rectangle with depth)
 * @param {number} size - Size of the tile (width = height)
 * @param {number} radius - Corner radius
 * @param {number} depth - Extrusion depth (z-axis thickness)
 * @param {number} segments - Curve segments for corners
 * @param {Object} bevelOptions - Bevel configuration
 * @returns {THREE.ExtrudeGeometry}
 */
export function createTileGeometry(
  size = 1,
  radius = 0.1,
  depth = 0.1,
  segments = 4,
  bevelOptions = {}
) {
  const shape = createRoundedRectShape(size, size, radius);

  const extrudeSettings = {
    depth: depth,
    bevelEnabled: bevelOptions.enabled ?? true,
    bevelThickness: bevelOptions.thickness ?? depth * 0.15,
    bevelSize: bevelOptions.size ?? depth * 0.1,
    bevelOffset: bevelOptions.offset ?? 0,
    bevelSegments: bevelOptions.segments ?? 2,
    curveSegments: segments,
  };

  const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

  // Center the geometry along z-axis so it extrudes equally front/back
  geometry.translate(0, 0, -depth / 2);

  // Compute normals for proper lighting
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Creates a TSL NodeMaterial for the grid tiles
 * Accepts instance attributes for position, offset, scale, and color
 * @param {Object} options - Material options
 * @returns {NodeMaterial}
 */
export function createTileMaterial(options = {}) {
  const material = new NodeMaterial();

  // Uniforms for global control
  const baseColorUniform = uniform(new THREE.Color(options.color || 0xffffff));
  const opacityUniform = uniform(options.opacity ?? 1.0);

  // Instance attributes - these will be set by the InstancedMesh
  // instancePosition: base grid position (vec3)
  const instancePosition = attribute("instancePosition", "vec3");
  // instanceOffset: computed offset from compute shader (vec3)
  const instanceOffset = attribute("instanceOffset", "vec3");
  // instanceScale: computed scale from compute shader (float)
  const instanceScale = attribute("instanceScale", "float");
  // instanceColor: per-tile color tint (vec4) - for extensibility
  const instanceColor = attribute("instanceColor", "vec4");

  // Vertex position: scale local position, then add base position and offset
  const scaledPos = mul(positionLocal, instanceScale);
  const finalPos = add(add(scaledPos, instancePosition), instanceOffset);
  material.positionNode = finalPos;

  // Fragment output: blend base color with instance color
  const finalColor = mul(vec3(baseColorUniform), instanceColor.xyz);
  const finalAlpha = mul(opacityUniform, instanceColor.w);
  material.colorNode = vec4(finalColor, finalAlpha);

  // Material settings
  material.transparent = true;
  material.side = THREE.DoubleSide;
  material.depthWrite = options.depthWrite ?? true;

  // Store uniforms for external access
  material.uniforms = {
    baseColor: baseColorUniform,
    opacity: opacityUniform,
  };

  return material;
}

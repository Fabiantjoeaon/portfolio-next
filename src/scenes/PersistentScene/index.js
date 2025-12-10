import * as THREE from "three/webgpu";
import { NodeMaterial } from "three/webgpu";
import {
  uniform,
  uv,
  vec3,
  vec4,
  float,
  sin,
  cos,
  mix,
  time,
  Fn,
} from "three/tsl";
import { Grid } from "./Grid/index.js";
import { GBuffer } from "../../graphics/GBuffer.js";

/**
 * Manages objects that persist across all scenes.
 * These objects are rendered into their own gbuffer and composited
 * with depth testing to maintain proper occlusion.
 */
export default class PersistentScene {
  /**
   * @param {THREE.WebGPURenderer} renderer - WebGPU renderer for compute shaders
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   * @param {number} devicePixelRatio - Device pixel ratio
   */
  constructor(renderer, width, height, devicePixelRatio = 1) {
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.testObject = null;
    this.gbuffer = new GBuffer(width, height, devicePixelRatio);
    this.grid = null;
    this.backgroundPlane = null;

    // Add lighting to the persistent scene
    // this._setupLighting();

    // Initialize background plane
    this._setupBackground();

    // Initialize grid
    this._setupGrid();
  }

  /**
   * Setup the GPU-driven grid
   */
  _setupGrid() {
    this.grid = new Grid({
      size: 16, // Number of columns (rows auto-calculated from aspect ratio)
      gap: 0.37,
      cornerRadius: 0.12,
      depth: 0.08,
      bevel: {
        enabled: true,
        thickness: 0.1,
        size: 0.085,
        segments: 1,
      },
      color: 0xffffff,
      opacity: 1,
      renderer: this.renderer,
      position: new THREE.Vector3(0, 0, -5), // Behind other content
    });

    // Update background plane when grid rebuilds
    this.grid.onRebuild((dimensions) => {
      this._updateBackgroundSize(dimensions);
    });

    // Initial background size update
    this._updateBackgroundSize(this.grid.getDimensions());

    this.scene.add(this.grid);
  }

  /**
   * Setup the animated gradient background plane
   */
  _setupBackground() {
    // Create plane geometry (will be scaled to match grid)
    const geometry = new THREE.PlaneGeometry(1, 1);

    // Create material with animated gradient shader
    const material = new NodeMaterial();

    // Gradient colors - can be customized
    const color1 = uniform(new THREE.Color(0x1a1a2e)); // Deep blue-purple
    const color2 = uniform(new THREE.Color(0x16213e)); // Dark navy
    const color3 = uniform(new THREE.Color(0x0f3460)); // Midnight blue
    const speed = uniform(0.3);

    material.colorNode = Fn(() => {
      const uvCoord = uv();

      // Create animated wave pattern
      const wave1 = sin(uvCoord.y.mul(3.0).add(time.mul(speed)))
        .mul(0.5)
        .add(0.5);
      const wave2 = cos(uvCoord.x.mul(2.0).sub(time.mul(speed.mul(0.7))))
        .mul(0.5)
        .add(0.5);

      // Combine waves for organic movement
      const blend = wave1.mul(0.6).add(wave2.mul(0.4));

      // Create diagonal gradient base
      const diagonal = uvCoord.x.add(uvCoord.y).mul(0.5);

      // Mix colors based on position and animation
      const mixedColor1 = mix(vec3(color1), vec3(color2), diagonal);
      const mixedColor2 = mix(vec3(color2), vec3(color3), blend);
      const finalColor = mix(
        mixedColor1,
        mixedColor2,
        blend.mul(0.5).add(0.25)
      );

      return vec4(finalColor, float(1.0));
    })();

    material.side = THREE.DoubleSide;

    // Store uniforms for external access
    material.uniforms = {
      color1,
      color2,
      color3,
      speed,
    };

    this.backgroundPlane = new THREE.Mesh(geometry, material);
    this.backgroundPlane.position.z = -6.5; // Behind the grid (grid is at z=-5)
    this.scene.add(this.backgroundPlane);
  }

  /**
   * Update background plane to match grid dimensions
   * @param {{ width: number, height: number }} dimensions - Grid dimensions
   * @param {number} padding - Extra padding around the grid
   */
  _updateBackgroundSize(dimensions, padding = 1.3) {
    if (!this.backgroundPlane || !dimensions) return;

    const { width, height } = dimensions;
    this.backgroundPlane.scale.set(
      width + padding * 2,
      height + padding * 2,
      1
    );
  }

  /**
   * Add an object to the persistent scene
   */
  add(object) {
    this.scene.add(object);
  }

  /**
   * Remove an object from the persistent scene
   */
  remove(object) {
    this.scene.remove(object);
  }

  /**
   * Clear all objects from the persistent scene
   */
  clear() {
    this.scene.clear();
  }

  /**
   * Check if the persistent scene is empty
   */
  isEmpty() {
    return this.scene.children.length === 0;
  }

  /**
   * Sync the persistent camera with a source camera
   * Copies all camera properties to match the active scene's view.
   * For objects to stay in world space, position them relative to camera.
   * @param {THREE.Camera} sourceCamera - Camera to copy properties from
   */
  // syncCamera(sourceCamera) {
  //   this.camera.position.copy(sourceCamera.position);
  //   this.camera.quaternion.copy(sourceCamera.quaternion);
  //   this.camera.fov = sourceCamera.fov;
  //   this.camera.aspect = sourceCamera.aspect;
  //   this.camera.near = sourceCamera.near;
  //   this.camera.far = sourceCamera.far;
  //   this.camera.updateProjectionMatrix();
  // }

  /**
   * Update the camera aspect ratio
   * @param {number} aspect - New aspect ratio
   */
  updateCameraAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  async update(time, delta) {
    if (this.testObject) {
      this.testObject.rotation.x = time * 0.0005;
      this.testObject.rotation.y = time * 0.001;
    }

    // Update grid compute shader
    if (this.grid) {
      await this.grid.update(time, delta);
    }
  }

  /**
   * Get the grid instance for external configuration
   * @returns {Grid}
   */
  getGrid() {
    return this.grid;
  }

  /**
   * Set the scene texture for glass effect sampling
   * @param {THREE.Texture} texture - The active scene's albedo texture
   */
  setSceneTexture(texture) {
    if (this.grid) {
      this.grid.setSceneTexture(texture);
    }
  }

  /**
   * Get the background plane for external configuration
   * @returns {THREE.Mesh}
   */
  getBackgroundPlane() {
    return this.backgroundPlane;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (this.grid) {
      this.grid.dispose();
      this.grid = null;
    }
    if (this.backgroundPlane) {
      this.backgroundPlane.geometry.dispose();
      this.backgroundPlane.material.dispose();
      this.scene.remove(this.backgroundPlane);
      this.backgroundPlane = null;
    }
    if (this.gbuffer) {
      this.gbuffer.dispose();
      this.gbuffer = null;
    }
  }
}

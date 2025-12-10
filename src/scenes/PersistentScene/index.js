import * as THREE from "three/webgpu";
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
    //this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.testObject = null;
    this.gbuffer = new GBuffer(width, height, devicePixelRatio);
    this.grid = null;

    // Add lighting to the persistent scene
    this._setupLighting();

    // Initialize grid
    this._setupGrid();
  }

  /**
   * Setup the GPU-driven grid
   */
  _setupGrid() {
    this.grid = new Grid({
      tileSize: 0.8,
      gap: 0.35,
      cornerRadius: 0.12,
      depth: 0.08,
      bevel: {
        enabled: true,
        thickness: 0.1,
        size: 0.085,
        // Determines soft/smoothness
        segments: 1,
      },
      color: 0xffffff,
      opacity: 1,
      renderer: this.renderer,
      position: new THREE.Vector3(0, 0, -5), // Behind other content
    });

    this.scene.add(this.grid);
  }

  /**
   * Setup basic lighting for the persistent scene
   */
  _setupLighting() {
    // Add ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambientLight);

    // Add directional light for depth
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 5, 5);
    this.scene.add(directionalLight);
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
   * Dispose of all resources
   */
  dispose() {
    if (this.grid) {
      this.grid.dispose();
      this.grid = null;
    }
    if (this.gbuffer) {
      this.gbuffer.dispose();
      this.gbuffer = null;
    }
  }
}

import * as THREE from "three/webgpu";

/**
 * Manages objects that persist across all scenes.
 * These objects are rendered into their own gbuffer and composited
 * with depth testing to maintain proper occlusion.
 */
export default class PersistentScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.testObject = null;
    this.gbuffer = null;

    // Add lighting to the persistent scene
    this._setupLighting();
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
  syncCamera(sourceCamera) {
    this.camera.position.copy(sourceCamera.position);
    this.camera.quaternion.copy(sourceCamera.quaternion);
    this.camera.fov = sourceCamera.fov;
    this.camera.aspect = sourceCamera.aspect;
    this.camera.near = sourceCamera.near;
    this.camera.far = sourceCamera.far;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update the camera aspect ratio
   * @param {number} aspect - New aspect ratio
   */
  updateCameraAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Initialize the gbuffer for persistent scene rendering
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   * @param {number} devicePixelRatio - Device pixel ratio
   */
  initGBuffer(width, height, devicePixelRatio, createGBuffer) {
    this.gbuffer = createGBuffer(width, height, devicePixelRatio);
  }

  /**
   * Resize the gbuffer
   * @param {number} width - New viewport width
   * @param {number} height - New viewport height
   * @param {number} devicePixelRatio - Device pixel ratio
   */
  resizeGBuffer(width, height, devicePixelRatio, resizeGBuffer) {
    if (this.gbuffer) {
      this.gbuffer = resizeGBuffer(
        this.gbuffer,
        width,
        height,
        devicePixelRatio
      );
    }
  }

  update(time) {
    if (this.testObject) {
      this.testObject.rotation.x = time * 0.0005;
      this.testObject.rotation.y = time * 0.001;
    }
  }
}

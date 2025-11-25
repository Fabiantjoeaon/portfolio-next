import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { easeInOutCubic } from "../lib/easing.js";

/**
 * Manages a shared camera instance with state interpolation.
 * Handles smooth transitions between scene-specific camera states.
 * Optionally enables OrbitControls in debug mode.
 */
export class CameraController {
  constructor(renderer, debug = false) {
    // Create the shared camera instance
    this.camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
    this.camera.position.set(0, 0, 5);

    this.debug = debug;
    this.controls = null;

    // Camera state tracking
    this.currentState = {
      position: new THREE.Vector3().copy(this.camera.position),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: this.camera.fov,
    };

    this.targetState = {
      position: new THREE.Vector3().copy(this.camera.position),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: this.camera.fov,
    };

    // Initialize OrbitControls if in debug mode
    if (debug && renderer) {
      this.controls = new OrbitControls(this.camera, renderer.domElement);
      this.controls.enableDamping = true;
      this.controls.dampingFactor = 0.05;
      this.controls.target.copy(this.currentState.lookAt);
    }
  }

  /**
   * Set the target camera state (from scene configuration)
   * @param {Object} state - { position: Vector3, lookAt: Vector3, fov: number }
   */
  setTargetState(state) {
    if (state.position) {
      this.targetState.position.copy(state.position);
    }
    if (state.lookAt) {
      this.targetState.lookAt.copy(state.lookAt);
    }
    if (state.fov !== undefined) {
      this.targetState.fov = state.fov;
    }
  }

  /**
   * Snap camera to target state immediately (no interpolation)
   */
  snapToTarget() {
    this.currentState.position.copy(this.targetState.position);
    this.currentState.lookAt.copy(this.targetState.lookAt);
    this.currentState.fov = this.targetState.fov;

    this.camera.position.copy(this.currentState.position);
    this.camera.lookAt(this.currentState.lookAt);
    this.camera.fov = this.currentState.fov;
    this.camera.updateProjectionMatrix();

    if (this.controls) {
      this.controls.target.copy(this.currentState.lookAt);
      this.controls.update();
    }
  }

  /**
   * Update camera state with interpolation
   * @param {number} transitionProgress - 0 to 1, where 0 is current state and 1 is target state
   */
  update(transitionProgress = 0) {
    // If orbit controls are enabled and active, let them control the camera
    if (this.controls && this.debug) {
      this.controls.update();
      // Update current state to match controls
      this.currentState.position.copy(this.camera.position);
      this.currentState.lookAt.copy(this.controls.target);
      return;
    }

    // Interpolate between current and target state
    const t = THREE.MathUtils.clamp(transitionProgress, 0, 1);

    // Smooth interpolation using easing
    const eased = easeInOutCubic(t);

    // Interpolate position
    this.currentState.position.lerp(this.targetState.position, eased);
    this.camera.position.copy(this.currentState.position);

    // Interpolate lookAt
    this.currentState.lookAt.lerp(this.targetState.lookAt, eased);
    this.camera.lookAt(this.currentState.lookAt);

    // Interpolate FOV
    this.currentState.fov = THREE.MathUtils.lerp(
      this.currentState.fov,
      this.targetState.fov,
      eased
    );
    this.camera.fov = this.currentState.fov;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Update camera aspect ratio
   */
  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * Dispose of resources
   */
  dispose() {
    if (this.controls) {
      this.controls.dispose();
    }
  }
}

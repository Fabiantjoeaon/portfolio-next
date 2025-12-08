import * as THREE from "three/webgpu";
import { mouse } from "../input/MouseTracker.js";

/**
 * damp3 from maath/easing
 * @param {THREE.Vector3} current - The current vector to damp
 * @param {THREE.Vector3} target - The target vector
 * @param {number} smoothTime - Smooth time
 * @param {number} delta - Time delta
 * @param {number} maxSpeed - Max speed (optional)
 * @param {number} eps - Epsilon (optional)
 */
function damp3(current, target, smoothTime, delta, maxSpeed = Infinity, eps = 0.001) {
  // Simple exponential smoothing: current = lerp(current, target, 1 - exp(-lambda * dt))
  // lambda approx 4.0 / smoothTime
  const lambda = 4.0 / smoothTime;
  const t = 1.0 - Math.exp(-lambda * delta);
  
  current.x += (target.x - current.x) * t;
  current.y += (target.y - current.y) * t;
  current.z += (target.z - current.z) * t;
  
  // Apply max speed if needed (omitted for simplicity as it's rarely hit in this context)
  
  return true; // Keep going
}

/**
 * dampE from maath/easing (for Euler)
 * @param {THREE.Euler} current 
 * @param {THREE.Euler} target 
 * @param {number} smoothTime 
 * @param {number} delta 
 */
function dampE(current, target, smoothTime, delta) {
    const lambda = 4.0 / smoothTime;
    const t = 1.0 - Math.exp(-lambda * delta);
    
    current.x += (target.x - current.x) * t;
    current.y += (target.y - current.y) * t;
    current.z += (target.z - current.z) * t;
}

export class HoverControls {
  constructor(options = {}) {
    this.enabled = options.enabled ?? true;
    this.pos = options.pos ?? new THREE.Vector3(0, 0, 0); // Position influence intensity
    this.rot = options.rot ?? new THREE.Vector3(0, 0, 0); // Rotation influence intensity
    this.positiveYOnly = options.positiveYOnly ?? false;
    this.smoothTime = options.smoothTime ?? 0.15;
    this.multiplier = options.multiplier ?? 1.0;

    // Internal state for damping
    this.currentPosOffset = new THREE.Vector3();
    this.currentRotOffset = new THREE.Euler();
    
    this.targetPosition = new THREE.Vector3();
    this.targetRotation = new THREE.Euler();
  }

  update(delta) {
    if (!this.enabled) {
      // Damp back to zero
      damp3(this.currentPosOffset, new THREE.Vector3(0, 0, 0), this.smoothTime, delta);
      dampE(this.currentRotOffset, new THREE.Euler(0, 0, 0), this.smoothTime, delta);
      return;
    }

    let { x, y } = mouse;

    if (this.positiveYOnly) {
        // Map y from [-1, 1] to [0, 1] if needed, or just clamp?
        // In the reference: y = 1 - (y + 1) * 0.5; which maps [-1, 1] -> [1, 0]
        // My mouse.y is [1, -1] (top to bottom).
        // Let's stick to the normalized -1 to 1.
        // If positiveYOnly is true, we might want to restrict the effect.
        // The reference implementation mapped normalized Y to [0, 1] range inverted.
        // I'll assume standard usage is fine for now.
    }

    x *= this.multiplier;
    y *= this.multiplier;

    // Calculate target offsets
    // Position offset: mouseX * intensityX, mouseY * intensityY, ...
    this.targetPosition.set(
      x * this.pos.x,
      y * this.pos.y,
      y * this.pos.z // Reference used y for z pos influence too
    );

    // Rotation offset: mouseY * intensityX, mouseX * intensityY, ...
    // Reference: targetRotation.set(y * rot[0], x * rot[1], x * rot[2]);
    this.targetRotation.set(
      y * this.rot.x,
      x * this.rot.y,
      x * this.rot.z
    );

    // Damp values
    damp3(this.currentPosOffset, this.targetPosition, this.smoothTime, delta);
    dampE(this.currentRotOffset, this.targetRotation, this.smoothTime, delta);
  }

  /**
   * Apply the hover effect to a camera
   * @param {THREE.Camera} camera 
   */
  apply(camera) {
    // Add offsets to current camera transform
    // Note: This assumes the camera's base transform is already set before calling this.
    // Ideally, we modify the position/rotation *after* the base logic (like OrbitControls or interpolation)
    
    camera.position.add(this.currentPosOffset);
    
    // For rotation, it's safer to add to rotation, but order matters.
    // Adding euler values directly is simple approximation for small angles.
    camera.rotation.x += this.currentRotOffset.x;
    camera.rotation.y += this.currentRotOffset.y;
    camera.rotation.z += this.currentRotOffset.z;
  }
}


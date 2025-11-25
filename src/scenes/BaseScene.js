import * as THREE from "three/webgpu";

export class BaseScene {
  constructor(config = {}) {
    this.name = config.name || "BaseScene";
    this.scene = new THREE.Scene();

    // Define camera state instead of creating a camera instance
    // Subclasses should override this to define their camera viewpoint
    this.cameraState = {
      position: new THREE.Vector3(0, 0, 5),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };
  }

  update() {
    // Override in subclasses to update scene content
  }
}

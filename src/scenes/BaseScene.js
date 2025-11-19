import * as THREE from "three/webgpu";

export class BaseScene {
  constructor(name) {
    this.name = name;
    this.scene = new THREE.Scene();
    this.camera = null;
  }

  // controls?

  update() {}
}

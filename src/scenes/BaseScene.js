import * as THREE from "three";

export class BaseScene {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = null;
  }

  update() {}
}

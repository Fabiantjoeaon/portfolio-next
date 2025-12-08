import * as THREE from "three/webgpu";

import { SwipeTransition } from "../graphics/transitions/SwipeTransition.js";

export default class BaseScene {
  constructor(config = {}) {
    this.name = config.name || "BaseScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 0, 25),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 100,
    };
    this.transition = new SwipeTransition();
  }

  update(time, delta) {
    // TODO:
  }
}

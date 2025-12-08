import * as THREE from "three/webgpu";
import BaseScene from "./BaseScene.js";
import { SwipeTransition } from "../graphics/transitions/SwipeTransition.js";
import { colorGrade } from "../graphics/postprocessing/index.js";

export default class TestScene extends BaseScene {
  constructor(config) {
    super();
    this.scene.background = new THREE.Color(0x0b0e12);
    this.transition = new SwipeTransition();

    // Example per-scene post chain:
    // - Warmer tint
    // this.postprocessingChain = [
    //   (color, context) =>
    //     colorGrade(color, {
    //       ...context,
    //       tint: [1.1, 0.95, 0.9],
    //       intensity: 0.2,
    //     }),
    // ];

    // Define camera state for this scene
    this.cameraState = {
      position: new THREE.Vector3(0, 0, 10),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };
  }

  update(time, delta) {
    super.update();
  }
}

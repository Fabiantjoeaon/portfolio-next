import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export class BaseScene {
  constructor(config = {}) {
    this.name = config.name || "BaseScene";
    this.scene = new THREE.Scene();

    const { innerWidth, innerHeight } = window;

    this.camera = new THREE.PerspectiveCamera(
      60,
      innerWidth / innerHeight,
      0.1,
      1000
    );

    // Initialize OrbitControls
    this.controls = null;
    const domElement = document.querySelector("#app-canvas");

    this.controls = new OrbitControls(this.camera, domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
  }

  update() {
    if (this.controls) {
      this.controls.update();
    }
  }

  // resize() {
  //   this.camera.aspect = window.innerWidth / window.innerHeight;
  //   this.camera.updateProjectionMatrix();
  // }
}

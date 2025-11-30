import BaseScene from "./BaseScene";
import * as THREE from "three/webgpu";

export default class SequenceScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "SequenceScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(3, 2, 8),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 60,
    };

    this.init();
  }

  init() {
    this.scene.background = new THREE.Color(0x0000ff);
    this.scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xff0000 })
      )
    );
  }

  update() {
    // TODO:
  }
}

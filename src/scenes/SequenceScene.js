import BaseScene from "./BaseScene";
import * as THREE from "three/webgpu";
import { color } from "three/tsl";

export default class SequenceScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "SequenceScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 0, 15),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 60,
    };

    this.init();

    this.scene.background = new THREE.Color(0x0000ff);
    this.scene.backgroundNode = color(0x0000ff);
  }

  init() {
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

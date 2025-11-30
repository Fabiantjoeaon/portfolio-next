import BaseScene from "./BaseScene";
import * as THREE from "three/webgpu";

export default class MeadowScene extends BaseScene {
  constructor(config = {}) {
    super(config);
    this.name = config.name || "MeadowScene";
    this.scene = new THREE.Scene();

    this.cameraState = {
      position: new THREE.Vector3(0, 0, 10),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 80,
    };

    this.init();

    this.scene.background = new THREE.Color(0x00ff00);
  }

  init() {
    this.scene.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1),
        new THREE.MeshBasicMaterial({ color: 0xffff00 })
      )
    );
  }

  update() {
    // TODO:
  }
}

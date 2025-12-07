import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
// import { WaterFloor } from "./WaterFloor.js";

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

    this.waterFloor = null;

    this.init();

    this.scene.background = new THREE.Color(0x00ff00);
  }

  init() {
    // // Create water floor
    // this.waterFloor = new WaterFloor({
    //   width: 100,
    //   height: 100,
    //   segments: 64,
    //   positionY: -3,
    //   waveAmplitude: 0.2,
    //   waveFrequency: 1.5,
    //   waveSpeed: 0.8,
    //   opacity: 0.7,
    //   reflectionStrength: 0.5,
    //   waterColor: 0x1a5a7a,
    // });

    this.scene.add(this.waterFloor);

    // Add basic lighting for the water to be visible
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
  }

  update(time) {
    // if (this.waterFloor) {
    //   this.waterFloor.update(time);
    // }
  }
}

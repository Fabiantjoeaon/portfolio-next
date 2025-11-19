import * as THREE from "three/webgpu";
import { BaseScene } from "./BaseScene.js";

export class TestScene extends BaseScene {
  constructor(controls) {
    super();
    this.scene.background = new THREE.Color(0x0b0e12);

    const { innerWidth, innerHeight } = window;
    this.camera = new THREE.PerspectiveCamera(
      60,
      innerWidth / innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(3, 2, 5);
    this.camera.lookAt(0, 0, 0);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(
      0xffffff,
      controls?.lightIntensity ?? 1.0
    );
    this.directionalLight.position.set(5, 10, 7.5);
    this.scene.add(this.directionalLight);

    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(controls?.color ?? 0x6ee7b7),
      roughness: 0.35,
      metalness: 0.1,
    });
    this.cube = new THREE.Mesh(geometry, material);
    this.scene.add(this.cube);
    this.albedoHex = material.color.getHex();

    const grid = new THREE.GridHelper(10, 10, 0x334155, 0x1f2937);
    this.scene.add(grid);

    this.rotateX = controls?.rotateX ?? 0.6;
    this.rotateY = controls?.rotateY ?? 0.9;
  }

  update(elapsedMs) {
    const t = elapsedMs * 0.001;
    this.cube.rotation.x = t * this.rotateX;
    this.cube.rotation.y = t * this.rotateY;
  }
}

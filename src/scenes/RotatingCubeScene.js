import * as THREE from "three/webgpu";
import { BaseScene } from "./BaseScene.js";
import { FadeTransition } from "../graphics/transitions/FadeTransition.js";
import { MSDFText } from "../graphics/lib/MSDFText/index.js";

export class RotatingCubeScene extends BaseScene {
  constructor(controls) {
    super();
    this.scene.background = new THREE.Color(0x0b0e12);
    this.transition = new FadeTransition();

    // Define camera state for this scene
    this.cameraState = {
      position: new THREE.Vector3(3, 2, 5),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };

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
      color: new THREE.Color(0x00ff00),
      roughness: 0.35,
      metalness: 0.1,
    });
    this.cube = new THREE.Mesh(geometry, material);
    this.scene.add(this.cube);

    const grid = new THREE.GridHelper(10, 10, 0x334155, 0x1f2937);
    this.scene.add(grid);

    this.rotateX = controls?.rotateX ?? 0.6;
    this.rotateY = controls?.rotateY ?? 0.9;

    this.loadText();
  }

  async loadText() {
    this.textObject = await MSDFText.load(
      "/assets/fonts/msdf/kenpixel/kenpixel-msdf.json",
      {
        color: 0xfff,
        opacity: 1.0,
        pixelScale: 0.008,
      }
    );

    this.textObject.setText("HELLO WORLD", { centered: true });
    this.textObject.mesh.position.set(0, 2, 0);
    this.textObject.mesh.scale.setScalar(0.01);
    this.scene.add(this.textObject.mesh);
  }

  update(elapsedMs) {
    super.update();
    const t = elapsedMs * 0.001;
    this.cube.rotation.x = t * this.rotateX;
    this.cube.rotation.y = t * this.rotateY;
  }
}

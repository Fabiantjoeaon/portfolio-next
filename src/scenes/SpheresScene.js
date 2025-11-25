import * as THREE from "three/webgpu";
import { BaseScene } from "./BaseScene.js";
import { SwipeTransition } from "../graphics/transitions/SwipeTransition.js";
import { colorGrade } from "../graphics/postprocessing/index.js";

export class SpheresScene extends BaseScene {
  constructor(controls) {
    super();
    this.scene.background = new THREE.Color(0x0b0e12);
    this.transition = new SwipeTransition();

    // Example per-scene post chain:
    // - Warmer tint
    this.postprocessingChain = [
      (color, context) =>
        colorGrade(color, {
          ...context,
          tint: [1.1, 0.95, 0.9],
          intensity: 0.2,
        }),
    ];

    // Define camera state for this scene
    this.cameraState = {
      position: new THREE.Vector3(4, 3, 7),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
    this.scene.add(this.ambientLight);

    this.directionalLight = new THREE.DirectionalLight(
      0xffffff,
      controls?.lightIntensity ?? 1.1
    );
    this.directionalLight.position.set(6, 8, 5);
    this.scene.add(this.directionalLight);

    const group = new THREE.Group();
    const palette = [0xf97316, 0x22d3ee, 0xa78bfa];
    const geo = new THREE.SphereGeometry(0.6, 32, 32);
    for (let i = 0; i < 9; i++) {
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(palette[i % palette.length]),
        roughness: 0.4,
        metalness: 0.2,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set((i % 3) * 2 - 2, Math.floor(i / 3) * 2 - 2, 0);
      group.add(mesh);
    }
    this.scene.add(group);

    this.group = group;
    this.rotateX = controls?.rotateX ?? 0.2;
    this.rotateY = controls?.rotateY ?? 0.35;
  }

  update(elapsedMs) {
    super.update();
    const t = elapsedMs * 0.001;
    this.group.rotation.x = t * this.rotateX;
    this.group.rotation.y = t * this.rotateY;
  }
}

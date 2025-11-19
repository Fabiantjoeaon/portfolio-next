import * as THREE from "three";
import { fsTriangle } from "../lib/utils.js";

export class PostProcessingScene {
  constructor(material) {
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = fsTriangle;
    this.quad = new THREE.Mesh(geometry, material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  setMaterial(mat) {
    this.quad.material = mat;
  }
}

import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { WaterWithReflection } from "./WaterWithReflection.js";

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

    this.water = null;

    this.init();

    // Set both background (for clear color) and backgroundNode (for WebGPU rendering)
    this.scene.background = new THREE.Color(0xaaaaaa);
  }

  init() {
    // Create water plane geometry
    const waterGeometry = new THREE.PlaneGeometry(200, 200);

    // Load water normals texture
    const loader = new THREE.TextureLoader();
    const waterNormals = loader.load(
      "/assets/textures/waternormals.jpg",
      (texture) => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      }
    );

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(3, 3, 3),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    this.cube.position.x = -20;
    this.cube.position.y = -10;
    this.scene.add(this.cube);

    // Create custom water with external reflection support
    this.water = new WaterWithReflection(waterGeometry, {
      waterNormals,
      sunDirection: new THREE.Vector3(5, 10, 5).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 3.7,
      alpha: 0.9,
      externalReflectionStrength: 0.7,
    });

    // Position as horizontal floor
    this.water.position.y = -20;
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
  }

  /**
   * Set the persistent scene's gbuffer for use in effects
   * @param {GBuffer} gbuffer - The persistent scene's gbuffer
   */
  setPersistentBuffer(gbuffer) {
    if (this.water) {
      this.water.setExternalReflection(gbuffer.albedo);
    }
  }

  update(time, delta) {
    // Scene update logic
    this.cube.position.x = Math.sin(time * 0.001) * 20;
  }
}

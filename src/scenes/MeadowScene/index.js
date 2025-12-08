import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { WaterMesh } from "three/addons/objects/WaterMesh.js";

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

    // Create WaterMesh with reflective water effect
    this.water = new WaterMesh(waterGeometry, {
      waterNormals,
      sunDirection: new THREE.Vector3(5, 10, 5).normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 3.7,
      alpha: 0.9,
    });

    // Position behind the persistent grid (which is at z=-5)
    // this.water.position.z = -6;
    this.water.position.y = -8;
    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // Add basic lighting for the water to be visible
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
  }

  update(time, delta) {
    // WaterMesh animates automatically via TSL time node
  }
}

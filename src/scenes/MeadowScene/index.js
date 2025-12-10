import BaseScene from "../BaseScene.js";
import * as THREE from "three/webgpu";
import { WaterWithReflection } from "./WaterWithReflection.js";
import { GROUND_Y } from "../../graphics/SceneManager.js";

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
      waterColor: 0x629eda,
      distortionScale: 1.7,
      alpha: 1,
      externalReflectionStrength: 0.7,
    });

    // Position as horizontal floor
    this.water.position.y = GROUND_Y;

    this.water.rotation.x = -Math.PI / 2;
    this.scene.add(this.water);

    // Add basic lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 5);
    this.scene.add(directionalLight);
  }

  setPersistentScene(renderer, persistentScene, camera, viewport, screenScene) {
    if (!this.water) return;

    // Need at least one scene to reflect
    const hasContent =
      persistentScene?.children?.length > 0 ||
      screenScene?.children?.length > 0;
    if (!hasContent) return;

    if (!this._externalSceneInitialized) {
      const { width, height, devicePixelRatio } = viewport;
      const w = Math.round(width * devicePixelRatio * 0.5);
      const h = Math.round(height * devicePixelRatio * 0.5);
      // Pass both scenes - water will render them both
      this.water.setExternalScenes(
        renderer,
        persistentScene,
        screenScene,
        w,
        h
      );
      this._externalSceneInitialized = true;
    }

    this.water.renderExternalReflection(camera);
  }

  update(time, delta) {
    // Scene update logic
    this.cube.position.x = Math.sin(time * 0.001) * 20;
  }
}

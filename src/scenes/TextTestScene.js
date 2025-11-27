import { BaseScene } from "./BaseScene.js";
import { Text } from "../graphics/lib/Text/index.js";
import * as THREE from "three";
import { FadeTransition } from "../graphics/transitions/FadeTransition.js";

/**
 * Test scene for the WebGPU/TSL Text implementation
 */
export default class TextTestScene extends BaseScene {
  constructor(config) {
    super(config);
    this.name = "Text Test";
    this.textMesh = null;

    this.transition = new FadeTransition();

    // Set a dark background to see white text
    this.scene.background = new THREE.Color(0x202020); // Dark gray background

    // Define camera state for this scene - matching RotatingCubeScene
    this.cameraState = {
      position: new THREE.Vector3(0, 0, 5),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    // Add a test cube to the side
    const testCube = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    testCube.position.set(-2, 0, 0); // Move cube to the left
    //this.scene.add(testCube);
    this.testCube = testCube;

    // Load text asynchronously
    this.loadText();
  }

  loadText() {
    try {
      // Create text object
      const text = new Text();

      // Configure text properties
      text.text = "Hello WebGPU!";
      text.fontSize = 0.5; // Smaller font size for testing
      text.position.set(0, 0, 0); // Center position
      text.color = 0xffffff;
      text.anchorX = "center";
      text.anchorY = "middle";
      text.textAlign = "center";

      // Use MSDF font
      text.msdfFont = "/assets/fonts/msdf/KHTeka/KHTekaTRIAL-Medium-msdf.json";

      // Store reference but DON'T add to scene until material is ready
      this.textMesh = text;

      // Trigger sync to generate geometry
      text.sync(() => {
        // NOW add to scene after everything is ready
        this.scene.add(text);
      });
    } catch (error) {
      console.error(error);
    }
  }

  update(elapsedMs) {
    const t = elapsedMs * 0.001;

    // Animate test cube to verify update is being called
    if (this.testCube) {
      this.testCube.rotation.x = t * 0.5;
      this.testCube.rotation.y = t * 0.7;
    }

    // Animate text
    if (this.textMesh && this.textMesh.visible) {
      this.textMesh.rotation.y = Math.sin(t * 0.5) * 0.3;
    }
  }

  dispose() {
    if (this.textMesh) {
      this.textMesh.dispose();
    }
    super.dispose();
  }
}

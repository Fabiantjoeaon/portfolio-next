import { BaseScene } from "./BaseScene.js";
import { Text } from "../graphics/lib/Text/index.js";
import * as THREE from "three";
import { FadeTransition } from "../graphics/transitions/FadeTransition.js";

console.log("[TextTestScene] Module loaded, Text class:", Text);

/**
 * Test scene for the WebGPU/TSL Text implementation
 */
export default class TextTestScene extends BaseScene {
  constructor(config) {
    super(config);
    console.log("[TextTestScene] Constructor called, config:", config);
    this.name = "Text Test";
    this.textMesh = null;

    this.transition = new FadeTransition();

    // Set a VERY obvious background so we know the scene is rendering
    this.scene.background = new THREE.Color(0xff0000); // BRIGHT RED background for testing

    // Define camera state for this scene - matching RotatingCubeScene
    this.cameraState = {
      position: new THREE.Vector3(0, 0, 5),
      lookAt: new THREE.Vector3(0, 0, 0),
      fov: 75,
    };

    console.log("[TextTestScene] Scene setup:", {
      background: this.scene.background,
      cameraState: this.cameraState,
    });

    // Add lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);

    // Add a VERY visible test cube to the side
    const testCube = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color: 0xff0000 })
    );
    testCube.position.set(-2, 0, 0); // Move cube to the left
    this.scene.add(testCube);
    this.testCube = testCube;
    console.log("[TextTestScene] Added test cube at:", testCube.position);
    console.log(
      "[TextTestScene] Scene children count:",
      this.scene.children.length
    );

    // Load text asynchronously
    this.loadText();
  }

  loadText() {
    console.log("[TextTestScene] Creating Text object...");
    try {
      // Create text object
      const text = new Text();
      console.log("[TextTestScene] Text object created:", text);
      console.log("[TextTestScene] Text material:", text.material);
      console.log("[TextTestScene] Text geometry:", text.geometry);

      // Configure text properties
      text.text = "Hello WebGPU!";
      text.fontSize = 1.0;
      text.position.set(0, 1.5, 0); // Move above the cube
      text.color = 0xffffff;
      text.anchorX = "center";
      text.anchorY = "middle";
      text.textAlign = "center";

      // Use MSDF font
      text.msdfFont = "/assets/fonts/msdf/kenpixel/kenpixel-msdf.json";

      console.log(
        "[TextTestScene] Text configured at position:",
        text.position
      );

      // Text will become visible automatically after MSDF loads
      console.log("[TextTestScene] Text will auto-show after MSDF font loads");

      // Store reference but DON'T add to scene until material is ready
      this.textMesh = text;

      // Trigger sync to generate geometry
      console.log("[TextTestScene] Calling text.sync()");
      text.sync(() => {
        // NOW add to scene after everything is ready
        console.log("[TextTestScene] Sync complete, adding text to scene");
        this.scene.add(text);
        console.log(
          "✅ [TextTestScene] Text synced successfully!",
          text.textRenderInfo
        );
        console.log(
          "✅ [TextTestScene] Geometry instanceCount:",
          text.geometry.instanceCount
        );
        console.log("✅ [TextTestScene] Text visible:", text.visible);
        console.log("✅ [TextTestScene] Text position:", text.position);
        console.log("✅ [TextTestScene] Text material:", text.material);
        console.log(
          "✅ [TextTestScene] Has texture:",
          text.material.uniforms?.uTroikaSDFTexture?.value
        );
        console.log(
          "✅ [TextTestScene] Text bounds:",
          text.geometry.boundingBox
        );
        console.log(
          "✅ [TextTestScene] Glyph bounds sample:",
          text.textRenderInfo.glyphBounds.slice(0, 16)
        );
        console.log(
          "✅ [TextTestScene] Geometry attributes:",
          Object.keys(text.geometry.attributes)
        );
        console.log(
          "✅ [TextTestScene] Has aTroikaGlyphBounds:",
          text.geometry.attributes.aTroikaGlyphBounds
        );
      });
    } catch (error) {
      console.error("[TextTestScene] Error during text creation:", error);
      console.error(error.stack);
    }
  }

  update(elapsedMs) {
    if (!this._firstUpdate) {
      console.log("[TextTestScene] First update() call, elapsedMs:", elapsedMs);
      console.log("[TextTestScene] Scene:", this.scene);
      console.log("[TextTestScene] Scene children:", this.scene.children);
      console.log("[TextTestScene] Background:", this.scene.background);
      this._firstUpdate = true;
    }

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

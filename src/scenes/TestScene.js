import * as THREE from "three/webgpu";
import BaseScene from "./BaseScene.js";
import { SwipeTransition } from "../graphics/transitions/SwipeTransition.js";
import { VATMaterial, vatLoader } from "../graphics/lib/VAT/index.js";
import pane from "../ui/pane.js";

export default class TestScene extends BaseScene {
  constructor(config) {
    super();
    this.scene.background = new THREE.Color(0x1a1f2e);
    this.transition = new SwipeTransition();

    // VAT material reference
    this.vatMaterial = null;
    this.vatControls = null;

    // Define camera state for this scene
    this.cameraState = {
      position: new THREE.Vector3(0, 1.5, 3),
      lookAt: new THREE.Vector3(0, 0.5, 0),
      fov: 50,
    };

    // Initialize the scene
    this._init();
  }

  async _init() {
    this._setupLighting();
    this._setupGround();
    await this._setupFlower();
    this._setupTweakpane();
  }

  _setupLighting() {
    // Main directional light (sun-like)
    const directionalLight = new THREE.DirectionalLight(0xffeedd, 2);
    directionalLight.position.set(3, 5, 2);
    directionalLight.castShadow = true;
    this.scene.add(directionalLight);

    // Fill light from the opposite side
    const fillLight = new THREE.DirectionalLight(0x88aaff, 0.5);
    fillLight.position.set(-2, 3, -1);
    this.scene.add(fillLight);

    // Ambient light for base illumination
    const ambientLight = new THREE.AmbientLight(0x404060, 0.4);
    this.scene.add(ambientLight);

    // Hemisphere light for sky/ground color variation
    const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3d5c3d, 0.3);
    this.scene.add(hemiLight);
  }

  _setupGround() {
    const groundGeometry = new THREE.PlaneGeometry(10, 10);
    const groundMaterial = new THREE.MeshStandardNodeMaterial({
      color: 0x333333,
      roughness: 0.9,
      metalness: 0.0,
      //side: THREE.DoubleSide,
    });

    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    ground.rotation.x = -Math.PI / 2;

    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  async _setupFlower() {
    try {
      // Load VAT assets from OpenVAT export
      const { geometry, vatTexture, remapInfo } = await vatLoader.load(
        "/assets/scenes/meadow/flowers/rose_vat/GNRose"
      );

      console.log(`VAT: Loaded mesh with ${geometry.attributes.position.count} vertices`);
      console.log(`VAT: Texture ${remapInfo.textureWidth}x${remapInfo.textureHeight}, ${remapInfo.frames} frames`);
      console.log(`VAT: Bounds min:`, remapInfo.min, 'max:', remapInfo.max);

      // Create VAT material
      this.vatMaterial = new VATMaterial({
        vatTexture,
        remapInfo,
        useNormals: false,
        color: 0xe85a71,
        roughness: 0.5,
        metalness: 0.0,
        side: THREE.DoubleSide,
      });

      // Create mesh using the FBX geometry (has proper faces/triangles)
      const flower = new THREE.Mesh(geometry, this.vatMaterial);
      
      // Rotate for Blender coordinate system (-Z Forward, Y Up) to Three.js
      flower.rotation.x = -Math.PI / 2;
      
      flower.castShadow = true;
      flower.receiveShadow = true;
      
      this.scene.add(flower);
      this.flower = flower;

      console.log(`VAT: Added mesh with ${geometry.index ? geometry.index.count / 3 : 'N/A'} triangles`);
    } catch (error) {
      console.error("Failed to load VAT flower:", error);
    }
  }

  _setupTweakpane() {
    if (!pane || !this.vatMaterial) return;

    // Create VAT controls folder
    this.vatFolder = pane.addFolder({
      title: "VAT Animation",
      expanded: true,
    });

    // Controls object for bindings
    this.vatControls = {
      time: 0,
      speed: 1.0,
      playing: true,
      loop: true,
      interpolate: true,
      useNormals: false,
    };

    // Time scrubber
    this.timeBinding = this.vatFolder
      .addBinding(this.vatControls, "time", {
        label: "Time",
        min: 0,
        max: 1,
        step: 0.001,
      })
      .on("change", (ev) => {
        if (!this.vatControls.playing) {
          this.vatMaterial.setTime(ev.value);
        }
      });

    // Speed control
    this.vatFolder
      .addBinding(this.vatControls, "speed", {
        label: "Speed",
        min: 0,
        max: 3,
        step: 0.1,
      })
      .on("change", (ev) => {
        this.vatMaterial.setSpeed(ev.value);
      });

    // Play/Pause toggle
    this.vatFolder
      .addBinding(this.vatControls, "playing", {
        label: "Playing",
      })
      .on("change", (ev) => {
        if (ev.value) {
          this.vatMaterial.play();
        } else {
          this.vatMaterial.pause();
        }
      });

    // Loop toggle
    this.vatFolder
      .addBinding(this.vatControls, "loop", {
        label: "Loop",
      })
      .on("change", (ev) => {
        this.vatMaterial.setLoop(ev.value);
      });

    // Interpolation toggle
    this.vatFolder
      .addBinding(this.vatControls, "interpolate", {
        label: "Interpolate",
      })
      .on("change", (ev) => {
        this.vatMaterial.setInterpolate(ev.value);
      });

    // Animated normals toggle
    this.vatFolder
      .addBinding(this.vatControls, "useNormals", {
        label: "Animated Normals",
      })
      .on("change", (ev) => {
        this.vatMaterial.setUseNormals(ev.value);
      });

    // Info display
    this.vatFolder.addBlade({
      view: "text",
      label: "Frames",
      value: `${this.vatMaterial.frameCount}`,
      parse: (v) => String(v),
      disabled: true,
    });

    this.vatFolder.addBlade({
      view: "text",
      label: "Duration",
      value: `${this.vatMaterial.duration.toFixed(2)}s`,
      parse: (v) => String(v),
      disabled: true,
    });
  }

  update(time, delta) {
    super.update();

    // Update VAT material animation
    if (this.vatMaterial) {
      this.vatMaterial.update(delta);

      // Sync time slider when playing
      if (this.vatControls && this.vatControls.playing) {
        this.vatControls.time = this.vatMaterial.time;
        if (this.timeBinding) {
          this.timeBinding.refresh();
        }
      }
    }
  }
}

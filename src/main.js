import { bus } from "./events/bus.js";
import { useViewportStore } from "./state/store.js";
import { WebGPURenderer } from "three/webgpu";
import { SceneManager } from "./three/SceneManager.js";
import { RotatingCubeScene } from "./scenes/RotatingCubeScene.js";
import { getFlag } from "./lib/query.js";
import Stats from "stats.js";
import { TestScene } from "./scenes/TestScene.js";
import pane from "./ui/pane.js";

class App {
  constructor() {
    this.canvas = document.getElementById("app-canvas");
    this.renderer = null;
    this.sceneManager = null;
    this.debug = getFlag("debug");
    this.stats = null;

    this.sceneAObj = null;
    this.sceneBObj = null;

    this.onResize = this.onResize.bind(this);
    this.render = this.render.bind(this);
  }

  async init() {
    if (!("gpu" in navigator)) {
      const message = document.createElement("div");
      message.id = "no-webgpu";
      message.textContent = "WebGPU is not supported in this browser.";
      document.body.appendChild(message);
      return;
    }

    this.renderer = new WebGPURenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
    await this.renderer.init();

    if (this.debug) {
      this.stats = new Stats();
      this.stats.showPanel(0);
      document.body.appendChild(this.stats.dom);
    }

    await this.setupScenes();

    this.onResize();
    window.addEventListener("resize", this.onResize);
    this.renderer.setAnimationLoop(this.render);
  }

  async setupScenes() {
    this.sceneAObj = new TestScene();
    this.sceneBObj = new RotatingCubeScene();

    if (this.debug) {
    }

    this.sceneManager = new SceneManager(this.renderer);
    const idA = this.sceneManager.addScene({
      scene: this.sceneAObj.scene,
      camera: this.sceneAObj.camera,
      update: this.sceneAObj.update.bind(this.sceneAObj),
      albedoHex: 0x6ee7b7,
    });
    const idB = this.sceneManager.addScene({
      scene: this.sceneBObj.scene,
      camera: this.sceneBObj.camera,
      update: this.sceneBObj.update.bind(this.sceneBObj),
      albedoHex: 0x60a5fa,
    });
    this.sceneManager.setActivePair(idA, idB);
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(width, height, false);

    // TODO: Resize current scenes
    this.sceneManager?.resize({
      width,
      height,
      devicePixelRatio,
    });

    useViewportStore.getState().setViewport({
      width,
      height,
      devicePixelRatio,
    });
  }

  render(time) {
    if (this.stats) this.stats.begin();
    const t = time * 0.001;
    const mixValue = 0.5 + 0.5 * Math.sin(t * 0.5);
    this.sceneManager.setMix(mixValue);
    this.sceneManager.render(time);
    if (this.stats) this.stats.end();
  }
}

new App().init();

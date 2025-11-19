import { bus } from "./events/bus.js";
import { useViewportStore } from "./state/store.js";
import { WebGPURenderer } from "three/webgpu";
import { SceneManager } from "./three/SceneManager.js";
import { getFlag } from "./lib/query.js";
import Stats from "stats.js";
import { orderedScenes, createScenes } from "./scenes/index.js";

class App {
  constructor() {
    this.canvas = document.getElementById("app-canvas");
    this.renderer = null;
    this.sceneManager = null;
    this.debug = getFlag("debug");
    this.stats = null;

    this.sceneInstances = [];
    this.sceneIds = [];
    this.prevIdx = 0;
    this.nextIdx = 1;
    this.transitionStart = 0;
    this.transitionDuration = 3000; // ms

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
    // Instantiate scenes in declared order
    this.sceneInstances = createScenes();
    this.sceneManager = new SceneManager(this.renderer);
    this.sceneIds = this.sceneInstances.map((inst) =>
      this.sceneManager.addScene(inst)
    );

    // Initialize active pair
    this.prevIdx = 0;
    this.nextIdx = this.sceneIds.length > 1 ? 1 : 0;
    this.sceneManager.setActivePair(
      this.sceneIds[this.prevIdx],
      this.sceneIds[this.nextIdx]
    );
    this.transitionStart = performance.now();
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(width, height, false);

    // Update active cameras
    const prevInst = this.sceneInstances[this.prevIdx];
    const nextInst = this.sceneInstances[this.nextIdx];
    if (prevInst?.camera) {
      prevInst.camera.aspect = width / height;
      prevInst.camera.updateProjectionMatrix();
    }
    if (nextInst?.camera && nextInst !== prevInst) {
      nextInst.camera.aspect = width / height;
      nextInst.camera.updateProjectionMatrix();
    }

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
    bus.emit("resize", { width, height, devicePixelRatio });
  }

  render(time) {
    if (this.stats) this.stats.begin();

    if (this.sceneIds.length === 0) {
      if (this.stats) this.stats.end();
      return;
    }

    // Linear transition 0..1 over transitionDuration
    const elapsed = time - this.transitionStart;
    let mixValue = Math.min(Math.max(elapsed / this.transitionDuration, 0), 1);
    this.sceneManager.setMix(mixValue);

    if (mixValue >= 1 && this.sceneIds.length > 1) {
      // Advance to next scene in order
      this.prevIdx = this.nextIdx;
      this.nextIdx = (this.nextIdx + 1) % this.sceneIds.length;
      this.sceneManager.setActivePair(
        this.sceneIds[this.prevIdx],
        this.sceneIds[this.nextIdx]
      );
      this.transitionStart = time;
    }

    this.sceneManager.render(time);
    if (this.stats) this.stats.end();
  }
}

new App().init();

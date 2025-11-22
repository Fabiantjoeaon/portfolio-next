import { bus } from "./events/bus.js";
import { useViewportStore } from "./state/store.js";
import { WebGPURenderer } from "three/webgpu";
import { SceneManager } from "./gl/SceneManager.js";
import { TransitionManager } from "./gl/TransitionManager.js";
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
    this.transitionManager = null;

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
    this.transitionManager = new TransitionManager(this.sceneManager);
    this.transitionManager.setSequence(this.sceneIds, this.sceneInstances);
    this.transitionManager.start(performance.now());
  }

  createOverlay() {
    const el = document.createElement("div");
    el.id = "debug-overlay";
    el.style.position = "fixed";
    el.style.top = "8px";
    el.style.left = "8px";
    el.style.zIndex = "9999";
    el.style.pointerEvents = "none";
    el.style.background = "rgba(15, 23, 42, 0.7)";
    el.style.color = "#e2e8f0";
    el.style.fontFamily =
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace";
    el.style.fontSize = "12px";
    el.style.padding = "6px 8px";
    el.style.borderRadius = "6px";
    document.body.appendChild(el);
    this.overlayEl = el;
  }

  onResize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

    this.renderer.setPixelRatio(devicePixelRatio);
    this.renderer.setSize(width, height, false);

    // Update active cameras (transition manager sets active pair)
    const activePrevId = this.sceneManager.activePrevId;
    const activeNextId = this.sceneManager.activeNextId;
    const prevInst = this.sceneInstances[this.sceneIds.indexOf(activePrevId)];
    const nextInst = this.sceneInstances[this.sceneIds.indexOf(activeNextId)];
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

    this.transitionManager?.update(time);

    this.sceneManager.render(time);
    if (this.stats) this.stats.end();
  }
}

new App().init();

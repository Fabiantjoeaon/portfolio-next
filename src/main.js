import { bus } from "./events/bus.js";
import { useViewportStore } from "./state/store.js";
import { setupPane } from "./ui/pane.js";
import { WebGPURenderer } from "three/webgpu";
import { SceneManager } from "./three/SceneManager.js";
import { RotatingCubeScene } from "./scenes/RotatingCubeScene.js";

const canvas = document.getElementById("app-canvas");

function setCanvasSize(renderer) {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const devicePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  renderer.setPixelRatio(devicePixelRatio);
  renderer.setSize(width, height, false);

  useViewportStore.getState().setViewport({
    width,
    height,
    devicePixelRatio,
  });

  bus.emit("resize", { width, height, devicePixelRatio });
}

async function main() {
  if (!("gpu" in navigator)) {
    const message = document.createElement("div");
    message.id = "no-webgpu";
    message.textContent = "WebGPU is not supported in this browser.";
    document.body.appendChild(message);
    return;
  }

  const renderer = new WebGPURenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });

  await renderer.init();

  setCanvasSize(renderer);

  const controlsA = {
    rotateX: 0.6,
    rotateY: 0.9,
    color: "#6ee7b7",
    lightIntensity: 1.0,
  };

  const sceneAObj = new RotatingCubeScene(controlsA);
  const sceneA = sceneAObj.scene;
  const cameraA = sceneAObj.camera;
  const updateA = sceneAObj.update.bind(sceneAObj);
  const setCubeColorA = sceneAObj.setCubeColor.bind(sceneAObj);
  const setLightIntensityA = sceneAObj.setLightIntensity.bind(sceneAObj);

  // Simple second scene with different styling
  const controlsB = {
    rotateX: 0.4,
    rotateY: -0.7,
    color: "#60a5fa",
    lightIntensity: 0.8,
  };
  const sceneBObj = new RotatingCubeScene(controlsB);
  const sceneB = sceneBObj.scene;
  const cameraB = sceneBObj.camera;
  const updateB = sceneBObj.update.bind(sceneBObj);

  setupPane(controlsA, {
    setCubeColor: setCubeColorA,
    setLightIntensity: setLightIntensityA,
  });

  const sceneManager = new SceneManager(renderer);
  const idA = sceneManager.addScene({
    scene: sceneA,
    camera: cameraA,
    update: updateA,
    albedoHex: 0x6ee7b7,
  });
  const idB = sceneManager.addScene({
    scene: sceneB,
    camera: cameraB,
    update: updateB,
    albedoHex: 0x60a5fa,
  });
  sceneManager.setActivePair(idA, idB);

  window.addEventListener("resize", () => {
    setCanvasSize(renderer);
    const { width, height } = useViewportStore.getState().viewport;
    cameraA.aspect = width / height;
    cameraA.updateProjectionMatrix();
    cameraB.aspect = width / height;
    cameraB.updateProjectionMatrix();
    sceneManager.resize({
      width,
      height,
      devicePixelRatio: window.devicePixelRatio || 1,
    });
  });

  renderer.setAnimationLoop((time) => {
    // Blend the two scenes over time
    const t = time * 0.001;
    const mixValue = 0.5 + 0.5 * Math.sin(t * 0.5);
    sceneManager.setMix(mixValue);
    sceneManager.render(time);
  });
}

main();

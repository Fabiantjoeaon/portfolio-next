import { bus } from "./events/bus.js";
import { useViewportStore } from "./state/store.js";
import { setupScene } from "./three/scene.js";
import { setupPane } from "./ui/pane.js";
import { WebGPURenderer } from "three/webgpu";

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

  const controls = {
    rotateX: 0.6,
    rotateY: 0.9,
    color: "#6ee7b7",
    lightIntensity: 1.0,
  };

  const { scene, camera, update, setCubeColor, setLightIntensity } = setupScene(
    renderer,
    controls
  );

  setupPane(controls, {
    setCubeColor,
    setLightIntensity,
  });

  window.addEventListener("resize", () => {
    setCanvasSize(renderer);
    const { width, height } = useViewportStore.getState().viewport;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });

  renderer.setAnimationLoop((time) => {
    update(time);
    renderer.render(scene, camera);
  });
}

main();

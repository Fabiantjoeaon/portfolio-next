import { TestScene } from "./TestScene.js";
import { RotatingCubeScene } from "./RotatingCubeScene.js";

// Ordered list of scene entries with default configs for visual distinction
// You can add more scenes here; each entry may be a class or { Scene, config }
export const orderedScenes = [
  {
    Scene: TestScene,
    config: { color: "#6ee7b7", rotateX: 0.6, rotateY: 0.9 },
  },
  {
    Scene: RotatingCubeScene,
    config: { color: "#60a5fa", rotateX: 0.4, rotateY: -0.7 },
  },
];

// Utility to instantiate scenes; external configs override defaults by index
export function createScenes(configs = []) {
  return orderedScenes.map((entry, idx) => {
    const SceneClass = entry?.Scene ?? entry; // support class-only entries
    const defaultCfg = entry?.config ?? undefined;
    const overrideCfg = configs[idx] ?? {};
    const cfg = { ...defaultCfg, ...overrideCfg };
    return new SceneClass(cfg);
  });
}

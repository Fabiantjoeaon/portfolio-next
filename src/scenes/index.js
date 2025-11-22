import { TestScene } from "./TestScene.js";
import { RotatingCubeScene } from "./RotatingCubeScene.js";
import { SpheresScene } from "./SpheresScene.js";
import { SwipeTransition } from "../graphics/transitions/SwipeTransition.js";
import { FadeTransition } from "../graphics/transitions/FadeTransition.js";

// Ordered list of scene entries with default configs for visual distinction
// You can add more scenes here; each entry may be a class or { Scene, config }
export const orderedScenes = [
  {
    Scene: SpheresScene,
  },
  {
    Scene: RotatingCubeScene,
  },
  {
    Scene: TestScene,
  },
];

export function createScenes(configs = []) {
  return orderedScenes.map((entry, idx) => {
    const SceneClass = entry?.Scene ?? entry; // support class-only entries
    const defaultCfg = entry?.config ?? undefined;
    const overrideCfg = configs[idx] ?? {};
    const cfg = { ...defaultCfg, ...overrideCfg };
    const instance = new SceneClass(cfg);

    return instance;
  });
}

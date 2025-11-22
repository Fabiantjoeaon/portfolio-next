import { TestScene } from "./TestScene.js";
import { RotatingCubeScene } from "./RotatingCubeScene.js";
import { SpheresScene } from "./SpheresScene.js";
import { SwipeTransition } from "../gl/transitions/SwipeTransition.js";
import { FadeTransition } from "../gl/transitions/FadeTransition.js";

// Ordered list of scene entries with default configs for visual distinction
// You can add more scenes here; each entry may be a class or { Scene, config }
export const orderedScenes = [
  {
    Scene: SpheresScene,

    transition: SwipeTransition,
  },
  {
    Scene: RotatingCubeScene,

    transition: FadeTransition,
  },
  //   {
  //     Scene: TestScene,

  //     transition: FadeTransition,
  //   },
];

// TODO: Just move this.transition to scene class
export function createScenes(configs = []) {
  return orderedScenes.map((entry, idx) => {
    const SceneClass = entry?.Scene ?? entry; // support class-only entries
    const defaultCfg = entry?.config ?? undefined;
    const overrideCfg = configs[idx] ?? {};
    const cfg = { ...defaultCfg, ...overrideCfg };
    const instance = new SceneClass(cfg);

    const TransitionClass = entry?.transition ?? SwipeTransition;
    instance.transition = new TransitionClass(entry?.transitionConfig ?? {});
    return instance;
  });
}

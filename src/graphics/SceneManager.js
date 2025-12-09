import { mrt, output } from "three/tsl";
import { PostProcessingScene } from "./PostProcessingScene.js";
import { GBuffer } from "./GBuffer.js";
import { createNormalOutputNode } from "./materials/GBufferMaterial.js";
import PersistentScene from "../scenes/PersistentScene";
import { CameraController } from "./CameraController.js";
import { getFlag } from "../lib/query.js";

let _nextSceneId = 1;

export class SceneManager {
  constructor(
    renderer,
    debug = false,
    hidePersistentScene = getFlag("hidePersistentScene")
  ) {
    this.renderer = renderer;
    this.hidePersistentScene = hidePersistentScene;

    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;
    this.viewport = {
      width,
      height,
      devicePixelRatio: Math.min(devicePixelRatio || 1, 2),
    };

    this.scenes = new Map(); // id -> { scene, cameraState, update, gbuffer }
    this.activePrevId = null;
    this.activeNextId = null;
    this.mixValue = 0.0;
    this.isTransitioning = false;

    // Create shared camera controller
    this.cameraController = new CameraController(renderer, debug);
    this.cameraController.setAspect(width / height);

    // Create shared normal output node for MRT
    this.normalOutputNode = createNormalOutputNode();

    this.persistent = new PersistentScene(
      renderer,
      width,
      height,
      devicePixelRatio
    );

    this.post = new PostProcessingScene();
  }

  addScene(sceneObj) {
    const id = _nextSceneId++;
    const { width, height, devicePixelRatio } = this.viewport;

    this.scenes.set(id, {
      scene: sceneObj.scene,
      cameraState: sceneObj.cameraState,
      update: sceneObj.update?.bind?.(sceneObj) ?? (() => {}),
      sceneObj,
      gbuffer: new GBuffer(width, height, devicePixelRatio),
    });
    if (this.activePrevId === null) {
      this.activePrevId = id;
      // Set initial camera state from first scene
      if (sceneObj.cameraState) {
        this.cameraController.snapToState(sceneObj.cameraState);
      }
    } else if (this.activeNextId === null) this.activeNextId = id;
    return id;
  }

  setActivePair(prevId, nextId) {
    this.activePrevId = prevId;
    this.activeNextId = nextId;

    // Set up camera transition states from prev scene to next scene
    const prevScene = this.scenes.get(prevId);
    const nextScene = this.scenes.get(nextId);

    this.cameraController.setTransitionStates(
      prevScene?.cameraState,
      nextScene?.cameraState
    );
  }

  setMix(value) {
    this.mixValue = Math.min(Math.max(value, 0), 1);
    this.post.material.setMix(this.mixValue);
  }

  setTransitioning(isTransitioning) {
    this.isTransitioning = isTransitioning;
  }

  updateCameraTransition(progress, delta) {
    // Update camera interpolation based on transition progress
    this.cameraController.update(progress, delta);
  }

  resize({ width, height, devicePixelRatio }) {
    this.viewport = { width, height, devicePixelRatio };

    // Resize all scene gbuffers
    for (const [, entry] of this.scenes) {
      entry.gbuffer.resize(width, height, devicePixelRatio);
    }

    // Update shared camera aspect
    this.cameraController.setAspect(width / height);

    // Resize persistent gbuffer
    this.persistent.gbuffer.resize(width, height, devicePixelRatio);
  }

  render(timeMs, delta) {
    const renderer = this.renderer;
    const prev = this.scenes.get(this.activePrevId);
    const next = this.scenes.get(this.activeNextId);

    // Get the shared camera
    const camera = this.cameraController.camera;

    // Disable autoClear to handle clearing manually per render target
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    // Pass persistent scene to scenes that need it for reflections
    // The scene can then render its own reflection pass
    if (prev?.sceneObj?.setPersistentScene) {
      prev.sceneObj.setPersistentScene(
        this.renderer,
        this.persistent.scene,
        camera,
        this.viewport
      );
    }
    if (next?.sceneObj?.setPersistentScene) {
      next.sceneObj.setPersistentScene(
        this.renderer,
        this.persistent.scene,
        camera,
        this.viewport
      );
    }

    // Legacy: pass gbuffer for scenes that still use it
    if (prev?.sceneObj?.setPersistentBuffer && this.persistent.gbuffer) {
      prev.sceneObj.setPersistentBuffer(this.persistent.gbuffer);
    }
    if (next?.sceneObj?.setPersistentBuffer && this.persistent.gbuffer) {
      next.sceneObj.setPersistentBuffer(this.persistent.gbuffer);
    }

    // Render active scenes FIRST so their textures are available for persistent scene glass effect
    // Always update and render the prev scene
    if (prev?.update) prev.update(timeMs, delta);
    if (prev) {
      renderer.setRenderTarget(prev.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: this.normalOutputNode,
        })
      );

      // Explicitly clear with scene background color
      if (prev.scene.background) {
        renderer.setClearColor(prev.scene.background, 1);
      } else {
        renderer.setClearColor(0x000000, 1);
      }
      renderer.clear();

      // No overrideMaterial - use forward rendering with proper materials/lighting
      renderer.render(prev.scene, camera);
      renderer.setMRT(null);
    }

    // Only update and render next scene during transitions
    if (this.isTransitioning && next && next !== prev) {
      if (next.update) next.update(timeMs, delta);

      renderer.setRenderTarget(next.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: this.normalOutputNode,
        })
      );

      // Explicitly clear with scene background color
      if (next.scene.background) {
        renderer.setClearColor(next.scene.background, 1);
      } else {
        renderer.setClearColor(0x000000, 1);
      }
      renderer.clear();

      // No overrideMaterial - use forward rendering with proper materials/lighting
      renderer.render(next.scene, camera);
      renderer.setMRT(null);
    }

    // Render persistent scene AFTER active scenes so it can sample their textures for glass effect
    if (!this.hidePersistentScene) {
      this.persistent.update(timeMs, delta);

      // Pass the active scene's albedo texture to persistent scene for glass sampling
      this.persistent.setSceneTexture(prev?.gbuffer.albedo ?? null);

      if (!this.persistent.isEmpty() && this.persistent.gbuffer) {
        renderer.setRenderTarget(this.persistent.gbuffer.target);
        renderer.setMRT(
          mrt({
            output,
            normal: this.normalOutputNode,
          })
        );
        renderer.setClearColor(0x000000, 0);
        renderer.clear();
        renderer.render(this.persistent.scene, camera);
        renderer.setMRT(null);
      }
    }

    // Restore autoClear
    renderer.autoClear = prevAutoClear;

    // Update post material inputs
    if (prev || next) {
      const pTex = prev?.gbuffer.albedo ?? next?.gbuffer.albedo;
      const nTex = next?.gbuffer.albedo ?? prev?.gbuffer.albedo;

      this.post.material.setInputs({
        prev: pTex,
        next: nTex,
        prevDepth: prev?.gbuffer.depth,
        nextDepth: next?.gbuffer.depth,
        persistent: this.hidePersistentScene
          ? null
          : this.persistent.gbuffer?.albedo,
        persistentDepth: this.hidePersistentScene
          ? null
          : this.persistent.gbuffer?.depth,
      });
    }

    renderer.setRenderTarget(null);
    renderer.render(this.post.scene, this.post.camera);
  }
}

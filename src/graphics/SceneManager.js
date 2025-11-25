import { mrt, output } from "three/tsl";
import { PostProcessingScene } from "./PostProcessingScene.js";
import { createGBuffer, resizeGBuffer } from "./gbuffer.js";
import { createNormalOutputNode } from "./materials/GBufferMaterial.js";
import { PersistentScene } from "./PersistentScene.js";
import { CameraController } from "./CameraController.js";

let _nextSceneId = 1;

export class SceneManager {
  constructor(renderer, debug = false) {
    this.renderer = renderer;

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

    this.persistent = new PersistentScene();
    this.persistent.initGBuffer(width, height, devicePixelRatio, createGBuffer);

    this.post = new PostProcessingScene();
  }

  addScene(sceneObj) {
    const id = _nextSceneId++;
    const { width, height, devicePixelRatio } = this.viewport;

    const gbuffer = createGBuffer(width, height, devicePixelRatio);

    this.scenes.set(id, {
      scene: sceneObj.scene,
      cameraState: sceneObj.cameraState,
      update: sceneObj.update?.bind?.(sceneObj) ?? (() => {}),
      sceneObj,
      gbuffer,
    });
    if (this.activePrevId === null) {
      this.activePrevId = id;
      // Set initial camera state from first scene
      if (sceneObj.cameraState) {
        this.cameraController.setTargetState(sceneObj.cameraState);
        this.cameraController.snapToTarget();
      }
    } else if (this.activeNextId === null) this.activeNextId = id;
    return id;
  }

  setActivePair(prevId, nextId) {
    this.activePrevId = prevId;
    this.activeNextId = nextId;

    // Update camera target state when changing active scene
    const prevScene = this.scenes.get(prevId);
    if (prevScene?.cameraState) {
      this.cameraController.setTargetState(prevScene.cameraState);
    }
  }

  setMix(value) {
    this.mixValue = Math.min(Math.max(value, 0), 1);
    this.post.material.setMix(this.mixValue);
  }

  setTransitioning(isTransitioning) {
    this.isTransitioning = isTransitioning;
  }

  updateCameraTransition(progress) {
    // Update camera interpolation based on transition progress
    this.cameraController.update(progress);
  }

  resize({ width, height, devicePixelRatio }) {
    this.viewport = { width, height, devicePixelRatio };
    // Recreate all gbuffers
    for (const [, entry] of this.scenes) {
      const resized = resizeGBuffer(
        entry.gbuffer,
        width,
        height,
        devicePixelRatio
      );
      entry.gbuffer = resized;
    }

    // Update shared camera aspect
    this.cameraController.setAspect(width / height);

    // Resize persistent gbuffer
    this.persistent.resizeGBuffer(
      width,
      height,
      devicePixelRatio,
      resizeGBuffer
    );
  }

  render(timeMs) {
    const renderer = this.renderer;
    const prev = this.scenes.get(this.activePrevId);
    const next = this.scenes.get(this.activeNextId);

    // Get the shared camera
    const camera = this.cameraController.camera;

    this.persistent.update(timeMs);

    // Always update and render the prev scene
    if (prev?.update) prev.update(timeMs);
    if (prev) {
      renderer.setRenderTarget(prev.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: this.normalOutputNode,
        })
      );
      // No overrideMaterial - use forward rendering with proper materials/lighting
      renderer.render(prev.scene, camera);
      renderer.setMRT(null);
    }

    // Only update and render next scene during transitions
    if (this.isTransitioning && next && next !== prev) {
      if (next.update) next.update(timeMs);

      renderer.setRenderTarget(next.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: this.normalOutputNode,
        })
      );
      // No overrideMaterial - use forward rendering with proper materials/lighting
      renderer.render(next.scene, camera);
      renderer.setMRT(null);
    }

    // Render persistent scene to its own gbuffer using shared camera
    if (!this.persistent.isEmpty()) {
      renderer.setRenderTarget(this.persistent.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: this.normalOutputNode,
        })
      );
      // No overrideMaterial - use forward rendering with proper materials/lighting
      renderer.render(this.persistent.scene, camera);
      renderer.setMRT(null);
    }

    // Update post material inputs
    if (prev || next) {
      const pTex = prev?.gbuffer.albedo ?? next?.gbuffer.albedo;
      const nTex = next?.gbuffer.albedo ?? prev?.gbuffer.albedo;

      this.post.material.setInputs({
        prev: pTex,
        next: nTex,
        prevDepth: prev?.gbuffer.depth,
        nextDepth: next?.gbuffer.depth,
        persistent: this.persistent.gbuffer?.albedo,
        persistentDepth: this.persistent.gbuffer?.depth,
      });
    }

    renderer.setRenderTarget(null);
    renderer.render(this.post.scene, this.post.camera);
  }
}

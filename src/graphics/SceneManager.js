import { mrt, output, vec3 } from "three/tsl";
import { PostProcessingScene } from "./postScene.js";
import { createGBuffer, resizeGBuffer } from "./gbuffer.js";
import { createGBufferMaterial } from "./materials/GBufferMaterial.js";
import { PostProcessingMaterial } from "./materials/PostMaterial.js";

let _nextSceneId = 1;

export class SceneManager {
  constructor(renderer) {
    this.renderer = renderer;

    const { innerWidth: width, innerHeight: height, devicePixelRatio } = window;
    this.viewport = {
      width,
      height,
      devicePixelRatio: Math.min(devicePixelRatio || 1, 2),
    };

    this.scenes = new Map(); // id -> { scene, camera, update, gbuffer, gbufferMat }
    this.activePrevId = null;
    this.activeNextId = null;
    this.mixValue = 0.0;
    this.isTransitioning = false;

    this.post = new PostProcessingScene();
  }

  addScene(sceneObj) {
    const id = _nextSceneId++;
    const { width, height, devicePixelRatio } = this.viewport;

    const gbuffer = createGBuffer(width, height, devicePixelRatio);
    const gbufferMat = createGBufferMaterial(sceneObj?.albedoHex ?? 0xffffff);

    this.scenes.set(id, {
      scene: sceneObj.scene,
      camera: sceneObj.camera,
      update: sceneObj.update?.bind?.(sceneObj) ?? (() => {}),
      sceneObj,
      gbuffer,
      gbufferMat,
    });
    if (this.activePrevId === null) this.activePrevId = id;
    else if (this.activeNextId === null) this.activeNextId = id;
    return id;
  }

  setActivePair(prevId, nextId) {
    this.activePrevId = prevId;
    this.activeNextId = nextId;
  }

  setMix(value) {
    this.mixValue = Math.min(Math.max(value, 0), 1);
    this.post.material.setMix(this.mixValue);
  }

  setTransitioning(isTransitioning) {
    this.isTransitioning = isTransitioning;
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

      entry.camera.aspect = width / height;
      entry.camera.updateProjectionMatrix();
    }
  }

  render(timeMs) {
    const renderer = this.renderer;
    const prev = this.scenes.get(this.activePrevId);
    const next = this.scenes.get(this.activeNextId);

    // Always update and render the prev scene
    if (prev?.update) prev.update(timeMs);
    if (prev) {
      renderer.setRenderTarget(prev.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: vec3(0),
        })
      );
      //prev.scene.overrideMaterial = prev.gbufferMat;
      renderer.render(prev.scene, prev.camera);
      //prev.scene.overrideMaterial = null;
      renderer.setMRT(null);
    }

    // Only update and render next scene during transitions
    if (this.isTransitioning && next && next !== prev) {
      if (next.update) next.update(timeMs);

      renderer.setRenderTarget(next.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: vec3(0),
        })
      );
      //next.scene.overrideMaterial = next.gbufferMat;
      renderer.render(next.scene, next.camera);
      //next.scene.overrideMaterial = null;
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
      });
    }

    renderer.setRenderTarget(null);
    renderer.render(this.post.scene, this.post.camera);
  }
}

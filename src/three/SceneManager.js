import { mrt, normalView, output } from "three/tsl";
import { PostProcessingScene } from "./../three/postScene.js";
import { createGBuffer, resizeGBuffer } from "./gbuffer.js";
import { createGBufferMaterial } from "./materials/GBufferMaterial.js";
import { PostProcessingMaterial } from "./materials/PostMaterial.js";

let _nextSceneId = 1;

function hideObjectsWithoutNormals(root) {
  const modified = [];
  root.traverse((obj) => {
    if (obj.isMesh) {
      const geom = obj.geometry;
      const hasNormals = !!geom?.attributes?.normal;
      if (!hasNormals && obj.visible !== false) {
        modified.push({ obj, prevVisible: obj.visible });
        obj.visible = false;
      }
    } else if (!obj.isScene) {
      // Hide only line-like helpers and point-based objects; keep groups/empty containers visible
      const shouldHide =
        obj.isLine === true ||
        obj.isLineSegments === true ||
        obj.isPoints === true ||
        obj.isSprite === true;
      if (shouldHide && obj.visible !== false) {
        modified.push({ obj, prevVisible: obj.visible });
        obj.visible = false;
      }
    }
  });
  return () => {
    for (const m of modified) m.obj.visible = m.prevVisible;
  };
}

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

    // Post pipeline
    this.post = new PostProcessingMaterial();
    this.postScene = new PostProcessingScene(this.post.material);
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

  // TODO: call after switch
  setActivePair(prevId, nextId) {
    this.activePrevId = prevId ?? this.activePrevId;
    this.activeNextId = nextId ?? this.activeNextId;
  }

  setMix(value) {
    this.mixValue = Math.min(Math.max(value, 0), 1);
    this.post.setMix(this.mixValue);
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

    if (prev?.update) prev.update(timeMs);
    // Only update next scene if set
    if (next?.update && next !== prev) next.update(timeMs);

    // Prev scene GBuffer
    if (prev) {
      renderer.setRenderTarget(prev.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: normalView,
        })
      );
      const restorePrevVisibility = hideObjectsWithoutNormals(prev.scene);
      prev.scene.overrideMaterial = prev.gbufferMat;
      renderer.render(prev.scene, prev.camera);
      prev.scene.overrideMaterial = null;
      restorePrevVisibility();
      renderer.setMRT(null);
    }

    // Next scene GBuffer
    if (next) {
      renderer.setRenderTarget(next.gbuffer.target);
      renderer.setMRT(
        mrt({
          output,
          normal: normalView,
        })
      );
      const restoreNextVisibility = hideObjectsWithoutNormals(next.scene);
      next.scene.overrideMaterial = next.gbufferMat;
      renderer.render(next.scene, next.camera);
      next.scene.overrideMaterial = null;
      restoreNextVisibility();
      renderer.setMRT(null);
    }

    // Both active
    if (prev && next) {
      this.post.setInputs({
        prev: prev.gbuffer.albedo,
        prevNormal: prev.gbuffer.normals,
        prevDepth: prev.gbuffer.depth,
        next: next.gbuffer.albedo,
        nextNormal: next.gbuffer.normals,
        nextDepth: next.gbuffer.depth,
      });
    } else if (prev) {
      this.post.setInputs({
        prev: prev.gbuffer.albedo,
        next: prev.gbuffer.albedo,
      });
    } else if (next) {
      this.post.setInputs({
        prev: next.gbuffer.albedo,
        next: next.gbuffer.albedo,
      });
    }

    renderer.setRenderTarget(null);
    renderer.render(this.postScene.scene, this.postScene.camera);
  }
}

import * as THREE from "three";
import { createGBuffer, resizeGBuffer } from "./gbuffer.js";
import { createGBufferMaterial } from "./materials/GBufferMaterial.js";
import { PostProcessingMaterial } from "./materials/PostMaterial.js";
import { PostProcessingScene } from "./../three/postScene.js";
import { mrt, output, normalView } from "three/tsl";

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

    // Post pipeline
    this.post = new PostProcessingMaterial();
    this.postScene = new PostProcessingScene(this.post.material);
  }

  addScene(payload) {
    const id = _nextSceneId++;
    const { width, height, devicePixelRatio } = this.viewport;

    const gbuffer = createGBuffer(width, height, devicePixelRatio);
    const gbufferMat = createGBufferMaterial(payload?.albedoHex ?? 0xffffff);

    this.scenes.set(id, {
      scene: payload.scene,
      camera: payload.camera,
      update: payload.update ?? (() => {}),
      gbuffer,
      gbufferMat,
    });
    if (this.activePrevId === null) this.activePrevId = id;
    else if (this.activeNextId === null) this.activeNextId = id;
    return id;
  }

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
    }
  }

  render(timeMs) {
    const renderer = this.renderer;
    const prev = this.scenes.get(this.activePrevId);
    const next = this.scenes.get(this.activeNextId);

    // Update scenes
    if (prev?.update) prev.update(timeMs);
    if (next?.update && next !== prev) next.update(timeMs);

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
          // Hide non-mesh renderables like helpers/lines during GBuffer
          if (obj.visible !== false) {
            modified.push({ obj, prevVisible: obj.visible });
            obj.visible = false;
          }
        }
      });
      return () => {
        for (const m of modified) m.obj.visible = m.prevVisible;
      };
    }

    // GBuffer pass: prev
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

    // GBuffer pass: next
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

    // Post: combine prev and next
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

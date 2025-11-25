import { texture, uv, uniform, vec3, mix, step } from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";

/**
 * Fullscreen post material that blends two scenes (prev/next).
 * Exposes setters for inputs and a mix value (0..1).
 * Normals and depth are accepted for future effects; not required for basic blend.
 */
export class PostProcessingMaterial {
  constructor() {
    this.material = new MeshBasicNodeMaterial();

    // Uniform mix factor (0..1)
    this.mixNode = uniform(0.0);

    // Inputs
    this.prevTex = null;
    this.nextTex = null;
    this.prevNormal = null;
    this.prevDepth = null;
    this.nextNormal = null;
    this.nextDepth = null;
    this.persistentTex = null;
    this.persistentDepth = null;

    this.transition = null;
    this.postprocessingChain = null;

    this.rebuildGraph();

    this.uvNode = uv();
  }

  rebuildGraph() {
    if (this.prevTex && this.nextTex && this.transition) {
      let colorNode = this.transition.buildColorNode({
        uvNode: this.uvNode,
        mixNode: this.mixNode,
        prevTex: this.prevTex,
        prevNormal: this.prevNormal,
        prevDepth: this.prevDepth,
        nextTex: this.nextTex,
        nextNormal: this.nextNormal,
        nextDepth: this.nextDepth,
      });

      // Composite persistent layer with depth testing (before postprocessing)
      if (this.persistentTex && this.persistentDepth && this.prevDepth) {
        const persistentSample = texture(this.persistentTex, this.uvNode);
        const persistentDepthSample = texture(
          this.persistentDepth,
          this.uvNode
        ).x;

        // Blend scene depths based on transition mix
        const prevDepthSample = texture(this.prevDepth, this.uvNode).x;
        const blendedDepth = this.nextDepth
          ? mix(
              prevDepthSample,
              texture(this.nextDepth, this.uvNode).x,
              this.mixNode
            )
          : prevDepthSample;

        // Depth test: if persistent is closer (smaller depth), use persistent color
        // step(a, b) returns 1 if b >= a, else 0
        const depthTest = step(persistentDepthSample, blendedDepth);
        colorNode = mix(colorNode, persistentSample.rgb, depthTest);
      }

      // Apply optional postprocessing chain after compositing persistent layer
      if (
        Array.isArray(this.postprocessingChain) &&
        this.postprocessingChain.length > 0
      ) {
        const context = {
          uvNode: this.uvNode,
          mixNode: this.mixNode,
          prevTex: this.prevTex,
          prevNormal: this.prevNormal,
          prevDepth: this.prevDepth,
          nextTex: this.nextTex,
          nextNormal: this.nextNormal,
          nextDepth: this.nextDepth,
        };

        for (const fx of this.postprocessingChain) {
          colorNode = fx(colorNode, context);
        }
      }

      this.material.colorNode = colorNode;

      // Force material to recognize the shader node change
      this.material.needsUpdate = true;
    }
  }

  setInputs(inputs) {
    const {
      prev,
      next,
      prevNormal,
      prevDepth,
      nextNormal,
      nextDepth,
      persistent,
      persistentDepth,
    } = inputs;
    let graphDirty = false;

    // Update textures and check for changes
    if (prev && prev !== this.prevTex) {
      this.prevTex = prev;
      graphDirty = true;
    }
    if (next && next !== this.nextTex) {
      this.nextTex = next;
      graphDirty = true;
    }
    if (persistent !== undefined && persistent !== this.persistentTex) {
      this.persistentTex = persistent;
      graphDirty = true;
    }

    // Update optional attachments (sticky: keep existing if undefined)
    if (prevNormal !== undefined) this.prevNormal = prevNormal;
    if (prevDepth !== undefined) this.prevDepth = prevDepth;
    if (nextNormal !== undefined) this.nextNormal = nextNormal;
    if (nextDepth !== undefined) this.nextDepth = nextDepth;
    if (persistentDepth !== undefined) this.persistentDepth = persistentDepth;

    // Rebuild only when textures change OR when transition was updated
    if (graphDirty || this._needsRebuild) {
      this.rebuildGraph();
      this._needsRebuild = false;
    }
  }

  setMix(value) {
    this.mixNode.value = value;
  }

  setTransition(transition) {
    const changed = transition !== this.transition;
    this.transition = transition ?? null;
    // Mark that we need to rebuild on next setInputs call
    if (changed) {
      this._needsRebuild = true;
    }
  }

  /**
   * Set a chain of postprocessing functions to be applied after the transition blend.
   * Each function receives (colorNode, context) and should return a new node.
   * This is intended to be updated on scene/transition changes, not per-frame.
   */
  setPostprocessingChain(chain) {
    const nextChain = Array.isArray(chain) ? chain : null;
    const changed = nextChain !== this.postprocessingChain;
    this.postprocessingChain = nextChain;
    if (changed) {
      this._needsRebuild = true;
    }
  }
}

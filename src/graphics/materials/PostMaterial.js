import { texture, uv, uniform, vec3 } from "three/tsl";
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

      // Apply optional postprocessing chain after the base transition blend.
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
          if (typeof fx === "function") {
            const nextColor = fx(colorNode, context);
            if (nextColor) colorNode = nextColor;
          }
        }
      }

      this.material.colorNode = colorNode;

      // Force material to recognize the shader node change
      this.material.needsUpdate = true;
    }
  }

  setInputs(inputs) {
    const { prev, next, prevNormal, prevDepth, nextNormal, nextDepth } = inputs;
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

    // Update optional attachments (sticky: keep existing if undefined)
    if (prevNormal !== undefined) this.prevNormal = prevNormal;
    if (prevDepth !== undefined) this.prevDepth = prevDepth;
    if (nextNormal !== undefined) this.nextNormal = nextNormal;
    if (nextDepth !== undefined) this.nextDepth = nextDepth;

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
  setpostprocessingChain(chain) {
    const nextChain = Array.isArray(chain) ? chain : null;
    const changed = nextChain !== this.postprocessingChain;
    this.postprocessingChain = nextChain;
    if (changed) {
      this._needsRebuild = true;
    }
  }
}

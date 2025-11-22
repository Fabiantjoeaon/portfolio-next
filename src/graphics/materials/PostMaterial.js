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

    this.rebuildGraph();
  }

  rebuildGraph() {
    if (this.prevTex && this.nextTex && this.transition) {
      this.material.colorNode = this.transition.buildColorNode({
        uvNode: uv(),
        mixNode: this.mixNode,
        prevTex: this.prevTex,
        prevNormal: this.prevNormal,
        prevDepth: this.prevDepth,
        nextTex: this.nextTex,
        nextNormal: this.nextNormal,
        nextDepth: this.nextDepth,
      });

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
}

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
    // Default to black
    // let colorNode = vec3(0.0, 0.0, 0.0);

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
    }
    //   if (node) colorNode = node;
    // else {
    //   console.log("FALLBACK");
    //   // Fallback: Show prev, or next, or black
    //   const tex = this.prevTex || this.nextTex;
    //   if (tex) {
    //     const sample = texture(tex, uv());
    //     colorNode = sample.rgb;
    //   }
    // }
  }

  setInputs(inputs) {
    const { prev, next, prevNormal, prevDepth, nextNormal, nextDepth } = inputs;
    let graphDirty = false;

    // if (prev) console.log(prev.id);

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

    if (graphDirty) {
      this.rebuildGraph();
    }
  }

  setMix(value) {
    this.mixNode.value = value;
  }

  setTransition(transition) {
    this.transition = transition ?? null;
    this.rebuildGraph();
  }
}

import { texture, uv, mix, uniform, vec3 } from "three/tsl";
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

    // Placeholders; will be set via setters
    this.prevTex = null;
    this.nextTex = null;
    this.lastPrev = null;
    this.lastNext = null;
    this.transition = null;

    this.rebuildGraph();
  }

  rebuildGraph() {
    if (this.prevTex && this.nextTex && this.transition) {
      const colorNode = this.transition.buildColorNode({
        prevTex: this.prevTex,
        nextTex: this.nextTex,
        uvNode: uv(),
        mixNode: this.mixNode,
        prevNormal: this.prevNormal,
        prevDepth: this.prevDepth,
        nextNormal: this.nextNormal,
        nextDepth: this.nextDepth,
      });
      this.material.colorNode = colorNode ?? vec3(0.0, 0.0, 0.0);
    } else if (this.prevTex) {
      const prevSample = texture(this.prevTex, uv());
      this.material.colorNode = prevSample.rgb;
    } else if (this.nextTex) {
      const nextSample = texture(this.nextTex, uv());
      this.material.colorNode = nextSample.rgb;
    } else {
      this.material.colorNode = vec3(0.0, 0.0, 0.0);
    }
  }

  setInputs(inputs) {
    // Required
    const newPrev = inputs.prev || this.prevTex;
    const newNext = inputs.next || this.nextTex;
    const changed = newPrev !== this.lastPrev || newNext !== this.lastNext;
    this.prevTex = newPrev;
    this.nextTex = newNext;

    // Optional GBuffer attachments
    this.prevNormal = inputs.prevNormal ?? this.prevNormal ?? null;
    this.prevDepth = inputs.prevDepth ?? this.prevDepth ?? null;
    this.nextNormal = inputs.nextNormal ?? this.nextNormal ?? null;
    this.nextDepth = inputs.nextDepth ?? this.nextDepth ?? null;

    if (changed) {
      this.lastPrev = this.prevTex;
      this.lastNext = this.nextTex;
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

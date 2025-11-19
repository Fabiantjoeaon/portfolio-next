import {
  texture,
  uv,
  mix,
  uniform,
  vec3,
  smoothstep,
  sub,
  add,
  mul,
  clamp,
} from "three/tsl";
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
    // Feather width around the swipe edge in UV space (default small)
    this.featherNode = uniform(0.02);

    // Placeholders; will be set via setters
    this.prevTex = null;
    this.nextTex = null;
    this.lastPrev = null;
    this.lastNext = null;

    this.rebuildGraph();
  }

  rebuildGraph() {
    if (this.prevTex && this.nextTex) {
      const prevSample = texture(this.prevTex, uv());
      const nextSample = texture(this.nextTex, uv());

      // UV.x from fullscreen triangle spans ~0..2; rescale to 0..1
      const u = uv().x;
      const u01 = clamp(mul(u, 0.5), 0.0, 1.0);

      // Swipe left->right with feather
      const edge0 = sub(this.mixNode, this.featherNode);
      const edge1 = add(this.mixNode, this.featherNode);
      const swipe = smoothstep(edge0, edge1, u01);

      this.material.colorNode = mix(prevSample.rgb, nextSample.rgb, swipe);
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

    // Optional (kept for future effects)
    // inputs.prevNormal
    // inputs.prevDepth
    // inputs.nextNormal
    // inputs.nextDepth

    if (changed) {
      this.lastPrev = this.prevTex;
      this.lastNext = this.nextTex;
      this.rebuildGraph();
    }
  }

  setMix(value) {
    this.mixNode.value = value;
  }

  setFeather(value) {
    this.featherNode.value = value;
  }
}

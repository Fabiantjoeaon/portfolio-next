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
      console.log(
        `rebuildGraph: using prevTex.id=${this.prevTex.id}, nextTex.id=${this.nextTex.id}`
      );

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

      // Force material to recognize the change
      this.material.needsUpdate = true;
    }
  }

  setInputs(inputs) {
    const { prev, next, prevNormal, prevDepth, nextNormal, nextDepth } = inputs;
    let graphDirty = false;

    console.log(
      `setInputs: prev.id=${prev?.id}, next.id=${next?.id}, this.prevTex.id=${this.prevTex?.id}, this.nextTex.id=${this.nextTex?.id}, needsRebuild=${this._needsRebuild}`
    );

    // ALWAYS update textures, even if they're the same objects
    // This ensures WebGPU recognizes the change
    if (prev) {
      const changed = prev !== this.prevTex;
      this.prevTex = prev;
      if (changed) {
        graphDirty = true;
        console.log(`  -> prevTex changed to ${prev.id}`);
      }
    }
    if (next) {
      const changed = next !== this.nextTex;
      this.nextTex = next;
      if (changed) {
        graphDirty = true;
        console.log(`  -> nextTex changed to ${next.id}`);
      }
    }

    // Update optional attachments (sticky: keep existing if undefined)
    if (prevNormal !== undefined) this.prevNormal = prevNormal;
    if (prevDepth !== undefined) this.prevDepth = prevDepth;
    if (nextNormal !== undefined) this.nextNormal = nextNormal;
    if (nextDepth !== undefined) this.nextDepth = nextDepth;

    // ALWAYS rebuild if we have valid textures and a transition
    // This ensures the shader always uses the latest texture assignments
    if (this.prevTex && this.nextTex && this.transition) {
      console.log(
        `  -> REBUILDING GRAPH (graphDirty=${graphDirty}, needsRebuild=${this._needsRebuild})`
      );
      this.rebuildGraph();
      this._needsRebuild = false;
    } else if (this._needsRebuild) {
      // Handle the case where transition changed but textures aren't ready yet
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

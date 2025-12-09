import * as THREE from "three/webgpu";
import {
  Fn,
  uniform,
  texture,
  vec2,
  vec3,
  float,
  floor,
  fract,
  mix,
  select,
  attribute,
  positionLocal,
} from "three/tsl";

/**
 * Simple Cloth VAT Material
 * Uses separate position texture for vertex animation
 * Supports optional bounds remapping for OpenVAT format
 */
export class ClothVATMaterial extends THREE.MeshStandardNodeMaterial {
  constructor(options = {}) {
    const {
      posTexture,
      frameCount,
      fps = 30,
      // Optional bounds for OpenVAT remapping (if not provided, raw values used)
      minBounds = null,
      maxBounds = null,
      ...materialOptions
    } = options;

    super(materialOptions);

    this.posTexture = posTexture;
    this.frameCount = frameCount;
    this.fps = fps;
    this.useRemapping = minBounds !== null && maxBounds !== null;

    // Uniforms
    this.timeUniform = uniform(0.0);
    this.speedUniform = uniform(1.0);
    this.loopUniform = uniform(1.0);

    // Texture dimensions
    this.texWidthUniform = uniform(posTexture.image.width);
    this.texHeightUniform = uniform(posTexture.image.height);
    this.frameCountUniform = uniform(frameCount);

    // Bounds for remapping (OpenVAT format)
    if (this.useRemapping) {
      this.minBoundsUniform = uniform(new THREE.Vector3(minBounds.x, minBounds.y, minBounds.z));
      this.maxBoundsUniform = uniform(new THREE.Vector3(maxBounds.x, maxBounds.y, maxBounds.z));
    }

    // Internal state
    this._playing = true;
    this._time = 0;
    this._duration = frameCount / fps;

    // Setup position node
    this._setupPositionNode();
  }

  _setupPositionNode() {
    const posTex = texture(this.posTexture);
    const texHeight = this.texHeightUniform;
    const frameCount = this.frameCountUniform;
    const timeU = this.timeUniform;
    const loopU = this.loopUniform;
    const useRemapping = this.useRemapping;
    const minBounds = this.useRemapping ? this.minBoundsUniform : null;
    const maxBounds = this.useRemapping ? this.maxBoundsUniform : null;

    this.positionNode = Fn(() => {
      // Get VAT lookup from uv1.x (vertex index normalized to 0-1)
      const vertexU = attribute("vatLookup", "float");

      // Calculate frame from normalized time (0-1)
      const totalFrames = frameCount.sub(1);
      const frameFloat = timeU.mul(totalFrames);

      // Get current frame index
      const frame0 = floor(frameFloat);
      const frame1 = select(
        loopU.greaterThan(0.5),
        frame0.add(1).mod(frameCount),
        frame0.add(1).min(totalFrames)
      );
      const frameFract = fract(frameFloat);

      // Calculate V coordinates for texture sampling
      // V = (frame + 0.5) / textureHeight
      const v0 = frame0.add(float(0.5)).div(texHeight);
      const v1 = frame1.add(float(0.5)).div(texHeight);

      // Sample position texture
      const sample0 = posTex.sample(vec2(vertexU, v0)).xyz;
      const sample1 = posTex.sample(vec2(vertexU, v1)).xyz;

      // Interpolate between frames
      const normalizedPos = mix(sample0, sample1, frameFract);

      // Apply bounds remapping if enabled (OpenVAT format)
      if (useRemapping) {
        const boundsRange = maxBounds.sub(minBounds);
        return minBounds.add(normalizedPos.mul(boundsRange));
      }

      // Direct output for formats that store world positions
      return normalizedPos;
    })();
  }

  update(delta) {
    if (!this._playing) return;

    this._time += delta * this.speedUniform.value;

    if (this.loopUniform.value > 0.5) {
      this._time = this._time % this._duration;
    } else {
      this._time = Math.min(this._time, this._duration);
    }

    this.timeUniform.value = this._time / this._duration;
  }

  setTime(t) {
    this._time = t * this._duration;
    this.timeUniform.value = Math.max(0, Math.min(1, t));
  }

  play() {
    this._playing = true;
  }

  pause() {
    this._playing = false;
  }

  setSpeed(speed) {
    this.speedUniform.value = speed;
  }

  setLoop(loop) {
    this.loopUniform.value = loop ? 1.0 : 0.0;
  }

  get duration() {
    return this._duration;
  }

  get time() {
    return this.timeUniform.value;
  }

  get playing() {
    return this._playing;
  }
}


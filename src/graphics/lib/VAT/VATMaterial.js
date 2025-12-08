import * as THREE from "three/webgpu";
import {
  Fn,
  uniform,
  texture,
  vec2,
  normalLocal,
  floor,
  fract,
  mix,
  select,
  attribute,
} from "three/tsl";

/**
 * VAT (Vertex Animation Texture) Material
 *
 * Extends MeshStandardNodeMaterial with vertex animation from EXR textures.
 * Supports optional animated normals.
 *
 * @example
 * const material = new VATMaterial({
 *   vatTexture,
 *   remapInfo,
 *   useNormals: true,
 *   color: 0xff6b6b,
 *   roughness: 0.4,
 * });
 */
export class VATMaterial extends THREE.MeshStandardNodeMaterial {
  constructor(options = {}) {
    const {
      vatTexture,
      remapInfo,
      useNormals = false,
      fps = 30,
      ...materialOptions
    } = options;

    super(materialOptions);

    this.vatTexture = vatTexture;
    this.remapInfo = remapInfo;
    this.fps = fps;

    // Uniforms
    this.timeUniform = uniform(0.0);
    this.speedUniform = uniform(1.0);
    this.loopUniform = uniform(1.0); // 1.0 = loop, 0.0 = clamp
    this.useNormalsUniform = uniform(useNormals ? 1.0 : 0.0);
    this.interpolateUniform = uniform(1.0); // 1.0 = interpolate between frames

    // Texture info uniforms
    this.textureWidthUniform = uniform(vatTexture.image.width);
    this.textureHeightUniform = uniform(vatTexture.image.height);
    this.frameCountUniform = uniform(remapInfo.frames);
    
    // VAT vertex count (number of unique vertices in VAT texture)
    this.vatVertexCountUniform = uniform(remapInfo.vatVertexCount || vatTexture.image.width);

    // Remap bounds uniforms
    this.minBoundsUniform = uniform(remapInfo.min);
    this.maxBoundsUniform = uniform(remapInfo.max);

    // Internal state
    this._playing = true;
    this._time = 0;
    this._duration = remapInfo.frames / fps;

    // Setup the position node
    this._setupPositionNode();

    // Setup normal node if using animated normals
    if (useNormals) {
      this._setupNormalNode();
    }
  }

  /**
   * Setup the vertex position animation node
   */
  _setupPositionNode() {
    const vatTex = texture(this.vatTexture);
    const texHeight = this.textureHeightUniform;
    const frameCount = this.frameCountUniform;
    const minBounds = this.minBoundsUniform;
    const maxBounds = this.maxBoundsUniform;
    const timeU = this.timeUniform;
    const loopU = this.loopUniform;
    const interpolateU = this.interpolateUniform;

    this.positionNode = Fn(() => {
      // Get the VAT lookup attribute (normalized U coordinate for texture sampling)
      // This value comes directly from the UV1.x coordinate in the FBX
      const vertexU = attribute("vatLookup", "float");

      // Calculate frame from normalized time (0-1)
      const totalFrames = frameCount.sub(1);
      const frameFloat = timeU.mul(totalFrames);

      // Get current and next frame indices
      const frame0 = floor(frameFloat);
      const frame1 = select(
        loopU.greaterThan(0.5),
        frame0.add(1).mod(frameCount),
        frame0.add(1).min(totalFrames)
      );
      const frameFract = fract(frameFloat);

      // Calculate V coordinates for both frames
      // Position data is in the first half of the texture (rows 0 to frameCount-1)
      // Add 0.5 to sample center of texel
      const v0 = frame0.add(0.5).div(texHeight);
      const v1 = frame1.add(0.5).div(texHeight);

      // Sample VAT texture at both frames
      const sampleUV0 = vec2(vertexU, v0);
      const sampleUV1 = vec2(vertexU, v1);

      const sample0 = vatTex.sample(sampleUV0).xyz;
      const sample1 = vatTex.sample(sampleUV1).xyz;

      // Interpolate between frames
      const interpolatedSample = mix(
        sample0,
        sample1,
        frameFract.mul(interpolateU)
      );

      // Use non-interpolated if interpolation is off
      const finalSample = mix(sample0, interpolatedSample, interpolateU);

      // Remap from 0-1 to world position using min/max bounds
      const boundsRange = maxBounds.sub(minBounds);
      const position = minBounds.add(finalSample.mul(boundsRange));

      // For Blender VAT exports, the position IS the final position (not an offset)
      return position;
    })();
  }

  /**
   * Setup the normal animation node
   * For VATs with normals, the normals are typically stored in the lower half
   * of the texture (after position frames)
   */
  _setupNormalNode() {
    const vatTex = texture(this.vatTexture);
    const texHeight = this.textureHeightUniform;
    const frameCount = this.frameCountUniform;
    const timeU = this.timeUniform;
    const loopU = this.loopUniform;
    const interpolateU = this.interpolateUniform;
    const useNormalsU = this.useNormalsUniform;

    this.normalNode = Fn(() => {
      // Get the VAT lookup attribute (normalized U coordinate for texture sampling)
      const vertexU = attribute("vatLookup", "float");

      // Calculate frame from normalized time (0-1)
      const totalFrames = frameCount.sub(1);
      const frameFloat = timeU.mul(totalFrames);

      // Get current and next frame indices
      const frame0 = floor(frameFloat);
      const frame1 = select(
        loopU.greaterThan(0.5),
        frame0.add(1).mod(frameCount),
        frame0.add(1).min(totalFrames)
      );
      const frameFract = fract(frameFloat);

      // Normals are stored in the second half of the texture
      // V coordinate offset by frameCount (position frames take first half)
      const normalOffset = frameCount;
      const v0 = frame0.add(normalOffset).add(0.5).div(texHeight);
      const v1 = frame1.add(normalOffset).add(0.5).div(texHeight);

      // Sample normal texture at both frames
      const sampleUV0 = vec2(vertexU, v0);
      const sampleUV1 = vec2(vertexU, v1);

      const sample0 = vatTex.sample(sampleUV0).xyz;
      const sample1 = vatTex.sample(sampleUV1).xyz;

      // Interpolate between frames
      const interpolatedSample = mix(
        sample0,
        sample1,
        frameFract.mul(interpolateU)
      );

      // Use non-interpolated if interpolation is off
      const finalSample = mix(sample0, interpolatedSample, interpolateU);

      // Remap from 0-1 to -1 to 1 range for normals
      const animatedNormal = finalSample.mul(2.0).sub(1.0).normalize();

      // Blend between static and animated normals based on useNormals flag
      return mix(normalLocal, animatedNormal, useNormalsU);
    })();
  }

  /**
   * Update the animation time
   * @param {number} delta - Delta time in seconds
   */
  update(delta) {
    if (!this._playing) return;

    this._time += delta * this.speedUniform.value;

    if (this.loopUniform.value > 0.5) {
      // Loop mode
      this._time = this._time % this._duration;
    } else {
      // Clamp mode
      this._time = Math.min(this._time, this._duration);
    }

    // Convert to normalized time (0-1)
    this.timeUniform.value = this._time / this._duration;
  }

  /**
   * Set animation time (normalized 0-1)
   * @param {number} t - Normalized time
   */
  setTime(t) {
    this._time = t * this._duration;
    this.timeUniform.value = Math.max(0, Math.min(1, t));
  }

  /**
   * Set specific frame
   * @param {number} frame - Frame index
   */
  setFrame(frame) {
    const normalizedTime = frame / (this.remapInfo.frames - 1);
    this.setTime(normalizedTime);
  }

  /**
   * Get current frame
   * @returns {number}
   */
  getFrame() {
    return Math.round(this.timeUniform.value * (this.remapInfo.frames - 1));
  }

  /**
   * Play the animation
   */
  play() {
    this._playing = true;
  }

  /**
   * Pause the animation
   */
  pause() {
    this._playing = false;
  }

  /**
   * Check if animation is playing
   * @returns {boolean}
   */
  get playing() {
    return this._playing;
  }

  /**
   * Set playback speed
   * @param {number} speed
   */
  setSpeed(speed) {
    this.speedUniform.value = speed;
  }

  /**
   * Get playback speed
   * @returns {number}
   */
  getSpeed() {
    return this.speedUniform.value;
  }

  /**
   * Set loop mode
   * @param {boolean} loop
   */
  setLoop(loop) {
    this.loopUniform.value = loop ? 1.0 : 0.0;
  }

  /**
   * Get loop mode
   * @returns {boolean}
   */
  getLoop() {
    return this.loopUniform.value > 0.5;
  }

  /**
   * Set frame interpolation
   * @param {boolean} interpolate
   */
  setInterpolate(interpolate) {
    this.interpolateUniform.value = interpolate ? 1.0 : 0.0;
  }

  /**
   * Enable/disable animated normals
   * @param {boolean} useNormals
   */
  setUseNormals(useNormals) {
    this.useNormalsUniform.value = useNormals ? 1.0 : 0.0;
  }

  /**
   * Get animation duration in seconds
   * @returns {number}
   */
  get duration() {
    return this._duration;
  }

  /**
   * Get total frame count
   * @returns {number}
   */
  get frameCount() {
    return this.remapInfo.frames;
  }

  /**
   * Get current normalized time (0-1)
   * @returns {number}
   */
  get time() {
    return this.timeUniform.value;
  }
}


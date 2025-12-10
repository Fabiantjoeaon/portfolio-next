import * as THREE from "three/webgpu";
import { NodeMaterial, RenderTarget, HalfFloatType } from "three/webgpu";
import {
  uniform,
  uv,
  vec3,
  vec4,
  float,
  sin,
  cos,
  mix,
  time,
  Fn,
} from "three/tsl";
import { Grid } from "./Grid/index.js";
import { GBuffer } from "../../graphics/GBuffer.js";

/**
 * Manages objects that persist across all scenes.
 * These objects are rendered into their own gbuffer and composited
 * with depth testing to maintain proper occlusion.
 *
 * The background plane is rendered separately so glass tiles can sample it.
 */
export default class PersistentScene {
  /**
   * @param {THREE.WebGPURenderer} renderer - WebGPU renderer for compute shaders
   * @param {number} width - Viewport width
   * @param {number} height - Viewport height
   * @param {number} devicePixelRatio - Device pixel ratio
   */
  constructor(renderer, width, height, devicePixelRatio = 1) {
    this.renderer = renderer;
    this._devicePixelRatio = devicePixelRatio;

    // Main scene for foreground elements (grid tiles)
    this.scene = new THREE.Scene();

    // Separate scene for background (rendered first, sampled by tiles)
    this.backgroundScene = new THREE.Scene();

    this.testObject = null;
    this.gbuffer = new GBuffer(width, height, devicePixelRatio);
    this.grid = null;
    this.backgroundPlane = null;

    // Create background render target
    this._createBackgroundTarget(width, height, devicePixelRatio);

    // Initialize background plane (in backgroundScene)
    this._setupBackground();

    // Initialize grid (in main scene)
    this._setupGrid();
  }

  /**
   * Create render target for background with depth
   */
  _createBackgroundTarget(width, height, devicePixelRatio) {
    const w = Math.max(1, Math.floor(width * devicePixelRatio));
    const h = Math.max(1, Math.floor(height * devicePixelRatio));

    this.backgroundTarget = new RenderTarget(w, h, {
      type: HalfFloatType,
      depthBuffer: true,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });

    // Add depth texture for sampling in post-processing
    this.backgroundTarget.depthTexture = new THREE.DepthTexture(w, h);
    this.backgroundTarget.depthTexture.format = THREE.DepthFormat;
    this.backgroundTarget.depthTexture.type = THREE.UnsignedIntType;
  }

  /**
   * Get the background texture for sampling
   * @returns {THREE.Texture}
   */
  get backgroundTexture() {
    return this.backgroundTarget?.texture ?? null;
  }

  /**
   * Get the background depth texture for depth compositing
   * @returns {THREE.DepthTexture}
   */
  get backgroundDepth() {
    return this.backgroundTarget?.depthTexture ?? null;
  }

  /**
   * Setup the GPU-driven grid
   */
  _setupGrid() {
    this.grid = new Grid({
      size: 16, // Number of columns (rows auto-calculated from aspect ratio)
      gap: 0.37,
      cornerRadius: 0.12,
      depth: 0.08,
      bevel: {
        enabled: true,
        thickness: 0.1,
        size: 0.085,
        segments: 1,
      },
      color: 0xffffff,
      opacity: 1,
      renderer: this.renderer,
      position: new THREE.Vector3(0, 0, -5), // Behind other content
    });

    // Update background plane when grid rebuilds
    this.grid.onRebuild((dimensions) => {
      this._updateBackgroundSize(dimensions);
    });

    // Initial background size update
    this._updateBackgroundSize(this.grid.getDimensions());

    this.scene.add(this.grid);
  }

  /**
   * Setup the animated gradient background plane
   */
  _setupBackground() {
    // Create plane geometry (will be scaled to match grid)
    const geometry = new THREE.PlaneGeometry(1, 1);

    // Create material with animated gradient shader
    const material = new NodeMaterial();

    // Gradient colors - can be customized
    const color1 = uniform(new THREE.Color(0x1a1a2e)); // Deep blue-purple
    const color2 = uniform(new THREE.Color(0x16213e)); // Dark navy
    const color3 = uniform(new THREE.Color(0x0f3460)); // Midnight blue
    const speed = uniform(0.3);

    material.colorNode = Fn(() => {
      const uvCoord = uv();

      // Create animated wave pattern
      const wave1 = sin(uvCoord.y.mul(3.0).add(time.mul(speed)))
        .mul(0.5)
        .add(0.5);
      const wave2 = cos(uvCoord.x.mul(2.0).sub(time.mul(speed.mul(0.7))))
        .mul(0.5)
        .add(0.5);

      // Combine waves for organic movement
      const blend = wave1.mul(0.6).add(wave2.mul(0.4));

      // Create diagonal gradient base
      const diagonal = uvCoord.x.add(uvCoord.y).mul(0.5);

      // Mix colors based on position and animation
      const mixedColor1 = mix(vec3(color1), vec3(color2), diagonal);
      const mixedColor2 = mix(vec3(color2), vec3(color3), blend);
      const finalColor = mix(
        mixedColor1,
        mixedColor2,
        blend.mul(0.5).add(0.25)
      );

      return vec4(finalColor, float(1.0));
    })();

    material.side = THREE.DoubleSide;

    // Store uniforms for external access
    material.uniforms = {
      color1,
      color2,
      color3,
      speed,
    };

    this.backgroundPlane = new THREE.Mesh(geometry, material);
    this.backgroundPlane.position.z = -6.5; // Behind the grid (grid is at z=-5)
    // Add to separate background scene (not main scene)
    this.backgroundScene.add(this.backgroundPlane);
  }

  /**
   * Update background plane to match grid dimensions
   * @param {{ width: number, height: number }} dimensions - Grid dimensions
   * @param {number} padding - Extra padding around the grid
   */
  _updateBackgroundSize(dimensions, padding = 1.3) {
    if (!this.backgroundPlane || !dimensions) return;

    const { width, height } = dimensions;
    // Ensure background is large enough to fill the view
    // At z=-6.5 from camera at z=5 with 75deg FOV, we need ~20+ units
    const minSize = 30;
    const bgWidth = Math.max(width + padding * 2, minSize);
    const bgHeight = Math.max(height + padding * 2, minSize);
    this.backgroundPlane.scale.set(bgWidth, bgHeight, 1);
  }

  /**
   * Add an object to the persistent scene
   */
  add(object) {
    this.scene.add(object);
  }

  /**
   * Remove an object from the persistent scene
   */
  remove(object) {
    this.scene.remove(object);
  }

  /**
   * Clear all objects from the persistent scene
   */
  clear() {
    this.scene.clear();
  }

  /**
   * Check if the persistent scene is empty
   */
  isEmpty() {
    return this.scene.children.length === 0;
  }

  /**
   * Sync the persistent camera with a source camera
   * Copies all camera properties to match the active scene's view.
   * For objects to stay in world space, position them relative to camera.
   * @param {THREE.Camera} sourceCamera - Camera to copy properties from
   */
  // syncCamera(sourceCamera) {
  //   this.camera.position.copy(sourceCamera.position);
  //   this.camera.quaternion.copy(sourceCamera.quaternion);
  //   this.camera.fov = sourceCamera.fov;
  //   this.camera.aspect = sourceCamera.aspect;
  //   this.camera.near = sourceCamera.near;
  //   this.camera.far = sourceCamera.far;
  //   this.camera.updateProjectionMatrix();
  // }

  /**
   * Update the camera aspect ratio
   * @param {number} aspect - New aspect ratio
   */
  updateCameraAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  async update(time, delta) {
    if (this.testObject) {
      this.testObject.rotation.x = time * 0.0005;
      this.testObject.rotation.y = time * 0.001;
    }

    // Update grid compute shader
    if (this.grid) {
      await this.grid.update(time, delta);
    }
  }

  /**
   * Render the background to its own render target
   * Call this BEFORE rendering active scenes so tiles can sample it
   * @param {THREE.Camera} camera - The camera to render with
   */
  renderBackground(camera) {
    if (!this.backgroundTarget || !this.renderer) return;

    const currentTarget = this.renderer.getRenderTarget();
    const currentAutoClear = this.renderer.autoClear;

    this.renderer.setRenderTarget(this.backgroundTarget);
    this.renderer.autoClear = true;
    // Clear with transparent - only the gradient plane will have color
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.backgroundScene, camera);

    this.renderer.setRenderTarget(currentTarget);
    this.renderer.autoClear = currentAutoClear;
  }

  /**
   * Resize render targets
   * @param {number} width
   * @param {number} height
   * @param {number} devicePixelRatio
   */
  resize(width, height, devicePixelRatio = this._devicePixelRatio) {
    this._devicePixelRatio = devicePixelRatio;

    // Resize background target
    if (this.backgroundTarget) {
      this.backgroundTarget.dispose();
    }
    this._createBackgroundTarget(width, height, devicePixelRatio);

    // Resize gbuffer
    if (this.gbuffer) {
      this.gbuffer.resize(width, height, devicePixelRatio);
    }
  }

  /**
   * Get the grid instance for external configuration
   * @returns {Grid}
   */
  getGrid() {
    return this.grid;
  }

  /**
   * Set the scene texture for glass effect sampling
   * @param {THREE.Texture} texture - The active scene's albedo texture
   */
  setSceneTexture(texture) {
    if (this.grid) {
      this.grid.setSceneTexture(texture);
    }
  }

  /**
   * Set the background texture for glass effect sampling
   * @param {THREE.Texture} texture - The background texture (or null to use internal)
   */
  setBackgroundTexture(texture = null) {
    if (this.grid) {
      // Use provided texture or fall back to internal background render
      this.grid.setBackgroundTexture(texture ?? this.backgroundTexture);
    }
  }

  /**
   * Get the background plane for external configuration
   * @returns {THREE.Mesh}
   */
  getBackgroundPlane() {
    return this.backgroundPlane;
  }

  /**
   * Dispose of all resources
   */
  dispose() {
    if (this.grid) {
      this.grid.dispose();
      this.grid = null;
    }
    if (this.backgroundPlane) {
      this.backgroundPlane.geometry.dispose();
      this.backgroundPlane.material.dispose();
      this.backgroundScene.remove(this.backgroundPlane);
      this.backgroundPlane = null;
    }
    if (this.backgroundTarget) {
      this.backgroundTarget.dispose();
      this.backgroundTarget = null;
    }
    if (this.gbuffer) {
      this.gbuffer.dispose();
      this.gbuffer = null;
    }
  }
}

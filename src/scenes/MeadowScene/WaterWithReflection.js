import {
  Color,
  Mesh,
  Vector3,
  Matrix4,
  MeshLambertNodeMaterial,
  DataTexture,
  RGBAFormat,
  RenderTarget,
  HalfFloatType,
  PerspectiveCamera,
} from "three/webgpu";

import {
  Fn,
  add,
  cameraPosition,
  div,
  normalize,
  positionWorld,
  sub,
  time,
  texture,
  vec2,
  vec3,
  max,
  dot,
  reflect,
  pow,
  length,
  float,
  uniform,
  reflector,
  mul,
  mix,
  diffuseColor,
  screenUV,
} from "three/tsl";

// Reflection helpers (similar to ReflectorNode internals)
const _cameraWorldPosition = new Vector3();
const _reflectorWorldPosition = new Vector3();
const _rotationMatrix = new Matrix4();
const _lookAtPosition = new Vector3(0, 0, -1);
const _view = new Vector3();
const _target = new Vector3();
const _waterNormal = new Vector3(0, 1, 0);

export class WaterWithReflection extends Mesh {
  constructor(geometry, options) {
    const material = new MeshLambertNodeMaterial();

    super(geometry, material);

    this.isWaterMesh = true;

    this.resolutionScale =
      options.resolutionScale !== undefined ? options.resolutionScale : 0.5;

    // External reflection setup
    this._renderer = null;
    this._externalScene = null;
    this._reflectionTarget = null;
    this._virtualCamera = new PerspectiveCamera();

    // Uniforms
    this.waterNormals = texture(options.waterNormals);
    this.alpha = uniform(options.alpha !== undefined ? options.alpha : 1.0);
    this.size = uniform(options.size !== undefined ? options.size : 1.0);
    this.sunColor = uniform(
      new Color(options.sunColor !== undefined ? options.sunColor : 0xffffff)
    );
    this.sunDirection = uniform(
      options.sunDirection !== undefined
        ? options.sunDirection
        : new Vector3(0.70707, 0.70707, 0.0)
    );
    this.waterColor = uniform(
      new Color(
        options.waterColor !== undefined ? options.waterColor : 0x7f7f7f
      )
    );
    this.distortionScale = uniform(
      options.distortionScale !== undefined ? options.distortionScale : 10.0
    );

    // Create a dummy texture initially for the external reflection
    this._dummyTexture = new DataTexture(
      new Uint8Array([0, 0, 0, 0]),
      1,
      1,
      RGBAFormat
    );
    this._dummyTexture.needsUpdate = true;
    this.externalTextureNode = texture(this._dummyTexture);

    this.externalStrength = uniform(0.0);
    this._externalStrengthValue =
      options.externalReflectionStrength !== undefined
        ? options.externalReflectionStrength
        : 0.5;

    // TSL
    const getNoise = Fn(([uv]) => {
      const offset = time;

      const uv0 = add(
        div(uv, 103),
        vec2(div(offset, 17), div(offset, 29))
      ).toVar();
      const uv1 = div(uv, 107)
        .sub(vec2(div(offset, -19), div(offset, 31)))
        .toVar();
      const uv2 = add(
        div(uv, vec2(8907.0, 9803.0)),
        vec2(div(offset, 101), div(offset, 97))
      ).toVar();
      const uv3 = sub(
        div(uv, vec2(1091.0, 1027.0)),
        vec2(div(offset, 109), div(offset, -113))
      ).toVar();

      const sample0 = this.waterNormals.sample(uv0);
      const sample1 = this.waterNormals.sample(uv1);
      const sample2 = this.waterNormals.sample(uv2);
      const sample3 = this.waterNormals.sample(uv3);

      const noise = sample0.add(sample1).add(sample2).add(sample3);

      return noise.mul(0.5).sub(1);
    });

    const noise = getNoise(positionWorld.xz.mul(this.size));
    const surfaceNormal = normalize(noise.xzy.mul(1.5, 1.0, 1.5));

    const worldToEye = cameraPosition.sub(positionWorld);
    const eyeDirection = normalize(worldToEye);

    const reflection = normalize(
      reflect(this.sunDirection.negate(), surfaceNormal)
    );
    const direction = max(0.0, dot(eyeDirection, reflection));
    const specularLight = pow(direction, 100).mul(this.sunColor).mul(2.0);
    const diffuseLight = max(dot(this.sunDirection, surfaceNormal), 0.0)
      .mul(this.sunColor)
      .mul(0.5);

    const distance = length(worldToEye);

    const distortion = surfaceNormal.xz
      .mul(float(0.001).add(float(1.0).div(distance)))
      .mul(this.distortionScale);

    // Material
    material.transparent = true;
    material.opacityNode = this.alpha;
    material.receivedShadowPositionNode = positionWorld.add(distortion);
    material.setupOutgoingLight = () => diffuseColor.rgb;

    material.colorNode = Fn(() => {
      // Reflector for scene reflection (this works correctly already)
      const mirrorSampler = reflector();
      const reflectionUV = mirrorSampler.uvNode.add(distortion);
      mirrorSampler.uvNode = reflectionUV;
      mirrorSampler.reflector.resolutionScale = this.resolutionScale;

      this.add(mirrorSampler.target);

      const theta = max(dot(eyeDirection, surfaceNormal), 0.0);
      const rf0 = float(0.3);
      const reflectance = mul(
        pow(float(1.0).sub(theta), 5.0),
        float(1.0).sub(rf0)
      ).add(rf0);
      const scatter = max(0.0, dot(surfaceNormal, eyeDirection)).mul(
        this.waterColor
      );

      // Base albedo calculation
      let albedo = mix(
        this.sunColor.mul(diffuseLight).mul(0.3).add(scatter),
        mirrorSampler.rgb
          .mul(specularLight)
          .add(mirrorSampler.rgb.mul(0.9))
          .add(vec3(0.1)),
        reflectance
      );

      // External texture is now rendered from a mirrored camera (like reflector)
      // Use the same UV approach: screenUV with X flipped (matches reflector's _defaultUV)
      // Plus distortion for water ripples
      const externalUV = vec2(
        float(1.0).sub(screenUV.x).add(distortion.x),
        screenUV.y.add(distortion.y)
      );

      const externalColor = this.externalTextureNode.sample(externalUV);

      // Blend based on strength uniform
      albedo = mix(
        albedo,
        externalColor.rgb.add(albedo.mul(0.3)),
        this.externalStrength
      );

      return albedo;
    })();
  }

  /**
   * Set up external scene reflection
   * @param {THREE.WebGPURenderer} renderer - The renderer
   * @param {THREE.Scene} externalScene - The scene to reflect (e.g., persistent scene)
   * @param {number} width - Render target width
   * @param {number} height - Render target height
   */
  setExternalScene(renderer, externalScene, width = 512, height = 512) {
    this._renderer = renderer;
    this._externalScene = externalScene;

    // Create reflection render target if needed
    if (!this._reflectionTarget) {
      this._reflectionTarget = new RenderTarget(width, height, {
        type: HalfFloatType,
        depthBuffer: true,
      });
    }

    // Enable external reflection
    this.externalStrength.value = this._externalStrengthValue;
  }

  /**
   * Update the virtual camera for reflection rendering
   * Mirrors the main camera across the water plane
   */
  _updateReflectionCamera(camera) {
    // Get water world position (this mesh's position)
    const waterPlaneY = this.getWorldPosition(new Vector3()).y;

    // Copy camera properties
    this._virtualCamera.copy(camera);

    // Get camera world position
    _cameraWorldPosition.setFromMatrixPosition(camera.matrixWorld);

    // Set reflector position (a point on the water plane)
    _reflectorWorldPosition.set(0, waterPlaneY, 0);

    // Calculate view direction
    _view.subVectors(_reflectorWorldPosition, _cameraWorldPosition);

    // Mirror the view across the water plane
    _view.reflect(_waterNormal).negate();
    _view.add(_reflectorWorldPosition);

    // Calculate look-at target
    _rotationMatrix.extractRotation(camera.matrixWorld);
    _lookAtPosition.set(0, 0, -1);
    _lookAtPosition.applyMatrix4(_rotationMatrix);
    _lookAtPosition.add(_cameraWorldPosition);

    _target.subVectors(_reflectorWorldPosition, _lookAtPosition);
    _target.reflect(_waterNormal).negate();
    _target.add(_reflectorWorldPosition);

    // Set up virtual camera
    this._virtualCamera.position.copy(_view);
    this._virtualCamera.up.set(0, 1, 0);
    this._virtualCamera.up.reflect(_waterNormal);
    this._virtualCamera.lookAt(_target);
    this._virtualCamera.updateMatrixWorld();
    this._virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
  }

  /**
   * Render the external scene reflection
   * Call this before the main scene render
   * @param {THREE.Camera} camera - The main camera
   */
  renderExternalReflection(camera) {
    if (!this._renderer || !this._externalScene || !this._reflectionTarget) {
      return;
    }

    // Update virtual camera to mirror main camera
    this._updateReflectionCamera(camera);

    // Store current state
    const currentRenderTarget = this._renderer.getRenderTarget();
    const currentAutoClear = this._renderer.autoClear;

    // Render external scene from mirrored camera
    this._renderer.setRenderTarget(this._reflectionTarget);
    this._renderer.autoClear = true;
    this._renderer.setClearColor(0x000000, 0);
    this._renderer.clear();
    this._renderer.render(this._externalScene, this._virtualCamera);

    // Restore state
    this._renderer.setRenderTarget(currentRenderTarget);
    this._renderer.autoClear = currentAutoClear;

    // Update texture node with reflection
    this.externalTextureNode.value = this._reflectionTarget.texture;
  }

  /**
   * Resize the reflection render target
   */
  resizeReflection(width, height) {
    if (this._reflectionTarget) {
      this._reflectionTarget.setSize(width, height);
    }
  }

  /**
   * Dispose resources
   */
  dispose() {
    if (this._reflectionTarget) {
      this._reflectionTarget.dispose();
      this._reflectionTarget = null;
    }
    if (this._dummyTexture) {
      this._dummyTexture.dispose();
    }
  }
}

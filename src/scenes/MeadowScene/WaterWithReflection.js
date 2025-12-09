import {
  Color,
  Mesh,
  Vector3,
  MeshLambertNodeMaterial,
  DataTexture,
  RGBAFormat,
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
} from "three/tsl";

/**
 * Extended WaterMesh that can reflect both its own scene AND an external texture
 * (like a persistent scene's gbuffer).
 *
 * Based on three.js WaterMesh from three/addons/objects/WaterMesh.js
 */
export class WaterWithReflection extends Mesh {
  constructor(geometry, options) {
    const material = new MeshLambertNodeMaterial();

    super(geometry, material);

    this.isWaterMesh = true;

    this.resolutionScale =
      options.resolutionScale !== undefined ? options.resolutionScale : 0.5;

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
      options.distortionScale !== undefined ? options.distortionScale : 20.0
    );

    this.externalTextureNode = texture(this._externalTextureRef);

    // Strength uniform - set to 0 initially (no external reflection until texture is set)
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

    material.setupOutgoingLight = () => diffuseColor.rgb; // backwards compatibility

    material.colorNode = Fn(() => {
      // Reflector creates proper planar reflection UVs
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

      // Base albedo calculation (same as WaterMesh)
      let albedo = mix(
        this.sunColor.mul(diffuseLight).mul(0.3).add(scatter),
        mirrorSampler.rgb
          .mul(specularLight)
          .add(mirrorSampler.rgb.mul(0.9))
          .add(vec3(0.1)),
        reflectance
      );

      // Blend external texture (persistent gbuffer) using reflector's UV
      // The reflectionUV has proper planar projection and distortion already applied
      // Try direct reflectionUV - reflector may handle coordinate mapping correctly
      const externalUV = reflectionUV;

      const externalColor = this.externalTextureNode.sample(externalUV);

      // Blend based on strength uniform (ignore alpha for now to debug)
      albedo = mix(
        albedo,
        externalColor.rgb.add(albedo.mul(0.3)),
        this.externalStrength
      );

      return albedo;
    })();
  }

  /**
   * Set the external reflection texture (e.g., persistent scene's albedo)
   * @param {THREE.Texture} tex
   */
  setExternalReflection(tex) {
    if (tex) {
      // Update the texture node's source texture
      // TextureNode stores the texture in .value for uniform-like access
      this.externalTextureNode.value = tex;
      // Also try updating the source directly if value doesn't work
      if (this.externalTextureNode.source) {
        this.externalTextureNode.source.value = tex;
      }
      // Enable the external reflection by setting strength
      this.externalStrength.value = this._externalStrengthValue;
    } else {
      // Disable by setting strength to 0
      this.externalStrength.value = 0.0;
    }
  }
}

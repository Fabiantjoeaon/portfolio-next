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
  screenUV,
  cameraProjectionMatrix,
  cameraViewMatrix,
  vec4,
} from "three/tsl";

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

    // Create a dummy texture initially
    this._dummyTexture = new DataTexture(
      new Uint8Array([0, 0, 0, 255]),
      1,
      1,
      RGBAFormat
    );
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
      // Reflector for scene reflection
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

      // // For external texture: use the same UV calculation as the reflector
      // // The reflector already calculates the correct reflection UVs
      // // We just need to use those same UVs for the external texture
      // const externalUV = mirrorSampler.uvNode;

      // // Alternative: if you need to use screen-space coordinates,
      // // calculate them based on the reflected ray
      // // const viewDirection = normalize(cameraPosition.sub(positionWorld));
      // // const reflectedVector = reflect(viewDirection.negate(), surfaceNormal);
      // //
      // // // Convert the reflected vector to screen space
      // // // This assumes the external texture was rendered from the same camera
      // // const reflectedScreenPos = positionWorld.add(reflectedVector);
      // // const clipSpace = cameraProjectionMatrix.mul(cameraViewMatrix.mul(vec4(reflectedScreenPos, 1.0)));
      // // const externalUV = clipSpace.xy.div(clipSpace.w).mul(0.5).add(0.5);

      // const externalColor = this.externalTextureNode.sample(externalUV);
      // Direct sampling with just distortion
      const externalUV = screenUV.add(distortion);
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

  setExternalReflection(tex) {
    if (tex) {
      this.externalTextureNode.value = tex;
      this.externalStrength.value = this._externalStrengthValue;
    } else {
      this.externalStrength.value = 0.0;
    }
  }
}

import {
  Color,
  Vector2,
  Vector4,
  Matrix3,
  DoubleSide,
  DataTexture,
  RGBAFormat,
} from "three";
import { NodeMaterial } from "three/webgpu";
import {
  texture,
  uv,
  uniform,
  vec2,
  vec3,
  vec4,
  float,
  min,
  max,
  smoothstep,
  mul,
  add,
  sub,
  div,
  mod,
  floor,
  attribute,
  positionLocal,
  mix,
  varying,
  Fn,
  abs,
  clamp,
  step,
  length,
} from "three/tsl";
import {
  glyphBoundsAttrName,
  glyphIndexAttrName,
  glyphUVAttrName,
} from "./GlyphsGeometry.js";

// Create a 1x1 white texture as default
const createDummyTexture = () => {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new DataTexture(data, 1, 1, RGBAFormat);
  tex.needsUpdate = true;
  return tex;
};

/**
 * Create a material for text rendering using WebGPU/TSL with MSDF texture sampling
 */
export function createTextDerivedMaterial(baseMaterial, options = {}) {
  const textMaterial = new NodeMaterial();

  console.log(
    "[TextDerivedMaterial] Creating NodeMaterial with MSDF support",
    options
  );

  // Uniforms - use provided texture or create dummy
  const colorUniform = uniform(new Color(0xffffff));
  const actualTexture = options.texture || createDummyTexture();

  // Verify texture is valid for WebGPU/TSL
  if (!actualTexture || !actualTexture.isTexture) {
    console.error(
      "[TextDerivedMaterial] Invalid texture provided:",
      actualTexture
    );
    throw new Error("TextDerivedMaterial requires a valid THREE.Texture");
  }

  if (!actualTexture.image) {
    console.error(
      "[TextDerivedMaterial] Texture has no image data:",
      actualTexture
    );
    throw new Error("Texture must have image data loaded");
  }

  // Ensure texture is properly configured
  actualTexture.needsUpdate = true;

  console.log("[TextDerivedMaterial] Using texture:", {
    isTexture: actualTexture.isTexture,
    hasImage: !!actualTexture.image,
    imageSize: `${actualTexture.image.width}x${actualTexture.image.height}`,
    uuid: actualTexture.uuid,
    minFilter: actualTexture.minFilter,
    magFilter: actualTexture.magFilter,
    format: actualTexture.format,
    type: actualTexture.type,
  });

  // For TSL, use texture() to create a TextureNode, not uniform()
  const uTroikaSDFTexture = texture(actualTexture);
  const textureSize = actualTexture.image
    ? new Vector2(actualTexture.image.width, actualTexture.image.height)
    : new Vector2(2048, 2048);
  const uTroikaSDFTextureSize = uniform(textureSize);
  const uTroikaSDFGlyphSize = uniform(64);

  // MSDF-specific uniforms
  const uTroikaIsMSDF = uniform(options.isMSDF ? 1 : 0); // 0 = SDF, 1 = MSDF
  const uTroikaDistanceRange = uniform(options.distanceRange || 4.0); // MSDF distance range

  // Effect uniforms
  const uTroikaEdgeOffset = uniform(0.0);
  const uTroikaBlurRadius = uniform(0.0);
  const uTroikaStrokeWidth = uniform(0.0);
  const uTroikaStrokeColor = uniform(new Color(0x808080));
  const uTroikaStrokeOpacity = uniform(1.0);
  const uTroikaFillOpacity = uniform(1.0);

  // Instance attributes from GlyphsGeometry
  const aTroikaGlyphBounds = attribute(glyphBoundsAttrName, "vec4");
  const aTroikaGlyphIndex = attribute(glyphIndexAttrName, "float");
  const aTroikaMSDFUVs = attribute(glyphUVAttrName, "vec4");

  // Varyings to pass data from vertex to fragment shader
  const vGlyphUV = varying(vec2());
  const vAtlasUV = varying(vec2());
  const vTextureChannel = varying(float());

  // Vertex shader: transform position and calculate UVs
  const vertexShader = Fn(() => {
    const glyphMin = aTroikaGlyphBounds.xy;
    const glyphMax = aTroikaGlyphBounds.zw;

    // Map quad vertices (0 to 1) to glyph bounds
    const transformedPos = vec3(
      mix(glyphMin.x, glyphMax.x, positionLocal.x),
      mix(glyphMin.y, glyphMax.y, positionLocal.y),
      positionLocal.z
    );

    // Check if we have MSDF UVs (non-zero width indicates MSDF mode)
    const hasMSDFUVs = aTroikaMSDFUVs.z.greaterThan(0.0);

    // For MSDF: use the direct UV coordinates from the attribute
    const msdfUV = aTroikaMSDFUVs.xy.add(
      positionLocal.xy.mul(aTroikaMSDFUVs.zw)
    );

    // For SDF: calculate atlas UVs from glyph index (existing logic)
    const txCols = uTroikaSDFTextureSize.x.div(uTroikaSDFGlyphSize);
    const glyphIndexDiv4 = floor(aTroikaGlyphIndex.div(4.0));
    const atlasCol = mod(glyphIndexDiv4, txCols);
    const atlasRow = floor(glyphIndexDiv4.div(txCols));
    const txUvPerSquare = uTroikaSDFGlyphSize.div(uTroikaSDFTextureSize);
    const atlasUVOffset = vec2(atlasCol, atlasRow).mul(txUvPerSquare);
    const sdfUV = atlasUVOffset.add(positionLocal.xy.mul(txUvPerSquare));

    // Select UV based on mode
    const finalAtlasUV = hasMSDFUVs.select(msdfUV, sdfUV);

    // Store in varyings
    vGlyphUV.assign(positionLocal.xy);
    vAtlasUV.assign(finalAtlasUV);
    vTextureChannel.assign(mod(aTroikaGlyphIndex, 4.0));

    return transformedPos;
  })();

  textMaterial.positionNode = vertexShader;

  // Fragment shader: Sample MSDF/SDF texture and calculate alpha
  const fragmentShader = Fn(() => {
    // Sample the texture at the calculated UV (uTroikaSDFTexture is already a TextureNode)
    const texSample = uTroikaSDFTexture.sample(vAtlasUV);

    // Calculate distance based on whether it's MSDF or SDF
    const isMSDF = uTroikaIsMSDF.equal(1.0);

    // MSDF median calculation: median(r, g, b) = max(min(r, g), min(max(r, g), b))
    const r = texSample.r;
    const g = texSample.g;
    const b = texSample.b;
    const minRG = min(r, g);
    const maxRG = max(r, g);
    const minMaxRGB = min(maxRG, b);
    const msdfDist = max(minRG, minMaxRGB);

    // For SDF mode, use the alpha channel or red channel
    const sdfDist = texSample.a;

    // Select distance based on mode
    let distance = isMSDF.select(msdfDist, sdfDist);

    // Apply edge offset for outline/stroke effects
    distance = distance.add(uTroikaEdgeOffset);

    // Calculate screenspace derivatives for adaptive anti-aliasing
    // Using a fixed value for now as fwidth might not be available in TSL yet
    const pixelScale = float(1.0 / 512.0).add(uTroikaBlurRadius);

    // Apply smoothstep for anti-aliased edges
    const threshold = float(0.5);
    let alpha = smoothstep(
      threshold.sub(pixelScale),
      threshold.add(pixelScale),
      distance
    );

    // Apply fill opacity
    alpha = alpha.mul(uTroikaFillOpacity);

    // Apply stroke if enabled
    const hasStroke = uTroikaStrokeWidth.greaterThan(0.0);
    const strokeAlpha = smoothstep(
      threshold.sub(pixelScale).sub(uTroikaStrokeWidth),
      threshold.sub(pixelScale),
      distance
    ).mul(uTroikaStrokeOpacity);

    // Mix fill and stroke colors
    const fillColor = vec3(colorUniform);
    const finalColor = hasStroke.select(
      mix(vec3(uTroikaStrokeColor), fillColor, alpha),
      fillColor
    );

    const finalAlpha = hasStroke.select(max(alpha, strokeAlpha), alpha);

    // Combine color and alpha
    return vec4(finalColor, finalAlpha);
  })();

  textMaterial.colorNode = fragmentShader;

  // Set material properties
  textMaterial.transparent = true;
  textMaterial.side = DoubleSide;
  textMaterial.depthWrite = false;
  textMaterial.depthTest = true;

  // Store uniform holders for updates
  textMaterial.uniforms = {
    colorUniform,
    uTroikaSDFTexture,
    uTroikaSDFTextureSize,
    uTroikaSDFGlyphSize,
    uTroikaIsMSDF,
    uTroikaDistanceRange,
    uTroikaEdgeOffset,
    uTroikaBlurRadius,
    uTroikaStrokeWidth,
    uTroikaStrokeColor,
    uTroikaStrokeOpacity,
    uTroikaFillOpacity,
    uTroikaSDFExponent: { value: 0 },
    uTroikaTotalBounds: { value: new Vector4(0, 0, 0, 0) },
    uTroikaClipRect: { value: new Vector4(0, 0, 0, 0) },
    uTroikaPositionOffset: { value: new Vector2() },
    uTroikaCurveRadius: { value: 0 },
    uTroikaOrient: { value: new Matrix3() },
    uTroikaUseGlyphColors: { value: true },
    uTroikaSDFDebug: { value: false },
  };

  // Mark as text material
  Object.defineProperty(textMaterial, "isTroikaTextMaterial", {
    value: true,
    writable: false,
  });

  textMaterial.isDerivedFrom = function (baseMat) {
    return false;
  };

  console.log("[TextDerivedMaterial] Material created with positionNode");

  return textMaterial;
}

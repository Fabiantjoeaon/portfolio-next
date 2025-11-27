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
  fwidth,
  Discard,
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

  // Uniforms - use provided texture or create dummy
  const colorUniform = uniform(new Color(0xffffff));
  const actualTexture = options.texture || createDummyTexture();

  // Verify texture is valid for WebGPU/TSL
  if (!actualTexture || !actualTexture.isTexture) {
    throw new Error("TextDerivedMaterial requires a valid THREE.Texture");
  }

  if (!actualTexture.image) {
    throw new Error("Texture must have image data loaded");
  }

  // Ensure texture is properly configured
  actualTexture.needsUpdate = true;

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
  const vGlyphDimensions = varying(vec2()); // For fwidth-based AA calculation

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
    // Flip V coordinate: positionLocal.y=0 (bottom) should map to uvY+uvH (bottom of glyph)
    // and positionLocal.y=1 (top) should map to uvY (top of glyph)
    const msdfUV = vec2(
      aTroikaMSDFUVs.x.add(positionLocal.x.mul(aTroikaMSDFUVs.z)),
      aTroikaMSDFUVs.y.add(positionLocal.y.oneMinus().mul(aTroikaMSDFUVs.w))
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

    // Calculate glyph dimensions (width, height) for AA calculation
    const glyphWidth = glyphMax.x.sub(glyphMin.x);
    const glyphHeight = glyphMax.y.sub(glyphMin.y);

    // Store in varyings
    vGlyphUV.assign(positionLocal.xy);
    vAtlasUV.assign(finalAtlasUV);
    vTextureChannel.assign(mod(aTroikaGlyphIndex, 4.0));
    vGlyphDimensions.assign(vec2(glyphWidth, glyphHeight));

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

    // Calculate adaptive anti-aliasing using fwidth (like Troika)
    // This calculates the rate of change of UV across the screen
    // aaDist = length(fwidth(vGlyphUV * vGlyphDimensions)) * 0.5
    const glyphUVScaled = vGlyphUV.mul(vGlyphDimensions);
    const aaDist = length(fwidth(glyphUVScaled)).mul(0.5);

    // Convert MSDF distance to signed distance (Troika convention: negative = inside, positive = outside)
    // MSDF: values > 0.5 are inside, < 0.5 are outside
    // So (0.5 - distance) gives: negative when inside, positive when outside
    // Scale by glyph dimensions / distanceRange to get screen-space distance
    const signedDist = float(0.5).sub(distance);
    const screenDist = isMSDF.select(
      signedDist.mul(vGlyphDimensions.x.div(uTroikaDistanceRange)),
      signedDist.mul(vGlyphDimensions.x)
    );

    // Calculate edge alpha using smoothstep with adaptive AA
    // smoothstep(aaDist, -aaDist, screenDist):
    // - Returns 1 when screenDist <= -aaDist (inside the glyph)
    // - Returns 0 when screenDist >= aaDist (outside the glyph)
    const effectiveAA = max(aaDist, uTroikaBlurRadius);
    let edgeAlpha = smoothstep(effectiveAA, effectiveAA.negate(), screenDist);

    // Apply fill opacity
    edgeAlpha = edgeAlpha.mul(uTroikaFillOpacity);

    // Apply stroke if enabled
    // Stroke extends outward from the glyph edge, so we subtract stroke width from distance
    // (making the "inside" region larger)
    const hasStroke = uTroikaStrokeWidth.greaterThan(0.0);
    const strokeDist = screenDist.sub(
      uTroikaStrokeWidth.mul(vGlyphDimensions.x)
    );
    const strokeAlpha = smoothstep(
      effectiveAA,
      effectiveAA.negate(),
      strokeDist
    ).mul(uTroikaStrokeOpacity);

    // Mix fill and stroke colors
    const fillColor = vec3(colorUniform);
    const finalColor = hasStroke.select(
      mix(vec3(uTroikaStrokeColor), fillColor, edgeAlpha),
      fillColor
    );

    const finalAlpha = hasStroke.select(max(edgeAlpha, strokeAlpha), edgeAlpha);

    // Discard fully transparent pixels to prevent depth buffer artifacts (black backgrounds)
    // This is critical when depthWrite is enabled
    Discard(finalAlpha.lessThanEqual(0.0));

    // Combine color and alpha
    return vec4(finalColor, finalAlpha);
  })();

  textMaterial.colorNode = fragmentShader;

  // Set material properties
  textMaterial.transparent = true;
  textMaterial.side = DoubleSide;
  textMaterial.depthWrite = true; // Enable depth write so text occludes properly
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

  return textMaterial;
}

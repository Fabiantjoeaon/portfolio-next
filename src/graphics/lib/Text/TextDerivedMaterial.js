import { Color, Vector2, Vector4, Matrix3, DoubleSide, DataTexture, RGBAFormat } from "three";
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
} from "three/tsl";
import { glyphBoundsAttrName, glyphIndexAttrName } from './GlyphsGeometry.js';

// Create a 1x1 white texture as default
const createDummyTexture = () => {
  const data = new Uint8Array([255, 255, 255, 255]);
  const tex = new DataTexture(data, 1, 1, RGBAFormat);
  tex.needsUpdate = true;
  return tex;
};

/**
 * Create a material for text rendering using WebGPU/TSL with SDF texture sampling
 */
export function createTextDerivedMaterial(baseMaterial) {
  const textMaterial = new NodeMaterial();

  console.log('[TextDerivedMaterial] Creating NodeMaterial with SDF support');

  // Uniforms - provide dummy texture to avoid null errors
  const colorUniform = uniform(new Color(0xffffff));
  const dummyTexture = createDummyTexture();
  const uTroikaSDFTexture = uniform(dummyTexture);
  const uTroikaSDFTextureSize = uniform(new Vector2(2048, 2048));
  const uTroikaSDFGlyphSize = uniform(64);

  // Instance attributes from GlyphsGeometry
  const aTroikaGlyphBounds = attribute(glyphBoundsAttrName, "vec4");
  const aTroikaGlyphIndex = attribute(glyphIndexAttrName, "float");

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

    // Calculate which square in the atlas this glyph belongs to
    const txCols = uTroikaSDFTextureSize.x.div(uTroikaSDFGlyphSize);
    const glyphIndexDiv4 = floor(aTroikaGlyphIndex.div(4.0));
    
    // Calculate atlas position (in texture coordinates)
    const atlasCol = mod(glyphIndexDiv4, txCols);
    const atlasRow = floor(glyphIndexDiv4.div(txCols));
    
    // Calculate UV offset for this glyph in atlas
    const txUvPerSquare = uTroikaSDFGlyphSize.div(uTroikaSDFTextureSize);
    const atlasUVOffset = vec2(atlasCol, atlasRow).mul(txUvPerSquare);
    
    // Final atlas UV for this glyph
    const atlasUV = atlasUVOffset.add(positionLocal.xy.mul(txUvPerSquare));
    
    // Store in varyings
    vGlyphUV.assign(positionLocal.xy);
    vAtlasUV.assign(atlasUV);
    vTextureChannel.assign(mod(aTroikaGlyphIndex, 4.0));

    return transformedPos;
  })();

  textMaterial.positionNode = vertexShader;

  // For now, render solid white rectangles to verify geometry works
  // We'll add proper SDF sampling after confirming the basics work
  textMaterial.colorNode = vec4(colorUniform, float(1.0));

  // Set material properties
  textMaterial.transparent = false;
  textMaterial.side = DoubleSide;
  textMaterial.depthWrite = true;
  textMaterial.depthTest = true;

  // Store uniform holders for updates
  textMaterial.uniforms = {
    colorUniform,
    uTroikaSDFTexture,
    uTroikaSDFTextureSize,
    uTroikaSDFGlyphSize,
    uTroikaSDFExponent: { value: 0 },
    uTroikaTotalBounds: { value: new Vector4(0, 0, 0, 0) },
    uTroikaClipRect: { value: new Vector4(0, 0, 0, 0) },
    uTroikaEdgeOffset: { value: 0 },
    uTroikaFillOpacity: { value: 1 },
    uTroikaPositionOffset: { value: new Vector2() },
    uTroikaCurveRadius: { value: 0 },
    uTroikaBlurRadius: { value: 0 },
    uTroikaStrokeWidth: { value: 0 },
    uTroikaStrokeColor: { value: new Color() },
    uTroikaStrokeOpacity: { value: 1 },
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

  console.log('[TextDerivedMaterial] Material created with positionNode');

  return textMaterial;
}


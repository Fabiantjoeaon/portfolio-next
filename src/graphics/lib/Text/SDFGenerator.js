/**
 * SDF Generator for text glyphs
 * Initially using JS fallback, WebGPU compute shader can be added later
 */

import { defineWorkerModule } from "./workerUtils.js";

const now = () => (self.performance || Date).now();

/**
 * Generate an SDF texture for a glyph using JavaScript
 * This is a simplified fallback implementation
 */
export function generateSDFJS(width, height, path, viewBox, maxDist, exponent) {
  const start = now();
  const sdfData = new Uint8Array(width * height);

  // Very simplified SDF generation
  // In a real implementation, this would:
  // 1. Rasterize the path
  // 2. Calculate distance field
  // 3. Apply exponential encoding

  // For now, just create a placeholder that works
  for (let i = 0; i < sdfData.length; i++) {
    sdfData[i] = 128; // Middle value = at edge
  }

  return {
    textureData: sdfData,
    timing: now() - start,
  };
}

/**
 * Generate SDF and write to canvas/texture
 * @param {number} width - Width of SDF
 * @param {number} height - Height of SDF
 * @param {string} path - Glyph path data
 * @param {Array} viewBox - View box [x0, y0, x1, y1]
 * @param {number} maxDist - Maximum distance
 * @param {number} exponent - SDF exponent
 * @param {HTMLCanvasElement|Object} canvas - Target canvas or texture
 * @param {number} x - X position in atlas
 * @param {number} y - Y position in atlas
 * @param {number} channel - RGBA channel (0-3)
 * @param {boolean} useWebGL - Whether to use WebGL (currently ignored)
 */
export function generateSDF(
  width,
  height,
  path,
  viewBox,
  maxDist,
  exponent,
  canvas,
  x,
  y,
  channel,
  useWebGL = false
) {
  // For now, always use JS fallback
  // WebGPU compute shader implementation can be added later
  return generateSDF_JS(
    width,
    height,
    path,
    viewBox,
    maxDist,
    exponent,
    canvas,
    x,
    y,
    channel
  );
}

/**
 * JS-based SDF generation
 */
function generateSDF_JS(
  width,
  height,
  path,
  viewBox,
  maxDist,
  exponent,
  canvas,
  x,
  y,
  channel
) {
  return new Promise((resolve) => {
    const { textureData, timing } = generateSDFJS(
      width,
      height,
      path,
      viewBox,
      maxDist,
      exponent
    );

    // Write to canvas/texture
    // If canvas is a real canvas, use 2d context
    // If it's a texture object, we'll handle it differently
    if (canvas && canvas.getContext) {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (ctx) {
        const imageData = ctx.getImageData(x, y, width, height);
        // Copy to specific channel
        for (let i = 0; i < textureData.length; i++) {
          imageData.data[i * 4 + channel] = textureData[i];
        }
        ctx.putImageData(imageData, x, y);
      }
    }

    resolve({ timing });
  });
}

/**
 * Warm up SDF canvas/system
 */
export function warmUpSDFCanvas(canvas) {
  if (!canvas._warm) {
    // Just mark as warm for now
    canvas._warm = true;
  }
}

/**
 * Resize canvas utility (placeholder)
 */
export function resizeWebGLCanvasWithoutClearing(canvas, width, height) {
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

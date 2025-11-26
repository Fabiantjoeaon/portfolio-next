import { TextureLoader, LinearFilter, LinearSRGBColorSpace } from 'three';

/**
 * Cache for loaded MSDF fonts to avoid redundant loading
 */
const fontCache = new Map();

/**
 * Default MSDF font path
 */
const DEFAULT_MSDF_FONT = '/assets/fonts/msdf/kenpixel/kenpixel-msdf.json';

/**
 * Load and parse an MSDF font with its texture atlas
 * @param {string} jsonPath - Path to the MSDF JSON file
 * @returns {Promise<Object>} - Font data including texture, chars, kernings, and metrics
 */
export async function loadMSDFFont(jsonPath) {
  // Check cache first
  if (fontCache.has(jsonPath)) {
    console.log('[MSDFLoader] Using cached font:', jsonPath);
    return fontCache.get(jsonPath);
  }

  console.log('[MSDFLoader] Loading MSDF font:', jsonPath);

  try {
    // Load the JSON font data
    const response = await fetch(jsonPath);
    if (!response.ok) {
      throw new Error(`Failed to load font JSON: ${response.statusText}`);
    }
    const fontData = await response.json();

    // Extract texture path from JSON
    const basePath = jsonPath.substring(0, jsonPath.lastIndexOf('/') + 1);
    const texturePath = basePath + fontData.pages[0];

    // Load the texture atlas
    const textureLoader = new TextureLoader();
    const texture = await textureLoader.loadAsync(texturePath);

    // Configure texture for MSDF rendering
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = LinearSRGBColorSpace;
    texture.needsUpdate = true;
    
    // Ensure texture is fully ready
    if (!texture.image || !texture.image.width || !texture.image.height) {
      throw new Error('Texture image not loaded properly');
    }
    
    console.log('[MSDFLoader] Texture loaded and configured:', {
      width: texture.image.width,
      height: texture.image.height,
      isTexture: texture.isTexture
    });

    // Build character lookup map
    const chars = new Map();
    for (const char of fontData.chars) {
      chars.set(char.id, char);
    }

    // Build kerning lookup map
    const kernings = new Map();
    if (fontData.kernings && fontData.kernings.length > 0) {
      for (const kern of fontData.kernings) {
        if (!kernings.has(kern.first)) {
          kernings.set(kern.first, new Map());
        }
        kernings.get(kern.first).set(kern.second, kern.amount);
      }
    }

    // Extract metrics
    const { common, distanceField } = fontData;
    const metrics = {
      lineHeight: common.lineHeight,
      base: common.base,
      scaleW: common.scaleW,
      scaleH: common.scaleH,
      distanceRange: distanceField?.distanceRange || 4,
      fieldType: distanceField?.fieldType || 'msdf',
    };

    const font = {
      texture,
      chars,
      kernings,
      metrics,
      fontData, // Keep original data for reference
    };

    // Cache the loaded font
    fontCache.set(jsonPath, font);

    console.log('[MSDFLoader] Font loaded successfully:', jsonPath, {
      charCount: chars.size,
      kerningCount: kernings.size,
      textureSize: `${metrics.scaleW}x${metrics.scaleH}`,
      distanceRange: metrics.distanceRange,
    });

    return font;
  } catch (error) {
    console.error('[MSDFLoader] Error loading MSDF font:', jsonPath, error);
    throw error;
  }
}

/**
 * Load the default MSDF font
 * @returns {Promise<Object>}
 */
export async function loadDefaultMSDFFont() {
  return loadMSDFFont(DEFAULT_MSDF_FONT);
}

/**
 * Check if a font URL is an MSDF font (by extension)
 * @param {string} url
 * @returns {boolean}
 */
export function isMSDFFont(url) {
  if (!url) return false;
  return url.endsWith('.json') || url.includes('msdf');
}

/**
 * Convert MSDF character data to Troika's glyph format
 * @param {Map} chars - MSDF character map
 * @param {Object} metrics - Font metrics
 * @returns {Object} - Glyph data in Troika format
 */
export function convertMSDFToTroikaFormat(chars, metrics) {
  const glyphs = {};

  for (const [charCode, char] of chars) {
    // Convert to Troika's expected glyph structure
    glyphs[charCode] = {
      // Position in texture atlas (normalized UV coordinates)
      atlasX: char.x,
      atlasY: char.y,
      atlasW: char.width,
      atlasH: char.height,
      
      // Glyph metrics (in font units)
      width: char.width,
      height: char.height,
      xoffset: char.xoffset,
      yoffset: char.yoffset,
      xadvance: char.xadvance,
      
      // Normalized UV coordinates for shader
      uvX: char.x / metrics.scaleW,
      uvY: char.y / metrics.scaleH,
      uvW: char.width / metrics.scaleW,
      uvH: char.height / metrics.scaleH,
    };
  }

  return glyphs;
}

/**
 * Get kerning between two character codes
 * @param {Map} kernings - Kerning map
 * @param {number} first - First character code
 * @param {number} second - Second character code
 * @returns {number} - Kerning amount
 */
export function getKerning(kernings, first, second) {
  const firstKernings = kernings.get(first);
  if (firstKernings) {
    return firstKernings.get(second) || 0;
  }
  return 0;
}

/**
 * Clear the font cache (useful for memory management or hot reloading)
 */
export function clearFontCache() {
  fontCache.clear();
}


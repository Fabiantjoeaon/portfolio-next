import { Color, Texture, LinearFilter, DataTexture, RGBAFormat } from "three";
import { defineWorkerModule } from "./workerUtils.js";
import { fontResolverWorkerModule } from "./FontResolver.js";
import { createTypesetter } from "./Typesetter.js";
import {
  generateSDF,
  generateSDFJS,
  warmUpSDFCanvas,
  resizeWebGLCanvasWithoutClearing,
} from "./SDFGenerator.js";
import bidiFactory from "./libs/bidi.factory.js";
import { loadMSDFFont, loadDefaultMSDFFont, isMSDFFont } from "./MSDFLoader.js";

const CONFIG = {
  defaultFontURL:
    "https://fonts.gstatic.com/s/roboto/v18/KFOmCnqEu92Fr1Mu4mxM.woff", //Roboto Regular
  unicodeFontsURL: null,
  sdfGlyphSize: 64,
  sdfMargin: 1 / 16,
  sdfExponent: 9,
  textureWidth: 2048,
  useWorker: true,
};
const tempColor = new Color();
let hasRequested = false;

function now() {
  return (self.performance || Date).now();
}

/**
 * Customizes the text builder configuration. This must be called prior to the first font processing
 * request, and applies to all fonts.
 */
function configureTextBuilder(config) {
  if (hasRequested) {
    console.warn(
      "configureTextBuilder called after first font request; will be ignored."
    );
  } else {
    assign(CONFIG, config);
  }
}

/**
 * Repository for all font SDF atlas textures and their glyph mappings.
 */
const atlases = Object.create(null);

/**
 * Main entry point for requesting the data needed to render a text string with given font parameters.
 */
function getTextRenderInfo(args, callback) {
  hasRequested = true;
  args = assign({}, args);
  const totalStart = now();

  // Check if this is an MSDF font request
  if (args.msdfFont || isMSDFFont(args.font)) {
    return getTextRenderInfoMSDF(args, callback, totalStart);
  }

  // Convert relative URL to absolute and add fallbacks
  const { defaultFontURL } = CONFIG;
  const fonts = [];
  if (defaultFontURL) {
    fonts.push({ label: "default", src: toAbsoluteURL(defaultFontURL) });
  }
  if (args.font) {
    fonts.push({ label: "user", src: toAbsoluteURL(args.font) });
  }
  args.font = fonts;

  // Normalize text to a string
  args.text = "" + args.text;

  args.sdfGlyphSize = args.sdfGlyphSize || CONFIG.sdfGlyphSize;
  args.unicodeFontsURL = args.unicodeFontsURL || CONFIG.unicodeFontsURL;

  // Normalize colors
  if (args.colorRanges != null) {
    let colors = {};
    for (let key in args.colorRanges) {
      if (args.colorRanges.hasOwnProperty(key)) {
        let val = args.colorRanges[key];
        if (typeof val !== "number") {
          val = tempColor.set(val).getHex();
        }
        colors[key] = val;
      }
    }
    args.colorRanges = colors;
  }

  Object.freeze(args);

  // Init the atlas if needed
  const { textureWidth, sdfExponent } = CONFIG;
  const { sdfGlyphSize } = args;
  const glyphsPerRow = (textureWidth / sdfGlyphSize) * 4;
  let atlas = atlases[sdfGlyphSize];
  if (!atlas) {
    // Use DataTexture for WebGPU compatibility
    const initialHeight = (sdfGlyphSize * 256) / glyphsPerRow;
    const data = new Uint8Array(textureWidth * initialHeight * 4);
    const sdfTexture = new DataTexture(
      data,
      textureWidth,
      initialHeight,
      RGBAFormat
    );
    sdfTexture.minFilter = LinearFilter;
    sdfTexture.magFilter = LinearFilter;
    sdfTexture.generateMipmaps = false;
    sdfTexture.needsUpdate = true;

    atlas = atlases[sdfGlyphSize] = {
      glyphCount: 0,
      sdfGlyphSize,
      sdfTexture,
      sdfData: data,
      glyphsByFont: new Map(),
    };
  }

  const { sdfTexture, sdfData } = atlas;

  // Issue request to the typesetting engine
  const typeset = CONFIG.useWorker ? typesetInWorker : typesetOnMainThread;
  typeset(args)
    .then((result) => {
      const {
        glyphIds,
        glyphFontIndices,
        fontData,
        glyphPositions,
        fontSize,
        timings,
      } = result;
      const neededSDFs = [];
      const glyphBounds = new Float32Array(glyphIds.length * 4);
      let boundsIdx = 0;
      let positionsIdx = 0;
      const quadsStart = now();

      const fontGlyphMaps = fontData.map((font) => {
        let map = atlas.glyphsByFont.get(font.src);
        if (!map) {
          atlas.glyphsByFont.set(font.src, (map = new Map()));
        }
        return map;
      });

      glyphIds.forEach((glyphId, i) => {
        const fontIndex = glyphFontIndices[i];
        const { src: fontSrc, unitsPerEm } = fontData[fontIndex];
        let glyphInfo = fontGlyphMaps[fontIndex].get(glyphId);

        // If this is a glyphId not seen before, add it to the atlas
        if (!glyphInfo) {
          const { path, pathBounds } = result.glyphData[fontSrc][glyphId];

          const fontUnitsMargin =
            (Math.max(
              pathBounds[2] - pathBounds[0],
              pathBounds[3] - pathBounds[1]
            ) /
              sdfGlyphSize) *
            (CONFIG.sdfMargin * sdfGlyphSize + 0.5);

          const atlasIndex = atlas.glyphCount++;
          const sdfViewBox = [
            pathBounds[0] - fontUnitsMargin,
            pathBounds[1] - fontUnitsMargin,
            pathBounds[2] + fontUnitsMargin,
            pathBounds[3] + fontUnitsMargin,
          ];
          fontGlyphMaps[fontIndex].set(
            glyphId,
            (glyphInfo = { path, atlasIndex, sdfViewBox })
          );

          // Collect those that need SDF generation
          neededSDFs.push(glyphInfo);
        }

        // Calculate bounds for renderable quads
        const { sdfViewBox } = glyphInfo;
        const posX = glyphPositions[positionsIdx++];
        const posY = glyphPositions[positionsIdx++];
        const fontSizeMult = fontSize / unitsPerEm;
        glyphBounds[boundsIdx++] = posX + sdfViewBox[0] * fontSizeMult;
        glyphBounds[boundsIdx++] = posY + sdfViewBox[1] * fontSizeMult;
        glyphBounds[boundsIdx++] = posX + sdfViewBox[2] * fontSizeMult;
        glyphBounds[boundsIdx++] = posY + sdfViewBox[3] * fontSizeMult;

        // Convert glyphId to SDF index for the shader
        glyphIds[i] = glyphInfo.atlasIndex;
      });
      timings.quads = (timings.quads || 0) + (now() - quadsStart);

      const sdfStart = now();
      timings.sdf = {};

      // Grow the texture if needed
      const currentHeight = sdfTexture.image.height;
      const neededRows = Math.ceil(atlas.glyphCount / glyphsPerRow);
      const neededHeight = Math.pow(
        2,
        Math.ceil(Math.log2(neededRows * sdfGlyphSize))
      );
      if (neededHeight > currentHeight) {
        console.info(
          `Increasing SDF texture size ${currentHeight}->${neededHeight}`
        );

        // Create new larger texture
        const newData = new Uint8Array(textureWidth * neededHeight * 4);
        // Copy old data
        for (let y = 0; y < currentHeight; y++) {
          for (let x = 0; x < textureWidth; x++) {
            const oldIdx = (y * textureWidth + x) * 4;
            const newIdx = (y * textureWidth + x) * 4;
            for (let c = 0; c < 4; c++) {
              newData[newIdx + c] = atlas.sdfData[oldIdx + c];
            }
          }
        }

        atlas.sdfData = newData;
        sdfTexture.image = {
          width: textureWidth,
          height: neededHeight,
          data: newData,
        };
        sdfTexture.needsUpdate = true;
      }

      // Generate SDFs for new glyphs
      Promise.all(
        neededSDFs.map((glyphInfo) =>
          generateGlyphSDF(glyphInfo, atlas, args.gpuAccelerateSDF).then(
            ({ timing }) => {
              timings.sdf[glyphInfo.atlasIndex] = timing;
            }
          )
        )
      ).then(() => {
        if (neededSDFs.length) {
          sdfTexture.needsUpdate = true;
        }
        timings.sdfTotal = now() - sdfStart;
        timings.total = now() - totalStart;

        // Invoke callback with the text layout arrays and updated texture
        callback(
          Object.freeze({
            parameters: args,
            sdfTexture,
            sdfGlyphSize,
            sdfExponent,
            glyphBounds,
            glyphAtlasIndices: glyphIds,
            glyphColors: result.glyphColors,
            caretPositions: result.caretPositions,
            chunkedBounds: result.chunkedBounds,
            ascender: result.ascender,
            descender: result.descender,
            lineHeight: result.lineHeight,
            capHeight: result.capHeight,
            xHeight: result.xHeight,
            topBaseline: result.topBaseline,
            blockBounds: result.blockBounds,
            visibleBounds: result.visibleBounds,
            timings: result.timings,
          })
        );
      });
    })
    .catch((error) => {
      console.error("[TextBuilder] Error during typeset:", error);
    });
}

function generateGlyphSDF(
  { path, atlasIndex, sdfViewBox },
  { sdfGlyphSize, sdfData },
  useGPU
) {
  const { textureWidth, sdfExponent } = CONFIG;
  const maxDist = Math.max(
    sdfViewBox[2] - sdfViewBox[0],
    sdfViewBox[3] - sdfViewBox[1]
  );
  const squareIndex = Math.floor(atlasIndex / 4);
  const x = (squareIndex % (textureWidth / sdfGlyphSize)) * sdfGlyphSize;
  const y =
    Math.floor(squareIndex / (textureWidth / sdfGlyphSize)) * sdfGlyphSize;
  const channel = atlasIndex % 4;

  // generateSDFJS returns an object directly, not a Promise
  const { textureData, timing } = generateSDFJS(
    sdfGlyphSize,
    sdfGlyphSize,
    path,
    sdfViewBox,
    maxDist,
    sdfExponent
  );

  // Write to atlas
  for (let py = 0; py < sdfGlyphSize; py++) {
    for (let px = 0; px < sdfGlyphSize; px++) {
      const srcIdx = py * sdfGlyphSize + px;
      const dstIdx = ((y + py) * textureWidth + (x + px)) * 4 + channel;
      sdfData[dstIdx] = textureData[srcIdx];
    }
  }

  return Promise.resolve({ timing });
}

/**
 * Preload a given font and optionally pre-generate glyph SDFs
 */
function preloadFont({ font, characters, sdfGlyphSize, lang }, callback) {
  let text = Array.isArray(characters)
    ? characters.join("\n")
    : "" + characters;
  getTextRenderInfo({ font, sdfGlyphSize, text, lang }, callback);
}

// Local assign impl
function assign(toObj, fromObj) {
  for (let key in fromObj) {
    if (fromObj.hasOwnProperty(key)) {
      toObj[key] = fromObj[key];
    }
  }
  return toObj;
}

// Utility for making URLs absolute
let linkEl;
function toAbsoluteURL(path) {
  if (!linkEl) {
    linkEl = typeof document === "undefined" ? {} : document.createElement("a");
  }
  linkEl.href = path;
  return linkEl.href;
}

// Create typesetter worker module
const typesetterWorkerModule = defineWorkerModule({
  name: "Typesetter",
  dependencies: [createTypesetter, fontResolverWorkerModule, bidiFactory],
  init(createTypesetter, fontResolver, bidiFactory) {
    return createTypesetter(fontResolver, bidiFactory());
  },
});

const typesetInWorker = defineWorkerModule({
  name: "TypesetInWorker",
  dependencies: [typesetterWorkerModule],
  init(typesetter) {
    return function (args) {
      return new Promise((resolve) => {
        typesetter.typeset(args, resolve);
      });
    };
  },
  getTransferables(result) {
    const transferables = [];
    for (let p in result) {
      if (result[p] && result[p].buffer) {
        transferables.push(result[p].buffer);
      }
    }
    return transferables;
  },
});

const typesetOnMainThread = typesetInWorker.onMainThread;

/**
 * MSDF-specific text rendering path
 */
async function getTextRenderInfoMSDF(args, callback, totalStart) {
  try {
    // Load MSDF font
    const msdfFontPath = args.msdfFont || args.font;
    const msdfFont = await loadMSDFFont(msdfFontPath);

    const { texture, chars, kernings, metrics } = msdfFont;

    // Normalize text to a string
    const text = "" + args.text;

    // Prepare layout parameters
    const fontSize = args.fontSize || 0.1;
    const lineHeight =
      args.lineHeight === "normal" ? metrics.lineHeight : args.lineHeight;
    const letterSpacing = args.letterSpacing || 0;

    // Simple layout calculation (mimicking Typesetter output for MSDF)
    const glyphIds = [];
    const glyphPositions = [];
    const glyphBounds = [];
    const glyphAtlasIndices = [];
    const glyphUVs = []; // Store UV coordinates for MSDF

    let cursorX = 0;
    let cursorY = 0;
    const scale = fontSize / metrics.base;

    // Calculate text bounds
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);

      // Handle newline
      if (charCode === 10) {
        cursorX = 0;
        cursorY -= lineHeight * scale;
        continue;
      }

      // Skip carriage return and spaces (spaces advance but don't render)
      if (charCode === 13) continue;
      if (charCode === 32) {
        const spaceChar = chars.get(32);
        if (spaceChar) {
          cursorX += spaceChar.xadvance * scale;
        }
        continue;
      }

      const char = chars.get(charCode);
      if (!char) {
        continue;
      }

      // Calculate glyph bounds in world space
      const x = cursorX + char.xoffset * scale;
      const y = cursorY - char.yoffset * scale;
      const w = char.width * scale;
      const h = char.height * scale;

      glyphBounds.push(x, y, x + w, y - h);
      glyphIds.push(charCode);

      // Store UV coordinates for this glyph in the MSDF atlas
      // UVs are in normalized texture coordinates (0-1)
      // With flipY=false, texture Y=0 is at top, matching BMFont, so no flip needed
      const uvX = char.x / metrics.scaleW;
      const uvY = char.y / metrics.scaleH;
      const uvW = char.width / metrics.scaleW;
      const uvH = char.height / metrics.scaleH;

      // Store as vec4: (uvX, uvY, uvW, uvH)
      glyphUVs.push(uvX, uvY, uvW, uvH);

      // For MSDF, we use a simple sequential index
      glyphAtlasIndices.push(glyphIds.length - 1);

      // Update bounds
      minX = Math.min(minX, x);
      minY = Math.min(minY, y - h);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y);

      // Advance cursor
      cursorX += (char.xadvance + letterSpacing) * scale;

      // Apply kerning if available
      if (i < text.length - 1) {
        const nextCharCode = text.charCodeAt(i + 1);
        const firstKernings = kernings.get(charCode);
        if (firstKernings) {
          const kern = firstKernings.get(nextCharCode) || 0;
          cursorX += kern * scale;
        }
      }
    }

    // Apply anchors
    let anchorX = 0;
    let anchorY = 0;

    if (typeof args.anchorX === "number") {
      anchorX = args.anchorX;
    } else if (args.anchorX === "left") {
      anchorX = minX;
    } else if (args.anchorX === "center") {
      anchorX = (minX + maxX) / 2;
    } else if (args.anchorX === "right") {
      anchorX = maxX;
    }

    if (typeof args.anchorY === "number") {
      anchorY = args.anchorY;
    } else if (args.anchorY === "top") {
      anchorY = maxY;
    } else if (args.anchorY === "middle") {
      anchorY = (minY + maxY) / 2;
    } else if (args.anchorY === "bottom") {
      anchorY = minY;
    }

    // Adjust all bounds by anchor
    for (let i = 0; i < glyphBounds.length; i += 4) {
      glyphBounds[i] -= anchorX;
      glyphBounds[i + 1] -= anchorY;
      glyphBounds[i + 2] -= anchorX;
      glyphBounds[i + 3] -= anchorY;
    }

    const blockBounds = [
      minX - anchorX,
      minY - anchorY,
      maxX - anchorX,
      maxY - anchorY,
    ];

    // Invoke callback with MSDF-specific data
    callback(
      Object.freeze({
        parameters: args,
        sdfTexture: texture,
        sdfGlyphSize: metrics.scaleW, // Use texture width as glyph size reference
        sdfExponent: 1, // Not used for MSDF
        isMSDF: true, // Flag to indicate MSDF mode
        distanceRange: metrics.distanceRange,
        glyphBounds: new Float32Array(glyphBounds),
        glyphAtlasIndices: new Float32Array(glyphAtlasIndices),
        glyphUVs: new Float32Array(glyphUVs), // MSDF UV coordinates
        glyphColors: null,
        caretPositions: null,
        chunkedBounds: null,
        ascender: metrics.base * scale,
        descender: (metrics.base - metrics.lineHeight) * scale,
        lineHeight: lineHeight * scale,
        capHeight: metrics.base * scale,
        xHeight: metrics.base * 0.5 * scale,
        topBaseline: 0,
        blockBounds,
        visibleBounds: blockBounds,
        timings: {
          total: now() - totalStart,
        },
        msdfFont, // Keep reference to font for advanced features
      })
    );
  } catch (error) {
    console.error("[TextBuilder] Error processing MSDF font:", error);
    throw error;
  }
}

function dumpSDFTextures() {
  Object.keys(atlases).forEach((size) => {
    const atlas = atlases[size];
    console.log("SDF Atlas", size, atlas);
  });
}

export {
  configureTextBuilder,
  getTextRenderInfo,
  preloadFont,
  typesetterWorkerModule,
  dumpSDFTextures,
};

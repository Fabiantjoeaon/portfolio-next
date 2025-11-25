import * as THREE from "three";
import { createMSDFMaterial } from "./MSDFMaterial.js";

/**
 * MSDFText - High-quality text rendering using Multi-channel Signed Distance Fields
 *
 * Usage:
 *   const text = await MSDFText.load('/path/to/font.json');
 *   text.setText("Hello World");
 *   text.setColor(0xffffff);
 *   scene.add(text.mesh);
 */
export class MSDFText {
  constructor(fontData, msdfTexture) {
    this.fontData = fontData;
    this.msdfTexture = msdfTexture;
    this.text = "";
    this.mesh = null;
    this.material = null;

    // Character lookup map
    this.chars = {};
    for (const char of fontData.chars) {
      this.chars[char.id] = char;
    }

    // Kerning lookup map
    this.kernings = new Map();
    if (fontData.kernings && fontData.kernings.length > 0) {
      for (const kern of fontData.kernings) {
        if (!this.kernings.has(kern.first)) {
          this.kernings.set(kern.first, new Map());
        }
        this.kernings.get(kern.first).set(kern.second, kern.amount);
      }
    }

    // Font metrics
    this.lineHeight = fontData.common.lineHeight;
    this.base = fontData.common.base;
    this.scaleW = fontData.common.scaleW;
    this.scaleH = fontData.common.scaleH;

    // Default character for missing glyphs
    this.defaultChar = fontData.chars[0];
  }

  /**
   * Load MSDF font from JSON file
   */
  static async load(fontJsonPath, options = {}) {
    // Load font JSON
    const response = await fetch(fontJsonPath);
    const fontData = await response.json();

    // Load texture atlas
    const basePath = fontJsonPath.substring(
      0,
      fontJsonPath.lastIndexOf("/") + 1
    );
    const texturePath = basePath + fontData.pages[0];

    const textureLoader = new THREE.TextureLoader();
    const msdfTexture = await textureLoader.loadAsync(texturePath);

    // Configure texture
    msdfTexture.minFilter = THREE.LinearFilter;
    msdfTexture.magFilter = THREE.LinearFilter;
    msdfTexture.generateMipmaps = false;
    msdfTexture.colorSpace = THREE.LinearSRGBColorSpace;

    const text = new MSDFText(fontData, msdfTexture);

    // Create material
    text.material = createMSDFMaterial(msdfTexture, options);

    return text;
  }

  /**
   * Get character data, with fallback to default
   */
  getChar(charCode) {
    return this.chars[charCode] || this.defaultChar;
  }

  /**
   * Get kerning between two characters
   */
  getKerning(firstCode, secondCode) {
    const firstKernings = this.kernings.get(firstCode);
    if (firstKernings) {
      return firstKernings.get(secondCode) || 0;
    }
    return 0;
  }

  /**
   * Measure text dimensions
   */
  measureText(text) {
    let maxWidth = 0;
    let lineWidth = 0;
    let lineCount = 1;

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);

      if (charCode === 10) {
        // Newline
        maxWidth = Math.max(maxWidth, lineWidth);
        lineWidth = 0;
        lineCount++;
        continue;
      }

      if (charCode === 32) {
        // Space
        const char = this.getChar(charCode);
        lineWidth += char.xadvance;
        continue;
      }

      const char = this.getChar(charCode);
      const nextCharCode = i < text.length - 1 ? text.charCodeAt(i + 1) : -1;
      const kerning =
        nextCharCode >= 0 ? this.getKerning(charCode, nextCharCode) : 0;

      lineWidth += char.xadvance + kerning;
    }

    maxWidth = Math.max(maxWidth, lineWidth);

    return {
      width: maxWidth,
      height: lineCount * this.lineHeight,
      lineCount,
    };
  }

  /**
   * Set the text to display
   */
  setText(text, options = {}) {
    this.text = text;

    const { centered = false } = options;

    // Count printable characters (exclude spaces and newlines)
    let charCount = 0;
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code !== 32 && code !== 10 && code !== 13) {
        charCount++;
      }
    }

    if (charCount === 0) {
      if (this.mesh) {
        this.mesh.visible = false;
      }
      return;
    }

    // Create instanced geometry for characters
    const geometry = new THREE.PlaneGeometry(1, 1);
    const instancedGeometry = new THREE.InstancedBufferGeometry();

    // Copy base geometry attributes (no normals needed)
    instancedGeometry.setIndex(geometry.index);
    instancedGeometry.setAttribute(
      "position",
      geometry.getAttribute("position")
    );
    instancedGeometry.setAttribute("uv", geometry.getAttribute("uv"));

    // Create instance attributes
    const instancePositions = new Float32Array(charCount * 3); // x, y, z per instance
    const instanceScales = new Float32Array(charCount * 3); // scale per instance
    const charUVOffsets = new Float32Array(charCount * 2); // UV offset into atlas
    const charUVScales = new Float32Array(charCount * 2); // UV scale for char size

    // Layout text
    const measurements = this.measureText(text);
    let offsetX = centered ? -measurements.width * 0.5 : 0;
    let offsetY = centered ? measurements.height * 0.5 : 0;
    let instanceIndex = 0;
    let currentLineWidth = 0;

    // If centered, we need to calculate line widths for per-line centering
    let lineWidths = [];
    if (centered) {
      let lineWidth = 0;
      for (let i = 0; i < text.length; i++) {
        const charCode = text.charCodeAt(i);
        if (charCode === 10) {
          lineWidths.push(lineWidth);
          lineWidth = 0;
        } else {
          const char = this.getChar(charCode);
          const nextCharCode =
            i < text.length - 1 ? text.charCodeAt(i + 1) : -1;
          const kerning =
            nextCharCode >= 0 ? this.getKerning(charCode, nextCharCode) : 0;
          lineWidth += char.xadvance + kerning;
        }
      }
      lineWidths.push(lineWidth);
    }

    let currentLine = 0;
    let lineOffsetX = centered ? (measurements.width - lineWidths[0]) * 0.5 : 0;

    for (let i = 0; i < text.length; i++) {
      const charCode = text.charCodeAt(i);

      // Handle newline
      if (charCode === 10) {
        offsetX = centered ? -measurements.width * 0.5 : 0;
        offsetY -= this.lineHeight;
        currentLine++;
        lineOffsetX = centered
          ? (measurements.width - lineWidths[currentLine]) * 0.5
          : 0;
        continue;
      }

      // Handle carriage return
      if (charCode === 13) {
        continue;
      }

      // Skip spaces (advance but don't render)
      if (charCode === 32) {
        const char = this.getChar(charCode);
        offsetX += char.xadvance;
        continue;
      }

      const char = this.getChar(charCode);
      const nextCharCode = i < text.length - 1 ? text.charCodeAt(i + 1) : -1;
      const kerning =
        nextCharCode >= 0 ? this.getKerning(charCode, nextCharCode) : 0;

      // Calculate UV coordinates in atlas
      const u = char.x / this.scaleW;
      const v = char.y / this.scaleH;
      const uScale = char.width / this.scaleW;
      const vScale = char.height / this.scaleH;

      // Set instance position (centered on the character)
      const posX = offsetX + lineOffsetX + char.xoffset + char.width * 0.5;
      const posY = offsetY - char.yoffset - char.height * 0.5;

      instancePositions[instanceIndex * 3 + 0] = posX;
      instancePositions[instanceIndex * 3 + 1] = posY;
      instancePositions[instanceIndex * 3 + 2] = 0;

      // Set instance scale (character size)
      instanceScales[instanceIndex * 3 + 0] = char.width;
      instanceScales[instanceIndex * 3 + 1] = char.height;
      instanceScales[instanceIndex * 3 + 2] = 1;

      // Set UV atlas coordinates
      charUVOffsets[instanceIndex * 2 + 0] = u;
      charUVOffsets[instanceIndex * 2 + 1] = v;
      charUVScales[instanceIndex * 2 + 0] = uScale;
      charUVScales[instanceIndex * 2 + 1] = vScale;

      // Advance position
      offsetX += char.xadvance + kerning;
      instanceIndex++;
    }

    // Add instance attributes to geometry
    instancedGeometry.setAttribute(
      "instancePosition",
      new THREE.InstancedBufferAttribute(instancePositions, 3)
    );
    instancedGeometry.setAttribute(
      "instanceScale",
      new THREE.InstancedBufferAttribute(instanceScales, 3)
    );
    instancedGeometry.setAttribute(
      "charUVOffset",
      new THREE.InstancedBufferAttribute(charUVOffsets, 2)
    );
    instancedGeometry.setAttribute(
      "charUVScale",
      new THREE.InstancedBufferAttribute(charUVScales, 2)
    );

    // Set instance count
    instancedGeometry.instanceCount = charCount;

    // Create or update mesh
    if (this.mesh) {
      this.mesh.geometry.dispose();
      this.mesh.geometry = instancedGeometry;
      this.mesh.visible = true;
    } else {
      this.mesh = new THREE.Mesh(instancedGeometry, this.material);
    }

    return this.mesh;
  }

  /**
   * Set text color
   */
  setColor(color) {
    this.material.userData.colorUniform.value.set(color);
  }

  /**
   * Set text opacity
   */
  setOpacity(opacity) {
    this.material.userData.opacityUniform.value = opacity;
  }

  /**
   * Set pixel scale for sharpness control
   */
  setPixelScale(pixelScale) {
    this.material.userData.pixelScaleUniform.value = pixelScale;
  }

  /**
   * Clean up resources
   */
  dispose() {
    if (this.mesh) {
      this.mesh.geometry.dispose();
    }
    if (this.material) {
      this.material.dispose();
    }
    if (this.msdfTexture) {
      this.msdfTexture.dispose();
    }
  }
}

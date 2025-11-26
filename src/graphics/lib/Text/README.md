# WebGPU/TSL Text Rendering

A port of [troika-three-text](https://github.com/protectwise/troika/tree/master/packages/troika-three-text) adapted to use WebGPU and Three.js Shading Language (TSL) instead of WebGL/GLSL.

## Features

- **Runtime SDF Generation**: Generates signed distance field textures on-the-fly from font files (.ttf, .otf, .woff)
- **Full Text Layout**: Supports kerning, ligatures, text wrapping, alignment, and bidirectional text
- **Advanced Rendering**: Outlines, strokes, blur effects, curved text, and clip rectangles
- **Worker-Based Processing**: Font parsing and typesetting runs in background to prevent frame drops
- **WebGPU/TSL Rendering**: Uses modern Three.js rendering pipeline with node-based shaders

## Usage

```javascript
import { Text } from './graphics/lib/Text/index.js'

// Create text mesh
const text = new Text()
scene.add(text)

// Configure properties
text.text = 'Hello WebGPU!'
text.fontSize = 0.2
text.position.z = -2
text.color = 0x00ffff
text.anchorX = 'center'
text.anchorY = 'middle'

// Sync to apply changes
text.sync()

// Clean up when done
text.dispose()
```

## Architecture

### Core Components

1. **Text.js** - Main text mesh class, extends THREE.Mesh
2. **TextBuilder.js** - Manages SDF atlas and coordinates text processing
3. **TextDerivedMaterial.js** - TSL-based material for SDF rendering
4. **GlyphsGeometry.js** - Instanced geometry for efficient glyph rendering
5. **Typesetter.js** - Text layout engine (kerning, wrapping, alignment)
6. **FontParser.js** - Parses font files using Typr
7. **FontResolver.js** - Resolves fonts for unicode coverage
8. **SDFGenerator.js** - Generates SDF textures from glyph paths

### Key Differences from Original Troika

1. **Shader System**: Uses TSL node graph instead of GLSL string injection
2. **Texture Management**: Uses DataTexture instead of canvas for WebGPU compatibility
3. **Material Derivation**: Fresh NodeMaterial instead of patching base materials
4. **SDF Generation**: Currently JS-only (WebGPU compute shader can be added later)

## Properties

### Text Content & Layout

- `text` - String to render
- `font` - URL of font file to use
- `fontSize` - Em-height in local world units (default: 0.1)
- `anchorX`, `anchorY` - Text anchor point (e.g., 'center', 'middle')
- `maxWidth` - Maximum width before wrapping
- `textAlign` - Horizontal alignment ('left', 'center', 'right', 'justify')
- `lineHeight` - Line height ('normal' or multiplier)
- `letterSpacing` - Additional letter spacing
- `whiteSpace` - Wrapping behavior ('normal', 'nowrap')

### Appearance

- `color` - Text color (hex, string, or THREE.Color)
- `outlineWidth` - Outline thickness
- `outlineColor` - Outline color
- `outlineBlur` - Outline blur radius
- `strokeWidth` - Inner stroke width
- `strokeColor` - Inner stroke color
- `fillOpacity` - Opacity of glyph fill
- `curveRadius` - Cylindrical curvature radius
- `clipRect` - Clipping rectangle [minX, minY, maxX, maxY]

## Current Limitations

1. **SDF Generation**: Uses simplified JS fallback. WebGPU compute shader implementation pending
2. **Bidi Support**: Simplified bidirectional text support (full unicode-bidi pending)
3. **Performance**: Not yet fully optimized for WebGPU (future improvements planned)

## Future Enhancements

- [ ] WebGPU compute shader for fast SDF generation
- [ ] Full unicode-bidi support
- [ ] BatchedText optimization for multiple instances
- [ ] Advanced font features (small caps, stylistic sets, etc.)
- [ ] Performance profiling and optimization

## Dependencies

External libraries bundled in `libs/`:
- `typr.factory.js` - Font parsing (Typr.ts)
- `woff2otf.factory.js` - WOFF format support
- `unicode-font-resolver-client.factory.js` - Unicode font fallback resolution
- `bidi.factory.js` - Bidirectional text support (simplified)

## Testing

A test scene has been created at `src/scenes/TextTestScene.js` demonstrating basic text rendering with WebGPU/TSL.

## License

Based on troika-three-text which is MIT licensed. See original project for details.


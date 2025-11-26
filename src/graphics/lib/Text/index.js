// Main exports for Text package

console.log('[Text/index.js] Module loading...')

export { configureTextBuilder, getTextRenderInfo, typesetterWorkerModule, preloadFont, dumpSDFTextures } from './TextBuilder.js'
export { fontResolverWorkerModule } from './FontResolver.js'
export { Text } from './Text.js'
export { BatchedText } from './BatchedText.js'
export { GlyphsGeometry } from './GlyphsGeometry.js'
export { createTextDerivedMaterial } from './TextDerivedMaterial.js'
export { getCaretAtPoint, getSelectionRects } from './selectionUtils.js'

console.log('[Text/index.js] All exports loaded successfully')


import {
  Color,
  DoubleSide,
  Matrix4,
  Mesh,
  Vector3,
  Vector2,
} from 'three'
import { GlyphsGeometry } from './GlyphsGeometry.js'
import { createTextDerivedMaterial } from './TextDerivedMaterial.js'
import { getTextRenderInfo } from './TextBuilder.js'

console.log('[Text.js] Module loading...')

const defaultStrokeColor = 0x808080

const tempMat4 = new Matrix4()
const tempVec3a = new Vector3()
const tempVec3b = new Vector3()
const origin = new Vector3()
const defaultOrient = '+x+y'

const syncStartEvent = { type: 'syncstart' }
const syncCompleteEvent = { type: 'synccomplete' }

const SYNCABLE_PROPS = [
  'font',
  'fontSize',
  'fontStyle',
  'fontWeight',
  'lang',
  'letterSpacing',
  'lineHeight',
  'maxWidth',
  'overflowWrap',
  'text',
  'direction',
  'textAlign',
  'textIndent',
  'whiteSpace',
  'anchorX',
  'anchorY',
  'colorRanges',
  'sdfGlyphSize'
]

const COPYABLE_PROPS = SYNCABLE_PROPS.concat(
  'material',
  'color',
  'depthOffset',
  'clipRect',
  'curveRadius',
  'orientation',
  'glyphGeometryDetail'
)

/**
 * @class Text
 *
 * A ThreeJS Mesh that renders a string of text on a plane in 3D space using signed distance
 * fields (SDF) with WebGPU/TSL rendering.
 */
class Text extends Mesh {
  constructor() {
    const geometry = new GlyphsGeometry()
    // Create material immediately
    const material = createTextDerivedMaterial(null)
    super(geometry, material)

    // === Text layout properties: === //

    this.text = ''
    this.anchorX = 0
    this.anchorY = 0
    this.curveRadius = 0
    this.direction = 'auto'
    this.font = null //will use default from TextBuilder
    this.unicodeFontsURL = null //defaults to CDN
    this.fontSize = 0.1
    this.fontWeight = 'normal'
    this.fontStyle = 'normal'
    this.lang = null
    this.letterSpacing = 0
    this.lineHeight = 'normal'
    this.maxWidth = Infinity
    this.overflowWrap = 'normal'
    this.textAlign = 'left'
    this.textIndent = 0
    this.whiteSpace = 'normal'

    // === Presentation properties: === //

    this._baseMaterial = material
    this._derivedMaterial = material
    this.color = null
    this.colorRanges = null
    this.outlineWidth = 0
    this.outlineColor = 0x000000
    this.outlineOpacity = 1
    this.outlineBlur = 0
    this.outlineOffsetX = 0
    this.outlineOffsetY = 0
    this.strokeWidth = 0
    this.strokeColor = defaultStrokeColor
    this.strokeOpacity = 1
    this.fillOpacity = 1
    this.depthOffset = 0
    this.clipRect = null
    this.orientation = defaultOrient
    this.glyphGeometryDetail = 1
    this.sdfGlyphSize = null
    this.gpuAccelerateSDF = false // Disabled for now, use JS fallback
    this.debugSDF = false
    
    // Mark as needing sync
    this._needsSync = true
  }

  /**
   * Updates the text rendering according to the current text-related configuration properties.
   * This is an async process, so you can pass in a callback function to be executed when it
   * finishes.
   * @param {function} [callback]
   */
  sync(callback) {
    if (this._needsSync) {
      this._needsSync = false

      // If there's another sync still in progress, queue
      if (this._isSyncing) {
        (this._queuedSyncs || (this._queuedSyncs = [])).push(callback)
      } else {
        this._isSyncing = true
        this.dispatchEvent(syncStartEvent)

        console.log('[Text] Starting sync for text:', this.text)

        getTextRenderInfo({
          text: this.text,
          font: this.font,
          lang: this.lang,
          fontSize: this.fontSize || 0.1,
          fontWeight: this.fontWeight || 'normal',
          fontStyle: this.fontStyle || 'normal',
          letterSpacing: this.letterSpacing || 0,
          lineHeight: this.lineHeight || 'normal',
          maxWidth: this.maxWidth,
          direction: this.direction || 'auto',
          textAlign: this.textAlign,
          textIndent: this.textIndent,
          whiteSpace: this.whiteSpace,
          overflowWrap: this.overflowWrap,
          anchorX: this.anchorX,
          anchorY: this.anchorY,
          colorRanges: this.colorRanges,
          includeCaretPositions: true,
          sdfGlyphSize: this.sdfGlyphSize,
          gpuAccelerateSDF: this.gpuAccelerateSDF,
          unicodeFontsURL: this.unicodeFontsURL,
        }, textRenderInfo => {
          console.log('[Text] Got textRenderInfo:', textRenderInfo)
          this._isSyncing = false

          // Save result for later use in onBeforeRender
          this._textRenderInfo = textRenderInfo

          // Update the geometry attributes
          this.geometry.updateGlyphs(
            textRenderInfo.glyphBounds,
            textRenderInfo.glyphAtlasIndices,
            textRenderInfo.blockBounds,
            textRenderInfo.chunkedBounds,
            textRenderInfo.glyphColors
          )

          console.log('[Text] Geometry updated, instanceCount:', this.geometry.instanceCount)
          
          // Force material to recompile now that attributes exist
          if (this.material && this.material.dispose) {
            // Dispose cached program so it recompiles with new attributes
            this.material.needsUpdate = true
          }

          // If we had extra sync requests queued up, kick it off
          const queued = this._queuedSyncs
          if (queued) {
            this._queuedSyncs = null
            this._needsSync = true
            this.sync(() => {
              queued.forEach(fn => fn && fn())
            })
          }

          this.dispatchEvent(syncCompleteEvent)
          if (callback) {
            callback()
          }
        })
      }
    } else if (callback) {
      // Already synced, call callback immediately
      callback()
    }
  }

  /**
   * Initiate a sync if needed - note it won't complete until next frame at the
   * earliest so if possible it's a good idea to call sync() manually as soon as
   * all the properties have been set.
   * @override
   */
  onBeforeRender(renderer, scene, camera, geometry, material, group) {
    this.sync()

    // This may not always be a text material, e.g. if there's a scene.overrideMaterial present
    if (material.isTroikaTextMaterial) {
      if (!this._prepareLogged) {
        console.log('[Text.onBeforeRender] Preparing material for render')
        this._prepareLogged = true
      }
      this._prepareForRender(material)
    } else if (!this._materialWarningLogged) {
      console.warn('[Text.onBeforeRender] Material is not text material:', material)
      this._materialWarningLogged = true
    }
  }

  /**
   * Shortcut to dispose the geometry specific to this instance.
   */
  dispose() {
    this.geometry.dispose()
  }

  /**
   * @property {TroikaTextRenderInfo|null} textRenderInfo
   * @readonly
   */
  get textRenderInfo() {
    return this._textRenderInfo || null
  }

  /**
   * Create the text derived material from the base material.
   */
  createDerivedMaterial(baseMaterial) {
    return createTextDerivedMaterial(baseMaterial)
  }

  // Handler for automatically wrapping the base material with our upgrades
  get material() {
    let derivedMaterial = this._derivedMaterial
    if (!derivedMaterial) {
      derivedMaterial = this._derivedMaterial = this.createDerivedMaterial(null)
    }
    
    // Handle outline rendering as multi-material
    if (this.hasOutline()) {
      let outlineMaterial = derivedMaterial._outlineMtl
      if (!outlineMaterial) {
        outlineMaterial = derivedMaterial._outlineMtl = derivedMaterial.clone()
        outlineMaterial.isTextOutlineMaterial = true
        outlineMaterial.depthWrite = false
      }
      return [outlineMaterial, derivedMaterial]
    } else {
      return derivedMaterial
    }
  }
  
  set material(baseMaterial) {
    if (baseMaterial && baseMaterial.isTroikaTextMaterial) {
      this._derivedMaterial = baseMaterial
    } else {
      this._baseMaterial = baseMaterial
      this._derivedMaterial = null
    }
  }

  hasOutline() {
    return !!(this.outlineWidth || this.outlineBlur || this.outlineOffsetX || this.outlineOffsetY)
  }

  get glyphGeometryDetail() {
    return this.geometry.detail
  }
  set glyphGeometryDetail(detail) {
    this.geometry.detail = detail
  }

  get curveRadius() {
    return this.geometry.curveRadius
  }
  set curveRadius(r) {
    this.geometry.curveRadius = r
  }

  _prepareForRender(material) {
    const isOutline = material.isTextOutlineMaterial
    const uniforms = material.uniforms
    const textInfo = this.textRenderInfo
    if (textInfo) {
      const {sdfTexture, blockBounds} = textInfo
      
      // Update texture uniform - handle both regular and TSL uniform nodes
      if (uniforms.uTroikaSDFTexture.value !== sdfTexture) {
        uniforms.uTroikaSDFTexture.value = sdfTexture
        console.log('[Text._prepareForRender] Set SDF texture:', sdfTexture)
      }
      
      uniforms.uTroikaSDFTextureSize.value.set(sdfTexture.image.width, sdfTexture.image.height)
      uniforms.uTroikaSDFGlyphSize.value = textInfo.sdfGlyphSize
      uniforms.uTroikaSDFExponent.value = textInfo.sdfExponent
      uniforms.uTroikaTotalBounds.value.fromArray(blockBounds)
      uniforms.uTroikaUseGlyphColors.value = !isOutline && !!textInfo.glyphColors

      let distanceOffset = 0
      let blurRadius = 0
      let strokeWidth = 0
      let fillOpacity
      let strokeOpacity
      let strokeColor
      let offsetX = 0
      let offsetY = 0

      if (isOutline) {
        let {outlineWidth, outlineOffsetX, outlineOffsetY, outlineBlur, outlineOpacity} = this
        distanceOffset = this._parsePercent(outlineWidth) || 0
        blurRadius = Math.max(0, this._parsePercent(outlineBlur) || 0)
        fillOpacity = outlineOpacity
        offsetX = this._parsePercent(outlineOffsetX) || 0
        offsetY = this._parsePercent(outlineOffsetY) || 0
      } else {
        strokeWidth = Math.max(0, this._parsePercent(this.strokeWidth) || 0)
        if (strokeWidth) {
          strokeColor = this.strokeColor
          uniforms.uTroikaStrokeColor.value.set(strokeColor == null ? defaultStrokeColor : strokeColor)
          strokeOpacity = this.strokeOpacity
          if (strokeOpacity == null) strokeOpacity = 1
        }
        fillOpacity = this.fillOpacity
      }

      uniforms.uTroikaEdgeOffset.value = distanceOffset
      uniforms.uTroikaPositionOffset.value.set(offsetX, offsetY)
      uniforms.uTroikaBlurRadius.value = blurRadius
      uniforms.uTroikaStrokeWidth.value = strokeWidth
      uniforms.uTroikaStrokeOpacity.value = strokeOpacity
      uniforms.uTroikaFillOpacity.value = fillOpacity == null ? 1 : fillOpacity
      uniforms.uTroikaCurveRadius.value = this.curveRadius || 0

      let clipRect = this.clipRect
      if (clipRect && Array.isArray(clipRect) && clipRect.length === 4) {
        uniforms.uTroikaClipRect.value.fromArray(clipRect)
      } else {
        const pad = (this.fontSize || 0.1) * 100
        uniforms.uTroikaClipRect.value.set(
          blockBounds[0] - pad,
          blockBounds[1] - pad,
          blockBounds[2] + pad,
          blockBounds[3] + pad
        )
      }
      this.geometry.applyClipRect(uniforms.uTroikaClipRect.value)
    }
    uniforms.uTroikaSDFDebug.value = !!this.debugSDF

    // Shortcut for setting material color via `color` prop
    const color = isOutline ? (this.outlineColor || 0) : this.color

    if (color == null) {
      // Use default color
    } else {
      // For NodeMaterial, we need to update uniforms differently
      // This is a simplified approach
      if (material.colorNode) {
        // Would need to update color uniform here
      }
    }

    // Base orientation
    let orient = this.orientation || defaultOrient
    if (orient !== material._orientation) {
      let rotMat = uniforms.uTroikaOrient.value
      orient = orient.replace(/[^-+xyz]/g, '')
      let match = orient !== defaultOrient && orient.match(/^([-+])([xyz])([-+])([xyz])$/)
      if (match) {
        let [, hSign, hAxis, vSign, vAxis] = match
        tempVec3a.set(0, 0, 0)[hAxis] = hSign === '-' ? 1 : -1
        tempVec3b.set(0, 0, 0)[vAxis] = vSign === '-' ? -1 : 1
        tempMat4.lookAt(origin, tempVec3a.cross(tempVec3b), tempVec3b)
        rotMat.setFromMatrix4(tempMat4)
      } else {
        rotMat.identity()
      }
      material._orientation = orient
    }
  }

  _parsePercent(value) {
    if (typeof value === 'string') {
      let match = value.match(/^(-?[\d.]+)%$/)
      let pct = match ? parseFloat(match[1]) : NaN
      value = (isNaN(pct) ? 0 : pct / 100) * this.fontSize
    }
    return value
  }

  /**
   * Translate a point in local space to an x/y in the text plane.
   */
  localPositionToTextCoords(position, target = new Vector2()) {
    target.copy(position)
    const r = this.curveRadius
    if (r) {
      target.x = Math.atan2(position.x, Math.abs(r) - Math.abs(position.z)) * Math.abs(r)
    }
    return target
  }

  /**
   * Translate a point in world space to an x/y in the text plane.
   */
  worldPositionToTextCoords(position, target = new Vector2()) {
    tempVec3a.copy(position)
    return this.localPositionToTextCoords(this.worldToLocal(tempVec3a), target)
  }

  /**
   * Custom raycasting to test against the whole text block's max rectangular bounds
   */
  raycast(raycaster, intersects) {
    const {textRenderInfo, curveRadius} = this
    if (textRenderInfo) {
      const bounds = textRenderInfo.blockBounds
      // Simple box raycast for now
      // Could be enhanced with proper curved surface raycasting
    }
  }

  copy(source) {
    const geom = this.geometry
    super.copy(source)
    this.geometry = geom

    COPYABLE_PROPS.forEach(prop => {
      this[prop] = source[prop]
    })
    return this
  }

  clone() {
    return new this.constructor().copy(this)
  }
}

// Create setters for properties that affect text layout:
SYNCABLE_PROPS.forEach(prop => {
  const privateKey = '_private_' + prop
  Object.defineProperty(Text.prototype, prop, {
    get() {
      return this[privateKey]
    },
    set(value) {
      if (value !== this[privateKey]) {
        this[privateKey] = value
        this._needsSync = true
      }
    }
  })
})

export {
  Text
}


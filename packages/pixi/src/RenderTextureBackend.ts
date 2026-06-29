import type {
  BrushDab,
  CompositeMode,
  DirtyRect,
  StrokePatch,
  SurfaceBackend,
  SurfaceLayerState,
  SurfaceMemorySnapshot,
} from '@saier/core'
import type { Renderer } from 'pixi.js'
import type { DisplayMaskCapableBackend, DisplayMaskMode } from './DisplayMaskBackend'
import {
  clampToSize,
  compositeLockAlphaRegion,
  empty,
  fromCircle,
  isEmpty,
  rasterizeDab,
  TiledSurface,
  union,
} from '@saier/core'

import {
  BufferImageSource,
  Container,
  GlProgram,
  Graphics,
  Mesh,
  MeshGeometry,
  Rectangle,
  RenderTexture,
  Shader,
  Sprite,
  Texture,
} from 'pixi.js'
import {
  createDabTexture,
  dabTextureKey,
  DEFAULT_DAB_TEXTURE_SIZE,
} from './dab-cache'

export interface RenderTextureBackendOptions {
  renderer: Renderer
  /** Container that owns layer sprites. In P1-08 this is the board's layer container. */
  stage: Container
  width?: number
  height?: number
}

// Single-pass luminance compositor (layer masks). A full-screen clip-space quad
// samples the content + mask RenderTextures at the same UV and outputs
// `content × luminance(mask)`. The vertex stage writes clip-space `aPosition`
// straight to `gl_Position` (no Pixi projection), so `aUV`/`positions` below own
// the orientation — UV row order is chosen to match Pixi's other RenderTextures.
const LUMINANCE_VERTEX_SRC = `#version 300 es
in vec2 aPosition;
in vec2 aUV;
out vec2 vUV;
void main() {
  vUV = aUV;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}`

// `content` and `mask` are premultiplied-alpha (Pixi uploads premult), so
// `dot(mask.rgb, BT.601)` already equals straightLuminance × maskAlpha — it
// folds in the mask's own coverage, so erasing the mask (alpha→0 ⇒ rgb→0) hides
// too. `content × reveal` stays premultiplied-correct, hence extract/export-safe.
const LUMINANCE_FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uContent;
uniform sampler2D uMask;
out vec4 finalColor;
void main() {
  vec4 content = texture(uContent, vUV);
  vec4 mask = texture(uMask, vUV);
  float reveal = dot(mask.rgb, vec3(0.299, 0.587, 0.114));
  finalColor = content * reveal;
}`

interface LayerRecord {
  id: string
  committedRT: RenderTexture
  sprite: Sprite
  lockAlpha: boolean
  /** when set, the sprite displays `committedRT` masked by this layer's pixels */
  displayMaskLayerId?: string
  /** how the mask layer masks this one (default `alpha` = clip; `luminance` = layer mask) */
  displayMaskMode?: DisplayMaskMode
  /** derived display texture (content masked), shown instead of committedRT */
  derivedRT?: RenderTexture
}

function rgbaToTint(color: BrushDab['color']): number {
  const r = Math.round(Math.min(1, Math.max(0, color.r)) * 255)
  const g = Math.round(Math.min(1, Math.max(0, color.g)) * 255)
  const b = Math.round(Math.min(1, Math.max(0, color.b)) * 255)
  return (r << 16) | (g << 8) | b
}

function clonePixels(pixels: Uint8ClampedArray): Uint8Array {
  return new Uint8Array(pixels)
}

function assertBitmapPatch(
  pixels: StrokePatch['before'] | StrokePatch['after'],
): Uint8Array {
  if (pixels instanceof Uint8Array)
    return pixels
  throw new TypeError('RenderTextureBackend patches must contain Uint8Array pixels')
}

/**
 * P1 RenderTexture-backed implementation of core's `SurfaceBackend`.
 *
 * Strokes accumulate into a shared scratch RT first. `endStroke` snapshots only
 * the dirty bbox before/after compositing into the layer RT, matching D4.
 */
export class RenderTextureBackend implements SurfaceBackend, DisplayMaskCapableBackend {
  readonly width: number
  readonly height: number

  private readonly renderer: Renderer
  private readonly stage: Container
  private readonly layers = new Map<string, LayerRecord>()
  private readonly strokeRT: RenderTexture
  private readonly strokeSprite: Sprite
  private readonly commitContainer = new Container()
  private readonly commitSprite: Sprite
  private readonly dabSprite: Sprite
  private readonly dabTextures = new Map<string, Texture>()
  private readonly clearContainer = new Container()
  private readonly clearRect = new Graphics()
  private activeLayerId: string | undefined
  private strokeMode: CompositeMode | undefined
  private dirty: DirtyRect = empty()
  /**
   * Persistent per-stroke CPU surface for brushes that rasterize on the CPU
   * (soft / textured / max-alpha tips). Dabs accumulate here at full strength so
   * max-alpha stays correct, and the dirty region is uploaded into the scratch
   * `strokeRT` during the stroke so the live preview matches GPU brushes
   * (industry "wet layer" / Krita indirect-painting model).
   */
  private cpuSurface: TiledSurface | undefined
  /** Region painted into `cpuSurface` since the last preview flush. */
  private pendingPreview: DirtyRect = empty()
  private previewRafId: number | undefined
  /** Disable rAF preview batching (deterministic synchronous flush in tests). */
  autoFlushPreview = true

  // Reusable resources for derived masked-display compositing (clip / mask).
  private readonly maskScratchRT: RenderTexture
  private readonly maskSprite: Sprite
  private readonly maskContainer = new Container()

  // Single-pass luminance compositor for layer masks (content × luminance(mask)).
  private readonly luminanceGeometry: MeshGeometry
  private readonly luminanceShader: Shader
  private readonly luminanceMesh: Mesh

  constructor(options: RenderTextureBackendOptions) {
    this.renderer = options.renderer
    this.stage = options.stage
    this.width = options.width ?? options.renderer.width
    this.height = options.height ?? options.renderer.height

    this.maskScratchRT = this.createRenderTexture()
    this.maskSprite = new Sprite(Texture.EMPTY)
    this.maskSprite.label = 'saier-mask-temp'
    this.maskContainer.addChild(this.maskSprite)

    this.luminanceGeometry = new MeshGeometry({
      positions: new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1]),
      uvs: new Float32Array([0, 0, 1, 0, 1, 1, 0, 1]),
      indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    })
    this.luminanceShader = new Shader({
      glProgram: new GlProgram({ vertex: LUMINANCE_VERTEX_SRC, fragment: LUMINANCE_FRAGMENT_SRC, name: 'saier-luminance-mask' }),
      resources: { uContent: Texture.EMPTY.source, uMask: Texture.EMPTY.source },
    })
    this.luminanceMesh = new Mesh({ geometry: this.luminanceGeometry, shader: this.luminanceShader })

    this.strokeRT = this.createRenderTexture()
    this.strokeSprite = new Sprite(this.strokeRT)
    this.strokeSprite.label = 'saier-stroke-preview'

    this.commitSprite = new Sprite(this.strokeRT)
    this.commitSprite.label = 'saier-stroke-commit'
    this.commitContainer.addChild(this.commitSprite)

    this.dabSprite = new Sprite(this.getDabTexture({ tipId: 'round-hard', hardness: 0 }))
    this.dabSprite.label = 'saier-dab-stamp'
    this.dabSprite.anchor.set(0.5)

    this.clearContainer.addChild(this.clearRect)
  }

  createLayer(id: string): void {
    if (this.layers.has(id))
      throw new Error(`Layer already exists: ${id}`)

    const committedRT = this.createRenderTexture()
    const sprite = new Sprite(committedRT)
    sprite.label = id
    this.stage.addChild(sprite)
    this.layers.set(id, { id, committedRT, sprite, lockAlpha: false })
  }

  setLayerState(id: string, state: SurfaceLayerState): void {
    const layer = this.getLayer(id)
    if (state.visible !== undefined)
      layer.sprite.visible = state.visible
    if (state.opacity !== undefined)
      layer.sprite.alpha = Math.max(0, Math.min(1, state.opacity))
    if (state.blendMode !== undefined)
      layer.sprite.blendMode = state.blendMode
    if (state.lockAlpha !== undefined)
      layer.lockAlpha = state.lockAlpha
  }

  /**
   * Display `layerId` masked by `maskLayerId`. Pixi v8 can't use a RenderTexture
   * sprite as a live mask, so we composite a derived texture and show that —
   * which is also safe to `extract` for export.
   *
   * `mode` picks the masking semantics: `alpha` (default) clips by the mask
   * layer's alpha (clip layers); `luminance` hides/reveals by the mask layer's
   * grayscale luminance (layer masks). Pass `undefined` mask id to show content
   * directly.
   */
  setLayerDisplayMask(layerId: string, maskLayerId: string | undefined, mode: DisplayMaskMode = 'alpha'): void {
    const layer = this.getLayer(layerId)
    layer.displayMaskLayerId = maskLayerId
    layer.displayMaskMode = maskLayerId ? mode : undefined
    if (!maskLayerId) {
      layer.sprite.texture = layer.committedRT
      if (layer.derivedRT) {
        layer.derivedRT.destroy(true)
        layer.derivedRT = undefined
      }
      return
    }
    this.computeMaskedDisplay(layer)
  }

  /** Whether a layer exists in this backend. */
  hasLayer(id: string): boolean {
    return this.layers.has(id)
  }

  /** Create a hidden surface (e.g. a layer mask): paintable, not shown directly. */
  createHiddenLayer(id: string): void {
    this.createLayer(id)
    const layer = this.getLayer(id)
    this.stage.removeChild(layer.sprite)
  }

  /** Fill a layer fully opaque white (a fresh "reveal-all" mask). */
  fillLayerOpaque(id: string): void {
    const layer = this.getLayer(id)
    this.renderer.render({ container: this.clearContainer, target: layer.committedRT, clear: true, clearColor: [1, 1, 1, 1] })
  }

  /** Recompute every masked layer's derived display (call after pixels change). */
  refreshDerivedDisplays(_dirtyRect?: DirtyRect): void {
    for (const layer of this.layers.values()) {
      if (layer.displayMaskLayerId)
        this.computeMaskedDisplay(layer)
    }
  }

  private computeMaskedDisplay(layer: LayerRecord): void {
    const maskLayer = layer.displayMaskLayerId ? this.layers.get(layer.displayMaskLayerId) : undefined
    if (!maskLayer) {
      layer.sprite.texture = layer.committedRT
      return
    }
    const derived = layer.derivedRT ?? (layer.derivedRT = this.createRenderTexture())

    if (layer.displayMaskMode === 'luminance') {
      // Layer mask: derived = content × luminance(mask), one GPU pass via the
      // full-screen quad shader. Swapping the source uniforms re-binds the bind
      // group (Shader.resources setter → BindGroup.setResource); the source
      // objects are the layers' stable committedRT, only their pixels change.
      this.luminanceShader.resources.uContent = layer.committedRT.source
      this.luminanceShader.resources.uMask = maskLayer.committedRT.source
      this.renderer.render({ container: this.luminanceMesh, target: derived, clear: true, clearColor: [0, 0, 0, 0] })
      layer.sprite.texture = derived
      return
    }

    // Clip layer (alpha): derived = content × maskAlpha via the two-pass erase.
    // pass 1: scratch = opaque white, erased by the mask alpha → (1 − maskAlpha)
    this.renderer.render({ container: this.clearContainer, target: this.maskScratchRT, clear: true, clearColor: [1, 1, 1, 1] })
    this.drawMaskSprite(maskLayer.committedRT, 'erase', this.maskScratchRT, false)

    // pass 2: derived = content, erased by scratch → content × maskAlpha
    this.drawMaskSprite(layer.committedRT, 'normal', derived, true)
    this.drawMaskSprite(this.maskScratchRT, 'erase', derived, false)

    layer.sprite.texture = derived
  }

  private drawMaskSprite(texture: Texture, blendMode: 'normal' | 'erase', target: RenderTexture, clear: boolean): void {
    this.maskSprite.texture = texture
    this.maskSprite.blendMode = blendMode
    this.maskSprite.anchor.set(0)
    this.maskSprite.position.set(0, 0)
    this.maskSprite.scale.set(1)
    this.maskSprite.rotation = 0
    this.maskSprite.alpha = 1
    // Render via a container so the sprite's blend mode is applied (a bare
    // render-root sprite's blend mode is ignored).
    this.renderer.render({ container: this.maskContainer, target, clear })
  }

  reorderLayers(ids: string[]): void {
    // Stack tracked raster layers on top of the container in document order,
    // ABOVE any foreign children (e.g. legacy image `EditableLayer`s that share
    // this container but aren't part of the raster stack). Using absolute
    // indices here would push those foreign children above newly added layers,
    // hiding freshly committed strokes behind them (a new layer would appear
    // un-drawable — the preview shows mid-stroke, then the commit vanishes).
    for (const id of ids) {
      const layer = this.layers.get(id)
      if (!layer || !layer.sprite.parent)
        continue
      this.stage.setChildIndex(layer.sprite, this.stage.children.length - 1)
    }

    if (this.strokeSprite.parent)
      this.stage.setChildIndex(this.strokeSprite, this.stage.children.length - 1)
  }

  removeLayer(id: string): void {
    const layer = this.getLayer(id)
    this.stage.removeChild(layer.sprite)
    layer.sprite.destroy()
    layer.committedRT.destroy(true)
    layer.derivedRT?.destroy(true)
    this.layers.delete(id)

    // Any layer masked by this one must fall back to showing its content.
    for (const other of this.layers.values()) {
      if (other.displayMaskLayerId === id)
        this.setLayerDisplayMask(other.id, undefined)
    }

    if (this.activeLayerId === id)
      this.endPreview()
  }

  beginStroke(layerId: string): void {
    const layer = this.getLayer(layerId)
    this.clearTexture(this.strokeRT)
    this.dirty = empty()
    this.cancelPreviewFlush()
    this.cpuSurface = undefined
    this.pendingPreview = empty()
    this.activeLayerId = layerId
    this.strokeMode = undefined
    this.syncStrokePreviewTransform(layer.sprite)

    if (!this.strokeSprite.parent)
      this.stage.addChild(this.strokeSprite)
  }

  paintDab(layerId: string, dab: BrushDab, mode: CompositeMode): DirtyRect {
    if (this.activeLayerId !== layerId)
      this.beginStroke(layerId)
    if (this.strokeMode && this.strokeMode !== mode)
      throw new Error('Cannot mix composite modes within one stroke')
    this.strokeMode = mode

    const dirty = clampToSize(fromCircle(dab.x, dab.y, dab.radius), this.width, this.height)
    if (isEmpty(dirty))
      return dirty

    // Locked layers commit on the CPU (lock-alpha blend), so route their dabs
    // through the CPU surface regardless of brush tip.
    if (mode === 'normal' && (shouldRasterizeDabOnCpu(dab) || this.getLayer(layerId).lockAlpha)) {
      const surface = this.ensureCpuSurface()
      rasterizeDab(surface, dab, 'normal')
      this.dirty = union(this.dirty, dirty)
      this.pendingPreview = union(this.pendingPreview, dirty)
      this.schedulePreviewFlush()
      return dirty
    }

    const scale = (dab.radius * 2) / DEFAULT_DAB_TEXTURE_SIZE
    this.dabSprite.texture = this.getDabTexture(dab)
    this.dabSprite.position.set(dab.x, dab.y)
    this.dabSprite.scale.set(scale)
    this.dabSprite.rotation = dab.rotation ?? 0
    this.dabSprite.tint = rgbaToTint(dab.color)
    this.dabSprite.alpha = Math.min(1, Math.max(0, dab.opacity * dab.color.a))
    this.dabSprite.blendMode = 'normal'

    this.renderer.render({
      container: this.dabSprite,
      target: this.strokeRT,
      clear: false,
    })

    this.dirty = union(this.dirty, dirty)
    return dirty
  }

  endStroke(layerId: string): StrokePatch {
    const layer = this.getLayer(layerId)
    const rect = clampToSize(this.dirty, this.width, this.height)

    if (this.activeLayerId !== layerId || isEmpty(rect)) {
      this.endPreview()
      return {
        layerId,
        rect: empty(),
        before: new Uint8Array(),
        after: new Uint8Array(),
      }
    }

    this.flushPreviewNow()
    const before = this.extractLayerPixels(layer, rect)

    if (layer.lockAlpha && this.strokeMode !== 'erase' && this.cpuSurface) {
      // lock-alpha: blend the (CPU-accumulated) stroke onto existing pixels,
      // preserving the layer's alpha so transparent areas never gain paint.
      const stroke = new Uint8Array(this.cpuSurface.readRegion(rect))
      const composited = compositeLockAlphaRegion(before, stroke)
      this.eraseRect(layer.committedRT, rect)
      this.renderPixels(layer.committedRT, rect, composited)
    }
    else {
      this.commitSprite.blendMode = this.strokeMode === 'erase' ? 'erase' : 'normal'
      this.renderer.render({
        container: this.commitContainer,
        target: layer.committedRT,
        clear: false,
      })
    }

    const after = this.extractLayerPixels(layer, rect)

    this.endPreview()

    return {
      layerId,
      rect,
      before,
      after,
    }
  }

  applyPatch(patch: StrokePatch, dir: 'undo' | 'redo'): void {
    const layer = this.getLayer(patch.layerId)
    const rect = clampToSize(patch.rect, this.width, this.height)
    if (isEmpty(rect))
      return

    const pixels = assertBitmapPatch(dir === 'undo' ? patch.before : patch.after)
    if (pixels.length !== rect.width * rect.height * 4) {
      throw new Error(
        `Patch pixel length ${pixels.length} does not match rect ${rect.width}x${rect.height}`,
      )
    }

    this.eraseRect(layer.committedRT, rect)
    this.renderPixels(layer.committedRT, rect, pixels)
  }

  getDisplayHandle(layerId: string): unknown {
    return this.getLayer(layerId).sprite
  }

  getMemorySnapshot(): SurfaceMemorySnapshot {
    const renderTextureBytes = this.width * this.height * 4
    const layerCount = this.layers.size
    const layerBytes = layerCount * renderTextureBytes
    const strokeBytes = renderTextureBytes

    return {
      source: 'rendertexture',
      width: this.width,
      height: this.height,
      totalEstimatedBytes: layerBytes + strokeBytes,
      entries: [
        {
          id: 'surface:rendertexture-layers',
          label: 'Layer RenderTextures',
          bytes: layerBytes,
          kind: 'gpu',
          count: layerCount,
          metadata: {
            bytesPerTexture: renderTextureBytes,
          },
        },
        {
          id: 'surface:rendertexture-stroke',
          label: 'Stroke scratch RenderTexture',
          bytes: strokeBytes,
          kind: 'gpu',
          count: 1,
          metadata: {
            bytesPerTexture: renderTextureBytes,
          },
        },
      ],
      metadata: {
        layerCount,
        bytesPerTexture: renderTextureBytes,
      },
    }
  }

  destroy(): void {
    this.endPreview()
    for (const layer of this.layers.values()) {
      this.stage.removeChild(layer.sprite)
      layer.sprite.destroy()
      layer.committedRT.destroy(true)
      layer.derivedRT?.destroy(true)
    }
    this.layers.clear()
    this.strokeRT.destroy(true)
    this.strokeSprite.destroy()
    this.commitContainer.destroy({ children: true })
    this.dabSprite.destroy()
    for (const texture of this.dabTextures.values())
      texture.destroy(true)
    this.dabTextures.clear()
    this.clearContainer.destroy({ children: true })
    this.maskScratchRT.destroy(true)
    this.maskContainer.destroy({ children: true })
    this.luminanceMesh.destroy()
    this.luminanceShader.destroy()
    this.luminanceGeometry.destroy()
  }

  private createRenderTexture(): RenderTexture {
    const rt = RenderTexture.create({
      width: this.width,
      height: this.height,
    })
    this.clearTexture(rt)
    return rt
  }

  private clearTexture(target: RenderTexture): void {
    // `renderer.clear({ target })` does not reliably clear an off-screen
    // RenderTexture in Pixi v8, leaving stale pixels in the shared scratch RT
    // (which `endStroke` then re-composites onto the layer — darkening existing
    // semi-transparent strokes). Rendering an empty container with `clear: true`
    // binds the target and clears it to transparent for real.
    this.renderer.render({
      container: this.clearContainer,
      target,
      clear: true,
      clearColor: [0, 0, 0, 0],
    })
  }

  private eraseRect(target: RenderTexture, rect: DirtyRect): void {
    this.clearRect.clear()
    this.clearRect
      .rect(rect.x, rect.y, rect.width, rect.height)
      .fill(0xFFFFFF)
    this.clearRect.blendMode = 'erase'

    this.renderer.render({
      container: this.clearContainer,
      target,
      clear: false,
    })

    this.clearRect.clear()
    this.clearRect.blendMode = 'normal'
  }

  private renderPixels(target: RenderTexture, rect: DirtyRect, pixels: Uint8Array): void {
    const texture = createTextureFromPremultipliedPixels(pixels, rect.width, rect.height)
    const sprite = new Sprite(texture)
    sprite.position.set(rect.x, rect.y)

    this.renderer.render({
      container: sprite,
      target,
      clear: false,
    })

    sprite.destroy()
    texture.destroy(true)
  }

  private extractLayerPixels(layer: LayerRecord, rect: DirtyRect): Uint8Array {
    // NOTE: extracts via `layer.sprite` to keep the alpha format that
    // `renderPixels` round-trips through (extracting `committedRT` directly
    // returns a different premultiplication and breaks undo/redo). For a layer
    // with a non-identity display transform (P6-05) this snapshot is warped —
    // a known limitation until transform layers are fully integrated (P6-06+);
    // such layers aren't user-transformable yet, so undo stays correct in
    // practice.
    const { pixels } = this.renderer.extract.pixels({
      target: layer.sprite,
      frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
    })

    return clonePixels(pixels)
  }

  private getDabTexture(dab: Pick<BrushDab, 'tipId' | 'hardness'>): Texture {
    const key = dabTextureKey(dab)
    let texture = this.dabTextures.get(key)
    if (!texture) {
      texture = createDabTexture(this.renderer, {
        tipId: dab.tipId,
        hardness: dab.hardness,
      })
      this.dabTextures.set(key, texture)
    }
    return texture
  }

  private endPreview(): void {
    this.cancelPreviewFlush()
    if (this.strokeSprite.parent)
      this.stage.removeChild(this.strokeSprite)
    this.clearTexture(this.strokeRT)
    this.activeLayerId = undefined
    this.strokeMode = undefined
    this.dirty = empty()
    this.cpuSurface = undefined
    this.pendingPreview = empty()
  }

  private syncStrokePreviewTransform(layerSprite: Sprite): void {
    this.strokeSprite.position.copyFrom(layerSprite.position)
    this.strokeSprite.scale.copyFrom(layerSprite.scale)
    this.strokeSprite.pivot.copyFrom(layerSprite.pivot)
    this.strokeSprite.skew.copyFrom(layerSprite.skew)
    this.strokeSprite.anchor.copyFrom(layerSprite.anchor)
    this.strokeSprite.rotation = layerSprite.rotation
  }

  /** Force any pending CPU preview into the scratch RT synchronously. */
  flushUploads(): void {
    this.flushPreviewNow()
  }

  private ensureCpuSurface(): TiledSurface {
    this.cpuSurface ??= new TiledSurface({
      width: this.width,
      height: this.height,
      tileSize: 256,
    })
    return this.cpuSurface
  }

  /**
   * Upload the region painted into `cpuSurface` since the last flush into the
   * scratch RT. Erase-then-render gives replace semantics, so re-uploading an
   * overlapping region never double-darkens it (the surface is authoritative).
   */
  private flushPreviewNow(): void {
    this.cancelPreviewFlush()
    if (!this.cpuSurface || isEmpty(this.pendingPreview))
      return

    const rect = clampToSize(this.pendingPreview, this.width, this.height)
    this.pendingPreview = empty()
    if (isEmpty(rect))
      return

    this.eraseRect(this.strokeRT, rect)
    this.renderPixels(this.strokeRT, rect, new Uint8Array(this.cpuSurface.readRegion(rect)))
  }

  private schedulePreviewFlush(): void {
    if (!this.autoFlushPreview || typeof requestAnimationFrame === 'undefined') {
      this.flushPreviewNow()
      return
    }
    if (this.previewRafId !== undefined)
      return
    this.previewRafId = requestAnimationFrame(() => {
      this.previewRafId = undefined
      this.flushPreviewNow()
    })
  }

  private cancelPreviewFlush(): void {
    if (this.previewRafId !== undefined && typeof cancelAnimationFrame !== 'undefined')
      cancelAnimationFrame(this.previewRafId)
    this.previewRafId = undefined
  }

  private getLayer(id: string): LayerRecord {
    const layer = this.layers.get(id)
    if (!layer)
      throw new Error(`Unknown layer: ${id}`)
    return layer
  }
}

function shouldRasterizeDabOnCpu(dab: BrushDab): boolean {
  return dab.blendMode === 'max-alpha'
    || (dab.tipId !== undefined && dab.tipId !== 'round-hard')
    || (dab.hardness ?? 0) > 0
}

function createTextureFromPremultipliedPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
): Texture {
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (context) {
      const straightPixels = toStraightAlphaPixels(pixels)
      context.putImageData(new ImageData(straightPixels, width, height), 0, 0)
      return Texture.from(canvas)
    }
  }

  return new Texture({
    source: new BufferImageSource({
      resource: pixels,
      width,
      height,
      format: 'rgba8unorm',
      alphaMode: 'premultiplied-alpha',
    }),
  })
}

function toStraightAlphaPixels(pixels: Uint8Array): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(pixels.length) as Uint8ClampedArray<ArrayBuffer>
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] ?? 0
    out[offset + 3] = alpha
    if (alpha === 0)
      continue

    out[offset] = Math.min(255, Math.round(((pixels[offset] ?? 0) * 255) / alpha))
    out[offset + 1] = Math.min(255, Math.round(((pixels[offset + 1] ?? 0) * 255) / alpha))
    out[offset + 2] = Math.min(255, Math.round(((pixels[offset + 2] ?? 0) * 255) / alpha))
  }
  return out
}

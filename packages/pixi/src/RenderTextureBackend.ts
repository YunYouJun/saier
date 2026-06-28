import type {
  BrushDab,
  CompositeMode,
  DirtyRect,
  StrokePatch,
  SurfaceBackend,
  SurfaceLayerState,
} from '@saier/core'
import type { Renderer } from 'pixi.js'
import {
  clampToSize,
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
  Graphics,
  Rectangle,
  RenderTexture,
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

interface LayerRecord {
  id: string
  committedRT: RenderTexture
  sprite: Sprite
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
export class RenderTextureBackend implements SurfaceBackend {
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
  private bufferedCpuDabs: BrushDab[] = []

  constructor(options: RenderTextureBackendOptions) {
    this.renderer = options.renderer
    this.stage = options.stage
    this.width = options.width ?? options.renderer.width
    this.height = options.height ?? options.renderer.height

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
    this.layers.set(id, { id, committedRT, sprite })
  }

  setLayerState(id: string, state: SurfaceLayerState): void {
    const layer = this.getLayer(id)
    if (state.visible !== undefined)
      layer.sprite.visible = state.visible
    if (state.opacity !== undefined)
      layer.sprite.alpha = Math.max(0, Math.min(1, state.opacity))
    if (state.blendMode !== undefined)
      layer.sprite.blendMode = state.blendMode
  }

  reorderLayers(ids: string[]): void {
    let index = 0
    for (const id of ids) {
      const layer = this.layers.get(id)
      if (!layer || !layer.sprite.parent)
        continue
      this.stage.setChildIndex(layer.sprite, Math.min(index, this.stage.children.length - 1))
      index += 1
    }

    if (this.strokeSprite.parent)
      this.stage.setChildIndex(this.strokeSprite, this.stage.children.length - 1)
  }

  removeLayer(id: string): void {
    const layer = this.getLayer(id)
    this.stage.removeChild(layer.sprite)
    layer.sprite.destroy()
    layer.committedRT.destroy(true)
    this.layers.delete(id)

    if (this.activeLayerId === id)
      this.endPreview()
  }

  beginStroke(layerId: string): void {
    this.getLayer(layerId)
    this.clearTexture(this.strokeRT)
    this.dirty = empty()
    this.bufferedCpuDabs = []
    this.activeLayerId = layerId
    this.strokeMode = undefined

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

    if (mode === 'normal' && shouldRasterizeDabOnCpu(dab)) {
      this.bufferedCpuDabs.push({ ...dab, color: { ...dab.color } })
      this.dirty = union(this.dirty, dirty)
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

    this.flushBufferedCpuDabs(rect)
    const before = this.extractLayerPixels(layer, rect)
    this.commitSprite.blendMode = this.strokeMode === 'erase' ? 'erase' : 'normal'

    this.renderer.render({
      container: this.commitContainer,
      target: layer.committedRT,
      clear: false,
    })

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

  destroy(): void {
    this.endPreview()
    for (const layer of this.layers.values()) {
      this.stage.removeChild(layer.sprite)
      layer.sprite.destroy()
      layer.committedRT.destroy(true)
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
    this.renderer.clear({
      target,
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
    if (this.strokeSprite.parent)
      this.stage.removeChild(this.strokeSprite)
    this.clearTexture(this.strokeRT)
    this.activeLayerId = undefined
    this.strokeMode = undefined
    this.dirty = empty()
    this.bufferedCpuDabs = []
  }

  private flushBufferedCpuDabs(rect: DirtyRect): void {
    if (this.bufferedCpuDabs.length === 0)
      return

    const surface = new TiledSurface({
      width: this.width,
      height: this.height,
      tileSize: 256,
    })

    for (const dab of this.bufferedCpuDabs)
      rasterizeDab(surface, dab, 'normal')

    this.renderPixels(this.strokeRT, rect, new Uint8Array(surface.readRegion(rect)))
    this.bufferedCpuDabs = []
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
      context.putImageData(new ImageData(toStraightAlphaPixels(pixels), width, height), 0, 0)
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

function toStraightAlphaPixels(pixels: Uint8Array): Uint8ClampedArray {
  const out = new Uint8ClampedArray(pixels.length)
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3]
    out[offset + 3] = alpha
    if (alpha === 0)
      continue

    out[offset] = Math.min(255, Math.round((pixels[offset] * 255) / alpha))
    out[offset + 1] = Math.min(255, Math.round((pixels[offset + 1] * 255) / alpha))
    out[offset + 2] = Math.min(255, Math.round((pixels[offset + 2] * 255) / alpha))
  }
  return out
}

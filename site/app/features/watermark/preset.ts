import type { PresetAssetDescriptor, PresetDescriptor, PresetPlacement } from './preset-contract'
import type { ProtectedRegion } from './protocol'
import { tintWatermark } from './layout'
import { isPatternAsset, parsePresetDescriptor, parsePresetPlacements, watermarkObject } from './preset-contract'
import { compositeLinearLight, drawBackdrop, drawFrame, drawPattern, protectionRects } from './preset-render'

export interface LoadedPresetAsset extends PresetAssetDescriptor {
  /** Optional local filename; excluded from the model descriptor. */
  name?: string
  image: HTMLCanvasElement
  source: string
  enabled: boolean
}

export interface LoadedPreset {
  name: string
  rules: string
  assets: LoadedPresetAsset[]
}

/** Import a self-contained private preset; never fetch URLs found in imported JSON. */
export async function readWatermarkPreset(file: File): Promise<LoadedPreset> {
  if (file.size > 64 * 1024 * 1024)
    throw new Error('预设包不能超过 64 MiB')
  const value: unknown = JSON.parse(await file.text())
  if (!watermarkObject(value) || value.format !== 'saier.watermark-preset')
    throw new Error('请选择 Saier 水印预设 JSON 包')
  const descriptor = parsePresetDescriptor(value)
  const entries = value.assets as Record<string, unknown>[]
  let pixels = 0
  const assets: LoadedPresetAsset[] = []
  for (const meta of descriptor.assets) {
    const entry = entries.find(a => a.id === meta.id)!
    if (typeof entry.source !== 'string' || entry.source.length > 24_000_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(entry.source)
      || typeof entry.enabled !== 'boolean') {
      throw new Error('素材必须是预设内嵌的 PNG')
    }
    pixels += meta.width * meta.height
    if (pixels > 32_000_000)
      throw new Error('预设素材总像素不能超过 3200 万')
    const blob = await (await fetch(entry.source)).blob()
    const header = new DataView(await blob.slice(0, 24).arrayBuffer())
    if (header.byteLength < 24 || header.getUint32(0) !== 0x89504E47 || header.getUint32(4) !== 0x0D0A1A0A
      || header.getUint32(16) !== meta.width || header.getUint32(20) !== meta.height) {
      throw new Error('素材 PNG 尺寸与预设不一致')
    }
    const bitmap = await createImageBitmap(blob)
    try {
      if (bitmap.width !== meta.width || bitmap.height !== meta.height)
        throw new Error('素材尺寸与预设不一致')
      const image = document.createElement('canvas')
      image.width = bitmap.width
      image.height = bitmap.height
      image.getContext('2d')!.drawImage(bitmap, 0, 0)
      assets.push({ ...meta, ...(typeof entry.name === 'string' && entry.name.trim() ? { name: entry.name.trim().slice(0, 120) } : {}), image, source: entry.source, enabled: entry.enabled })
    }
    finally {
      bitmap.close()
    }
  }
  return { name: descriptor.name, rules: descriptor.rules, assets }
}

/** Only dimensions and semantic roles travel to the model; raster assets stay in the browser. */
export function describePreset(preset: LoadedPreset): PresetDescriptor {
  return parsePresetDescriptor({ version: 1, name: preset.name, rules: preset.rules, assets: preset.assets.filter(a => a.enabled).map(({ image: _image, source: _source, enabled: _enabled, ...descriptor }) => descriptor) })
}

export function serializePreset(preset: LoadedPreset): string {
  return JSON.stringify({ format: 'saier.watermark-preset', version: 1, name: preset.name, rules: preset.rules, assets: preset.assets.map(({ image: _image, ...asset }) => asset) })
}

/** Render one full-size watermark without baking its opacity or blend mode. */
export function drawPresetAsset(overlay: CanvasRenderingContext2D, asset: LoadedPresetAsset, p: PresetPlacement): void {
  const image = p.color ? tintWatermark(asset.image, p.color) : asset.image
  const width = p.width * overlay.canvas.width
  const height = width * asset.height / asset.width
  overlay.save()
  if (isPatternAsset(asset)) {
    drawPattern(overlay, image, width)
  }
  else if (asset.role === 'frame') {
    drawFrame(overlay, image)
  }
  else {
    overlay.translate(p.x * overlay.canvas.width + width / 2, p.y * overlay.canvas.height + height / 2)
    overlay.rotate(p.rotation * Math.PI / 180)
    overlay.drawImage(image, -width / 2, -height / 2, width, height)
  }
  overlay.restore()
}

/** Deterministic raster composition. Protected source pixels survive even an imperfect model layout. */
export function compositePreset(source: HTMLCanvasElement, preset: LoadedPreset, placements: PresetPlacement[], regions: ProtectedRegion[]): HTMLCanvasElement {
  const descriptor = describePreset(preset)
  const valid = parsePresetPlacements(placements, descriptor, source)
  const result = document.createElement('canvas')
  result.width = source.width
  result.height = source.height
  const context = result.getContext('2d')!
  context.drawImage(source, 0, 0)
  const layer = document.createElement('canvas')
  layer.width = source.width
  layer.height = source.height
  const overlay = layer.getContext('2d')!
  const backdrops = new Map<number, HTMLCanvasElement>()
  // Blur all backdrops first so crossing ribbons do not erase each other.
  for (const p of valid) {
    const asset = preset.assets.find(a => a.id === p.assetId)!
    if (!asset.backdropBlur || isPatternAsset(asset) || asset.role === 'frame')
      continue
    let blurred = backdrops.get(asset.backdropBlur)
    if (!blurred) {
      blurred = document.createElement('canvas')
      blurred.width = source.width
      blurred.height = source.height
      const blur = blurred.getContext('2d')!
      blur.filter = `blur(${Math.min(source.width, source.height) * asset.backdropBlur}px)`
      blur.drawImage(source, 0, 0)
      backdrops.set(asset.backdropBlur, blurred)
    }
    const width = p.width * source.width
    drawBackdrop(context, blurred, p, width, width * asset.height / asset.width, asset.role === 'heart-signature')
  }
  for (const p of valid) {
    const asset = preset.assets.find(a => a.id === p.assetId)!
    overlay.clearRect(0, 0, layer.width, layer.height)
    drawPresetAsset(overlay, asset, p)
    if (asset.blendMode === 'linear-light') {
      compositeLinearLight(context, layer, p.opacity)
    }
    else {
      context.save()
      context.globalCompositeOperation = asset.blendMode === 'overlay' ? 'overlay' : 'source-over'
      context.globalAlpha = p.opacity
      context.drawImage(layer, 0, 0)
      context.restore()
    }
  }
  // Restore original RGBA after every effect, including blurred backdrops and texture blends.
  for (const { x, y, width, height } of protectionRects(source, regions)) {
    context.clearRect(x, y, width, height)
    context.drawImage(source, x, y, width, height, x, y, width, height)
  }
  return result
}

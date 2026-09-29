import type { Layer, LayerMaskData, Psd } from 'ag-psd'
import type { LoadedPresetAsset } from './preset'
import type { PresetPlacement } from './preset-contract'
import type { WatermarkWorkInput } from './workfile'
import { initializeCanvas, writePsd } from 'ag-psd'
import { WATERMARK_ROLE_NAMES } from './editing'
import { compositePreset, describePreset, drawPresetAsset } from './preset'
import { isPatternAsset, parsePresetPlacements, placementBounds } from './preset-contract'
import { drawBackdrop, protectionRects } from './preset-render'

function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement('canvas')
  result.width = width
  result.height = height
  return result
}

/** RGB/8-bit raster interchange: independent marks, native blends, editable protection masks. */
export function createWatermarkPsd(input: WatermarkWorkInput): Psd {
  const { artwork, preset, regions } = input
  const { width, height } = artwork
  if (width > 8192 || height > 8192 || width * height > 32_000_000)
    throw new Error('PSD 导出支持单边 8192px、总计 3200 万像素以内的画作')
  const placements = parsePresetPlacements(input.placements, describePreset(preset), artwork)
  const bounds = (p: PresetPlacement, asset: LoadedPresetAsset) => {
    const b = placementBounds(p, asset, artwork)
    const left = Math.max(0, Math.floor(b.x * width) - 1)
    const top = Math.max(0, Math.floor(b.y * height) - 1)
    return { left, top, width: Math.min(width, Math.ceil((b.x + b.width) * width) + 1) - left, height: Math.min(height, Math.ceil((b.y + b.height) * height) + 1) - top }
  }
  // Reject oversized stacks before allocating layer buffers; writer also needs compression scratch space.
  const layerPixels = placements.reduce((total, p) => {
    const asset = preset.assets.find(a => a.id === p.assetId)!
    const b = bounds(p, asset)
    return total + b.width * b.height * (asset.backdropBlur ? 2 : 1)
  }, width * height)
  if (layerPixels > 160_000_000)
    throw new Error('PSD 图层像素总量超过导出预算，请减少全屏图层或缩小画作')

  const scratch = canvas(width, height)
  const context = scratch.getContext('2d')!
  const protectedAreas = protectionRects(artwork, regions)
  const masks = new Map<string, LayerMaskData>()
  const maskFor = (b: { left: number, top: number, width: number, height: number }): LayerMaskData | undefined => {
    const intersecting = protectedAreas.filter(r => r.x < b.left + b.width && r.x + r.width > b.left && r.y < b.top + b.height && r.y + r.height > b.top)
    if (!intersecting.length)
      return undefined
    const key = `${b.left},${b.top},${b.width},${b.height}`
    if (!masks.has(key)) {
      const mask = canvas(b.width, b.height)
      const ctx = mask.getContext('2d')!
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, b.width, b.height)
      ctx.fillStyle = '#000000'
      for (const r of intersecting)
        ctx.fillRect(r.x - b.left, r.y - b.top, r.width, r.height)
      masks.set(key, { left: b.left, top: b.top, defaultColor: 255, positionRelativeToLayer: false, imageData: ctx.getImageData(0, 0, b.width, b.height) })
      mask.width = mask.height = 1
    }
    return masks.get(key)
  }
  const children: Layer[] = [{ name: '原图', canvas: artwork, opacity: 1, blendMode: 'normal', protected: { composite: true, position: true } }]
  const capture = (name: string, asset: LoadedPresetAsset, p: PresetPlacement, backdrop = false): void => {
    const b = bounds(p, asset)
    children.push({
      name,
      left: b.left,
      top: b.top,
      imageData: context.getImageData(b.left, b.top, b.width, b.height),
      opacity: backdrop ? 1 : p.opacity,
      blendMode: backdrop ? 'normal' : asset.blendMode === 'linear-light' ? 'linear light' : asset.blendMode ?? 'normal',
      mask: maskFor(b),
    })
  }
  // Match the compositor's two passes: every blurred backdrop sits below every watermark.
  const blurred = canvas(width, height)
  let radius = -1
  for (const p of placements) {
    const asset = preset.assets.find(a => a.id === p.assetId)!
    if (!asset.backdropBlur || isPatternAsset(asset) || asset.role === 'frame')
      continue
    if (radius !== asset.backdropBlur) {
      radius = asset.backdropBlur
      const blur = blurred.getContext('2d')!
      blur.clearRect(0, 0, width, height)
      blur.filter = `blur(${Math.min(width, height) * radius}px)`
      blur.drawImage(artwork, 0, 0)
    }
    context.clearRect(0, 0, width, height)
    const markWidth = p.width * width
    drawBackdrop(context, blurred, p, markWidth, markWidth * asset.height / asset.width, asset.role === 'heart-signature')
    capture(`${WATERMARK_ROLE_NAMES[asset.role]} · 背景柔化`, asset, p, true)
  }
  blurred.width = blurred.height = 1
  for (const p of placements) {
    const asset = preset.assets.find(a => a.id === p.assetId)!
    context.clearRect(0, 0, width, height)
    drawPresetAsset(context, asset, p)
    capture(WATERMARK_ROLE_NAMES[asset.role], asset, p)
  }
  scratch.width = scratch.height = 1
  return { width, height, bitsPerChannel: 8, children, canvas: compositePreset(artwork, preset, placements, regions) }
}

/** Serialize locally with RLE compression supported by Krita; the input artwork is never modified. */
export function exportWatermarkPsd(input: WatermarkWorkInput): Blob {
  initializeCanvas(canvas)
  const psd = createWatermarkPsd(input)
  try {
    return new Blob([writePsd(psd, { noBackground: true })], { type: 'image/vnd.adobe.photoshop' })
  }
  finally {
    psd.canvas!.width = psd.canvas!.height = 1
  }
}

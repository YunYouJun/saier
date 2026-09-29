import type { ProtectedRegion } from './analysis'

export interface WatermarkPlacement {
  x: number
  y: number
  width: number
  height: number
}

/** Recolor monochrome artwork while preserving every source alpha value. */
export function tintWatermark(source: HTMLCanvasElement, color: string): HTMLCanvasElement {
  if (!/^#[a-f0-9]{6}$/i.test(color))
    throw new Error('Expected a six-digit RGB color')
  const result = document.createElement('canvas')
  result.width = source.width
  result.height = source.height
  const pixels = source.getContext('2d')!.getImageData(0, 0, source.width, source.height)
  const rgb = [1, 3, 5].map(offset => Number.parseInt(color.slice(offset, offset + 2), 16))
  for (let i = 0; i < pixels.data.length; i += 4) {
    pixels.data[i] = rgb[0]!
    pixels.data[i + 1] = rgb[1]!
    pixels.data[i + 2] = rgb[2]!
  }
  result.getContext('2d')!.putImageData(pixels, 0, 0)
  return result
}

/** A local starting suggestion based on the background beneath the candidate placement. */
export function suggestWatermarkStyle(source: HTMLCanvasElement, placement: WatermarkPlacement): { color: string, opacity: number } {
  const sample = document.createElement('canvas')
  sample.width = sample.height = 24
  const context = sample.getContext('2d')!
  // View transparent pixels against white, matching the exported artwork preview.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 24, 24)
  context.drawImage(source, placement.x, placement.y, placement.width, placement.height, 0, 0, 24, 24)
  const { data } = context.getImageData(0, 0, 24, 24)
  let red = 0
  let green = 0
  let blue = 0
  for (let i = 0; i < data.length; i += 4) {
    red += data[i]!
    green += data[i + 1]!
    blue += data[i + 2]!
  }
  const count = data.length / 4
  const rgb = [red / count / 255, green / count / 255, blue / count / 255]
  const max = Math.max(...rgb)
  const min = Math.min(...rgb)
  const delta = max - min
  let hue = 210
  if (delta > 0.04) {
    if (max === rgb[0])
      hue = 60 * (((rgb[1]! - rgb[2]!) / delta + 6) % 6)
    else if (max === rgb[1])
      hue = 60 * ((rgb[2]! - rgb[0]!) / delta + 2)
    else
      hue = 60 * ((rgb[0]! - rgb[1]!) / delta + 4)
  }
  const luminance = rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722
  const lightness = luminance > 0.55 ? 0.42 : 0.78
  const saturation = 0.38
  const channel = (offset: number): string => {
    const k = (offset + hue / 30) % 12
    const a = saturation * Math.min(lightness, 1 - lightness)
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(value * 255).toString(16).padStart(2, '0')
  }
  return { color: `#${channel(0)}${channel(8)}${channel(4)}`, opacity: luminance > 0.55 ? 0.6 : 0.7 }
}

/** Conservative, deterministic placement: the entire unrotated watermark rectangle must fit. */
export function findWatermarkPlacement(
  canvas: { width: number, height: number },
  watermark: { width: number, height: number },
  regions: ProtectedRegion[],
  widthRatio: number,
): WatermarkPlacement | undefined {
  if (![canvas.width, canvas.height, watermark.width, watermark.height, widthRatio].every(n => Number.isFinite(n) && n > 0)
    || widthRatio > 1) {
    return undefined
  }
  const width = canvas.width * widthRatio
  const height = width * watermark.height / watermark.width
  const margin = Math.min(canvas.width, canvas.height) * 0.025
  const availableX = canvas.width - width - margin * 2
  const availableY = canvas.height - height - margin * 2
  if (availableX < 0 || availableY < 0)
    return undefined
  for (const fy of [1, 0, 0.75, 0.25, 0.5]) {
    for (const fx of [1, 0, 0.75, 0.25, 0.5]) {
      const x = margin + availableX * fx
      const y = margin + availableY * fy
      const overlap = regions.some(r => x < (r.x + r.width) * canvas.width + margin
        && x + width > r.x * canvas.width - margin
        && y < (r.y + r.height) * canvas.height + margin
        && y + height > r.y * canvas.height - margin)
      if (!overlap)
        return { x, y, width, height }
    }
  }
  return undefined
}

/** Browser composition only; the original source canvas is never modified. */
export function compositeWatermark(
  source: HTMLCanvasElement,
  watermark: HTMLCanvasElement,
  placement: WatermarkPlacement,
  opacity: number,
): HTMLCanvasElement {
  if (!Number.isFinite(opacity) || opacity < 0 || opacity > 1
    || !Object.values(placement).every(Number.isFinite)
    || placement.width <= 0 || placement.height <= 0 || placement.x < 0 || placement.y < 0
    || placement.x + placement.width > source.width || placement.y + placement.height > source.height) {
    throw new Error('Invalid watermark placement')
  }
  const result = document.createElement('canvas')
  result.width = source.width
  result.height = source.height
  const context = result.getContext('2d')!
  context.drawImage(source, 0, 0)
  context.globalAlpha = opacity
  context.drawImage(watermark, placement.x, placement.y, placement.width, placement.height)
  return result
}

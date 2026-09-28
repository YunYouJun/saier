import type { PresetPlacement } from './preset-contract'
import type { ProtectedRegion } from './protocol'

/** Shared pixel-aligned protection bounds for PNG composition and PSD masks. */
export function protectionRects(size: { width: number, height: number }, regions: ProtectedRegion[]): { x: number, y: number, width: number, height: number }[] {
  const margin = Math.min(size.width, size.height) * 0.02
  return regions.map((r) => {
    const x = Math.max(0, Math.floor(r.x * size.width - margin))
    const y = Math.max(0, Math.floor(r.y * size.height - margin))
    return {
      x,
      y,
      width: Math.min(size.width, Math.ceil((r.x + r.width) * size.width + margin)) - x,
      height: Math.min(size.height, Math.ceil((r.y + r.height) * size.height + margin)) - y,
    }
  })
}

/** Tile the clean repeat cell without carrying any source illustration's erased face hole. */
export function drawPattern(context: CanvasRenderingContext2D, image: HTMLCanvasElement, width: number): void {
  const scale = width / image.width
  const pattern = context.createPattern(image, 'repeat')!
  pattern.setTransform(new DOMMatrix().scale(scale))
  context.fillStyle = pattern
  context.fillRect(0, 0, context.canvas.width, context.canvas.height)
}

/** Nine-slice only the frame's perimeter; lettering must be extracted as separate assets. */
export function drawFrame(context: CanvasRenderingContext2D, image: HTMLCanvasElement): void {
  const s = Math.floor(Math.min(image.width, image.height) * 0.07)
  const d = Math.min(context.canvas.width, context.canvas.height) * 0.07
  const sx = [0, s, image.width - s, image.width]
  const sy = [0, s, image.height - s, image.height]
  const dx = [0, d, context.canvas.width - d, context.canvas.width]
  const dy = [0, d, context.canvas.height - d, context.canvas.height]
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      if (x !== 1 || y !== 1)
        context.drawImage(image, sx[x]!, sy[y]!, sx[x + 1]! - sx[x]!, sy[y + 1]! - sy[y]!, dx[x]!, dy[y]!, dx[x + 1]! - dx[x]!, dy[y + 1]! - dy[y]!)
    }
  }
}

/** Canvas has no linear-light blend operation. Apply it in bounded row strips with source-over alpha. */
export function compositeLinearLight(context: CanvasRenderingContext2D, layer: HTMLCanvasElement, opacity: number): void {
  const source = layer.getContext('2d')!
  const width = layer.width
  for (let y = 0; y < layer.height; y += 128) {
    const height = Math.min(128, layer.height - y)
    const foreground = source.getImageData(0, y, width, height).data
    const pixels = context.getImageData(0, y, width, height)
    const background = pixels.data
    for (let i = 0; i < background.length; i += 4) {
      const a = foreground[i + 3]! / 255 * opacity
      if (!a)
        continue
      const b = background[i + 3]! / 255
      const outAlpha = a + b * (1 - a)
      for (let c = 0; c < 3; c++) {
        const src = foreground[i + c]!
        const dst = background[i + c]!
        const blend = Math.max(0, Math.min(255, dst + 2 * src - 255))
        background[i + c] = ((1 - a) * b * dst + a * ((1 - b) * src + b * blend)) / outAlpha
      }
      background[i + 3] = outAlpha * 255
    }
    context.putImageData(pixels, 0, y)
  }
}

/** Recreate the PSD's baked local backdrop blur, without editing the source canvas. */
export function drawBackdrop(context: CanvasRenderingContext2D, blurred: HTMLCanvasElement, placement: PresetPlacement, width: number, height: number, ellipse: boolean): void {
  context.save()
  context.translate(placement.x * context.canvas.width + width / 2, placement.y * context.canvas.height + height / 2)
  context.rotate(placement.rotation * Math.PI / 180)
  context.beginPath()
  if (ellipse)
    context.ellipse(0, 0, width / 2, height / 2, 0, 0, Math.PI * 2)
  else
    context.roundRect(-width / 2, -height / 2, width, height, Math.min(width, height) * 0.08)
  context.clip()
  context.resetTransform()
  context.drawImage(blurred, 0, 0)
  context.restore()
}

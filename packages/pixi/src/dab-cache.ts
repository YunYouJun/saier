import type { BrushDab } from '@saier/core'
import type { Renderer, Texture } from 'pixi.js'
import { DEFAULT_BRUSH_TIP_ID, sampleBrushTipAlpha } from '@saier/core'

import { BufferImageSource, Texture as PixiTexture } from 'pixi.js'

export const DEFAULT_DAB_TEXTURE_SIZE = 64

export interface DabTextureOptions {
  tipId?: string
  hardness?: number
  size?: number
}

export function dabTextureKey(dab: Pick<BrushDab, 'tipId' | 'hardness'>): string {
  return `${dab.tipId ?? DEFAULT_BRUSH_TIP_ID}:${roundKey(dab.hardness ?? -1)}`
}

export function createDabTexture(
  _renderer: Renderer,
  options: DabTextureOptions = {},
): Texture {
  const size = options.size ?? DEFAULT_DAB_TEXTURE_SIZE
  const pixels = new Uint8Array(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1
      const ny = ((y + 0.5) / size) * 2 - 1
      const alpha = sampleBrushTipAlpha({
        tipId: options.tipId,
        x: nx,
        y: ny,
        hardness: options.hardness,
        edgeSize: 1 / size,
      })
      const offset = (y * size + x) * 4
      pixels[offset] = 255
      pixels[offset + 1] = 255
      pixels[offset + 2] = 255
      pixels[offset + 3] = Math.round(alpha * 255)
    }
  }

  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const context = canvas.getContext('2d')
    if (context) {
      context.putImageData(new ImageData(new Uint8ClampedArray(pixels), size, size), 0, 0)
      return PixiTexture.from(canvas)
    }
  }

  return new PixiTexture({
    source: new BufferImageSource({
      resource: pixels,
      width: size,
      height: size,
      format: 'rgba8unorm',
      alphaMode: 'premultiply-alpha-on-upload',
    }),
  })
}

/** Build a reusable white circle stamp. Tint/alpha/scale are applied per dab. */
export function createRoundDabTexture(
  renderer: Renderer,
  size = DEFAULT_DAB_TEXTURE_SIZE,
): Texture {
  return createDabTexture(renderer, {
    tipId: DEFAULT_BRUSH_TIP_ID,
    hardness: 0,
    size,
  })
}

function roundKey(value: number): string {
  return Math.round(value * 1000).toString()
}

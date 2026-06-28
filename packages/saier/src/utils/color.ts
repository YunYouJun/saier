import type { RGBA } from '@saier/core'
import { hexToRGBA } from '@saier/core'

export function painterColorToRGBA(color: number | string): RGBA {
  if (typeof color === 'string')
    return hexToRGBA(color)

  return {
    r: ((color >> 16) & 0xFF) / 255,
    g: ((color >> 8) & 0xFF) / 255,
    b: (color & 0xFF) / 255,
    a: 1,
  }
}

import type { RGBA } from '../types/brush'

/**
 * Parse a CSS hex color (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`, leading `#`
 * optional) into straight (non-premultiplied) {@link RGBA} with channels in `0..1`.
 */
export function hexToRGBA(hex: string): RGBA {
  let h = hex.trim().replace(/^#/, '')

  // Expand shorthand (#rgb / #rgba) to full form.
  if (h.length === 3 || h.length === 4) {
    h = h.split('').map(c => c + c).join('')
  }

  if (h.length !== 6 && h.length !== 8)
    throw new Error(`Invalid hex color: ${hex}`)

  const int = Number.parseInt(h, 16)
  if (Number.isNaN(int))
    throw new Error(`Invalid hex color: ${hex}`)

  if (h.length === 6) {
    return {
      r: ((int >> 16) & 0xFF) / 255,
      g: ((int >> 8) & 0xFF) / 255,
      b: (int & 0xFF) / 255,
      a: 1,
    }
  }

  return {
    r: ((int >>> 24) & 0xFF) / 255,
    g: ((int >> 16) & 0xFF) / 255,
    b: ((int >> 8) & 0xFF) / 255,
    a: (int & 0xFF) / 255,
  }
}

function channelToHex(v: number): string {
  const n = Math.round(clamp01(v) * 255)
  return n.toString(16).padStart(2, '0')
}

/**
 * Serialize {@link RGBA} back to a hex string.
 * Emits `#rrggbb` when fully opaque, `#rrggbbaa` otherwise.
 */
export function rgbaToHex(color: RGBA): string {
  const rgb = `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`
  return color.a >= 1 ? rgb : `${rgb}${channelToHex(color.a)}`
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * Premultiply RGB by alpha. Pixi textures store premultiplied alpha, so
 * backends premultiply before writing and unpremultiply after extracting.
 */
export function premultiply(color: RGBA): RGBA {
  return {
    r: color.r * color.a,
    g: color.g * color.a,
    b: color.b * color.a,
    a: color.a,
  }
}

/** Inverse of {@link premultiply}; a zero-alpha pixel maps back to `0` RGB. */
export function unpremultiply(color: RGBA): RGBA {
  if (color.a === 0)
    return { r: 0, g: 0, b: 0, a: 0 }
  return {
    r: color.r / color.a,
    g: color.g / color.a,
    b: color.b / color.a,
    a: color.a,
  }
}

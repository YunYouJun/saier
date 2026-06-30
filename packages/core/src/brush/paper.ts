export type BuiltinPaperTextureId = 'cold-press' | 'rough' | 'linen'
export type PaperTextureId = BuiltinPaperTextureId | (string & {})

export interface PaperTexture {
  id: PaperTextureId
  seed: number
  scale: number
  contrast: number
  min: number
}

export const BUILTIN_PAPER_TEXTURES: readonly PaperTexture[] = [
  {
    id: 'cold-press',
    seed: 1729,
    scale: 9,
    contrast: 0.6,
    min: 0.46,
  },
  {
    id: 'rough',
    seed: 3191,
    scale: 6,
    contrast: 0.78,
    min: 0.34,
  },
  {
    id: 'linen',
    seed: 7477,
    scale: 11,
    contrast: 0.52,
    min: 0.5,
  },
]

/**
 * Deterministic document-space paper grain. Returns a coverage multiplier in
 * `0..1`; callers blend it with `1` according to strength.
 */
export function samplePaper(textureId: PaperTextureId | undefined, docX: number, docY: number): number {
  const texture = getBuiltinPaperTexture(textureId)
  if (!texture)
    return 1

  const x = Math.floor(docX / texture.scale)
  const y = Math.floor(docY / texture.scale)
  const fine = hash2(Math.floor(docX), Math.floor(docY), texture.seed)
  const coarse = smoothNoise(x, y, texture.seed)
  const woven = texture.id === 'linen'
    ? (Math.sin(docX * 0.9) * Math.sin(docY * 0.9) + 1) * 0.5
    : 0.5
  const grain = clamp01(coarse * 0.62 + fine * 0.28 + woven * 0.1)
  const shaped = grain ** (1 + texture.contrast)
  return clamp01(texture.min + shaped * (1 - texture.min))
}

export function getBuiltinPaperTexture(id: PaperTextureId | undefined): PaperTexture | undefined {
  return BUILTIN_PAPER_TEXTURES.find(texture => texture.id === id)
}

function smoothNoise(x: number, y: number, seed: number): number {
  const corners = (
    hash2(x - 1, y - 1, seed)
    + hash2(x + 1, y - 1, seed)
    + hash2(x - 1, y + 1, seed)
    + hash2(x + 1, y + 1, seed)
  ) / 16
  const sides = (
    hash2(x - 1, y, seed)
    + hash2(x + 1, y, seed)
    + hash2(x, y - 1, seed)
    + hash2(x, y + 1, seed)
  ) / 8
  const center = hash2(x, y, seed) / 4
  return corners + sides + center
}

function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) & 0xFFFF) / 0xFFFF
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}

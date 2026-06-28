export type BrushTipShape = 'round' | 'textured-round' | 'chisel'

export type BuiltinBrushTipId
  = | 'round-hard'
    | 'round-soft'
    | 'pencil-grain'
    | 'marker-chisel'
    | 'airbrush-soft'
    | 'calligraphy-round'

export type BrushTipId = BuiltinBrushTipId | (string & {})

export interface BrushTip {
  id: BrushTipId
  name: string
  shape: BrushTipShape
  /** Edge softness `0..1`; `0` is a hard antialiased edge. */
  hardness: number
  /** Deterministic alpha variation for textured tips. */
  textureStrength?: number
  seed?: number
}

export const DEFAULT_BRUSH_TIP_ID: BuiltinBrushTipId = 'round-hard'

export const BUILTIN_BRUSH_TIPS: readonly BrushTip[] = [
  {
    id: 'round-hard',
    name: 'Round Hard',
    shape: 'round',
    hardness: 0,
  },
  {
    id: 'round-soft',
    name: 'Round Soft',
    shape: 'round',
    hardness: 0.55,
  },
  {
    id: 'pencil-grain',
    name: 'Pencil Grain',
    shape: 'textured-round',
    hardness: 0.38,
    textureStrength: 0.5,
    seed: 17,
  },
  {
    id: 'marker-chisel',
    name: 'Marker Chisel',
    shape: 'chisel',
    hardness: 0.18,
  },
  {
    id: 'airbrush-soft',
    name: 'Airbrush Soft',
    shape: 'round',
    hardness: 0.9,
  },
  {
    id: 'calligraphy-round',
    name: 'Calligraphy Round',
    shape: 'round',
    hardness: 0.28,
  },
]

export class BrushTipRegistry {
  private readonly tips = new Map<BrushTipId, BrushTip>()

  constructor(tips: readonly BrushTip[] = []) {
    for (const tip of tips)
      this.register(tip)
  }

  register(tip: BrushTip): void {
    this.tips.set(tip.id, cloneTip(tip))
  }

  unregister(id: BrushTipId): boolean {
    return this.tips.delete(id)
  }

  get(id: BrushTipId): BrushTip | undefined {
    const tip = this.tips.get(id)
    return tip ? cloneTip(tip) : undefined
  }

  require(id: BrushTipId): BrushTip {
    const tip = this.get(id)
    if (!tip)
      throw new Error(`Unknown brush tip: ${id}`)
    return tip
  }

  list(): BrushTip[] {
    return [...this.tips.values()].map(cloneTip)
  }
}

export function createDefaultBrushTipRegistry(): BrushTipRegistry {
  return new BrushTipRegistry(BUILTIN_BRUSH_TIPS)
}

export function getBuiltinBrushTip(id: BrushTipId | undefined): BrushTip {
  return BUILTIN_BRUSH_TIPS.find(tip => tip.id === (id ?? DEFAULT_BRUSH_TIP_ID))
    ?? BUILTIN_BRUSH_TIPS[0]!
}

export interface BrushTipSampleOptions {
  tipId?: BrushTipId
  /** Normalized x in tip space, `-1..1` around the dab center. */
  x: number
  /** Normalized y in tip space, `-1..1` around the dab center. */
  y: number
  /** Overrides the tip default edge softness. */
  hardness?: number
  /** Antialias edge width in normalized tip coordinates. */
  edgeSize?: number
}

export function sampleBrushTipAlpha(options: BrushTipSampleOptions): number {
  const tip = getBuiltinBrushTip(options.tipId)
  const edgeSize = Math.max(0, options.edgeSize ?? 0)
  const hardness = clamp01(options.hardness ?? tip.hardness)
  let distance: number

  if (tip.shape === 'chisel') {
    const x = Math.abs(options.x) / 0.95
    const y = Math.abs(options.y) / 0.32
    distance = Math.max(x, y)
  }
  else {
    distance = Math.hypot(options.x, options.y)
  }

  let alpha = edgeCoverage(distance, hardness, edgeSize)

  if (tip.shape === 'textured-round' && alpha > 0) {
    const grain = grainAt(options.x, options.y, tip.seed ?? 0)
    const strength = clamp01(tip.textureStrength ?? 0)
    alpha *= (1 - strength) + strength * grain
  }

  return clamp01(alpha)
}

function edgeCoverage(distance: number, hardness: number, edgeSize: number): number {
  const outer = 1 + edgeSize
  const inner = hardness === 0
    ? Math.max(0, 1 - edgeSize)
    : Math.max(0, 1 - hardness)

  if (distance <= inner)
    return 1
  if (distance >= outer)
    return 0
  return (outer - distance) / Math.max(0.000001, outer - inner)
}

function grainAt(x: number, y: number, seed: number): number {
  const gx = Math.floor((x + 1) * 32)
  const gy = Math.floor((y + 1) * 32)
  const value = hash2(gx, gy, seed)
  return 0.25 + value * 0.75
}

function hash2(x: number, y: number, seed: number): number {
  let h = x * 374761393 + y * 668265263 + seed * 1442695041
  h = (h ^ (h >>> 13)) * 1274126177
  h = h ^ (h >>> 16)
  return ((h >>> 0) & 0xFFFF) / 0xFFFF
}

function cloneTip(tip: BrushTip): BrushTip {
  return { ...tip }
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}

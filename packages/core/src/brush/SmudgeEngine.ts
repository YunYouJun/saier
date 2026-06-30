import type {
  BrushContext,
  BrushDab,
  BrushEngine,
  BrushInputPoint,
  RGBA,
} from '../types'
import type { SimpleBrushEngineOptions } from './SimpleBrushEngine'
import { SimpleBrushEngine } from './SimpleBrushEngine'

export interface SmudgeEngineOptions extends SimpleBrushEngineOptions {
  /** How strongly each sample refreshes the smudge bucket. */
  smudge?: number
  /** Brush color contribution, `0` = pure smudge, `1` = pure paint. */
  colorAmount?: number
  /** Bucket memory, `0` = short drag, `1` = longest drag. */
  persistence?: number
  /** Per-dab pigment deposit strength. */
  density?: number
  /** Per-dab dilution / wetness. */
  dilution?: number
  /** Wet-edge pigment buildup. */
  wetEdge?: number
  /** Paper texture id used to modulate dab coverage. */
  paperTextureId?: string
  /** Paper texture modulation strength. */
  paperTextureStrength?: number
}

export interface SmudgeBrushEngine extends BrushEngine {
  prepareDab: (dab: BrushDab, sample: RGBA) => BrushDab
}

interface ResolvedSmudgeEngineOptions {
  smudge: number
  colorAmount: number
  persistence: number
  density: number
  dilution: number
  wetEdge: number
  paperTextureId?: string
  paperTextureStrength: number
}

const DEFAULTS: ResolvedSmudgeEngineOptions = {
  smudge: 1,
  colorAmount: 0,
  persistence: 0.82,
  density: 0.7,
  dilution: 0.15,
  wetEdge: 0,
  paperTextureStrength: 0,
}

/**
 * Color-smudge brush. Geometry is delegated to SimpleBrushEngine; color is
 * resolved one dab at a time by sampling the target surface and updating a
 * deterministic smudge bucket.
 */
export class SmudgeEngine implements SmudgeBrushEngine {
  private readonly geometry: SimpleBrushEngine
  private readonly options: ResolvedSmudgeEngineOptions

  private ctx: BrushContext | null = null
  private bucket: RGBA | null = null

  constructor(options: SmudgeEngineOptions = {}) {
    this.geometry = new SimpleBrushEngine(options)
    this.options = {
      smudge: clamp01(options.smudge ?? DEFAULTS.smudge),
      colorAmount: clamp01(options.colorAmount ?? DEFAULTS.colorAmount),
      persistence: clamp01(options.persistence ?? DEFAULTS.persistence),
      density: clamp01(options.density ?? DEFAULTS.density),
      dilution: clamp01(options.dilution ?? DEFAULTS.dilution),
      wetEdge: clamp01(options.wetEdge ?? DEFAULTS.wetEdge),
      paperTextureId: options.paperTextureId,
      paperTextureStrength: clamp01(options.paperTextureStrength ?? DEFAULTS.paperTextureStrength),
    }
  }

  beginStroke(ctx: BrushContext): void {
    this.ctx = ctx
    this.bucket = null
    this.geometry.beginStroke(ctx)
  }

  addPoint(point: BrushInputPoint): BrushDab[] {
    return this.geometry.addPoint(point)
  }

  endStroke(): BrushDab[] {
    return this.geometry.endStroke()
  }

  prepareDab(dab: BrushDab, sample: RGBA): BrushDab {
    if (!this.ctx)
      throw new Error('SmudgeEngine.prepareDab called before beginStroke')

    this.bucket = this.nextBucket(sample)
    const color = mixRGBA(this.bucket, this.ctx.color, this.options.colorAmount)

    return {
      ...dab,
      color,
      density: this.options.density,
      dilution: this.options.dilution,
      wetEdge: this.options.wetEdge,
      paperTextureId: this.options.paperTextureId,
      paperTextureStrength: this.options.paperTextureStrength,
      blendMode: 'source-over',
    }
  }

  private nextBucket(sample: RGBA): RGBA {
    const cleanSample = normalizeRGBA(sample)
    if (!this.bucket)
      return cleanSample

    const sampleInfluence = this.options.smudge * (1 - this.options.persistence)
    return mixRGBA(this.bucket, cleanSample, sampleInfluence)
  }
}

export function isSmudgeBrushEngine(engine: BrushEngine): engine is SmudgeBrushEngine {
  return typeof (engine as Partial<SmudgeBrushEngine>).prepareDab === 'function'
}

function mixRGBA(a: RGBA, b: RGBA, t: number): RGBA {
  const f = clamp01(t)
  return {
    r: lerp(a.r, b.r, f),
    g: lerp(a.g, b.g, f),
    b: lerp(a.b, b.b, f),
    a: lerp(a.a, b.a, f),
  }
}

function normalizeRGBA(color: RGBA): RGBA {
  return {
    r: clamp01(color.r),
    g: clamp01(color.g),
    b: clamp01(color.b),
    a: clamp01(color.a),
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}

import type { PressureCurveConfig } from '../input'
import type { BrushDabBlendMode, BrushEngine } from '../types'
import type { AirbrushEngineOptions } from './AirbrushEngine'
import type { CalligraphyEngineOptions } from './CalligraphyEngine'
import type { PressureFallbackMode, SimpleBrushEngineOptions } from './SimpleBrushEngine'
import type { SmudgeEngineOptions } from './SmudgeEngine'
import { AirbrushEngine } from './AirbrushEngine'
import { CalligraphyEngine } from './CalligraphyEngine'
import { SimpleBrushEngine } from './SimpleBrushEngine'
import { SmudgeEngine } from './SmudgeEngine'

export type BuiltinBrushPresetId
  = | 'pen'
    | 'pencil'
    | 'marker'
    | 'airbrush'
    | 'calligraphy'
    | 'smudge'
    | 'blender'
    | 'watercolor'

export type BrushPresetId = BuiltinBrushPresetId | (string & {})

export type BrushPresetEngine = 'simple' | 'airbrush' | 'calligraphy' | 'smudge'

export interface BrushPreset {
  id: BrushPresetId
  name: string
  engine: BrushPresetEngine
  tipId: string
  /** Default brush diameter in document pixels. */
  size: number
  /** Default stroke opacity multiplier `0..1`. */
  opacity: number
  spacing: number
  hardness: number
  /** Canvas pickup amount for future smudge / color-mixing engines, `0..1`. */
  smudge?: number
  /** Brush's own color contribution when mixing sampled color, `0..1`. */
  colorAmount?: number
  /** Pigment dilution / wetness, `0..1`; `0` preserves current stamp behavior. */
  dilution?: number
  /** Smudge bucket memory / drag length, `0..1`. */
  persistence?: number
  /** Wet-edge strength, `0..1`; `0` disables wet-edge behavior. */
  wetEdge?: number
  /** Per-dab pigment deposit strength, `0..1`; omitted means full density. */
  density?: number
  /** Paper texture id used by later paper-grain coverage modulation. */
  paperTextureId?: string
  /** Paper texture coverage modulation strength, `0..1`; `0` disables paper. */
  paperTextureStrength?: number
  /** Dabs per second; used by airbrush. */
  flow?: number
  minSizeRatio?: number
  maxSizeRatio?: number
  minOpacity?: number
  maxOpacity?: number
  sizeCurve?: PressureCurveConfig
  opacityCurve?: PressureCurveConfig
  pressureCurve?: PressureCurveConfig
  pressureFallback?: PressureFallbackMode
  taperIn?: number
  taperOut?: number
  taperMinFactor?: number
  rotation?: number
  blendMode?: BrushDabBlendMode
  simple?: SimpleBrushEngineOptions
  airbrush?: AirbrushEngineOptions
  calligraphy?: CalligraphyEngineOptions
}

export interface BrushPresetSummary {
  id: BrushPresetId
  name: string
  engine: BrushPresetEngine
  tipId: string
}

export interface BrushEngineFromPresetOptions {
  opacity?: number
  spacing?: number
  hardness?: number
  flow?: number
  baseSize?: number
  pressureFallback?: PressureFallbackMode
  smudge?: number
  colorAmount?: number
  dilution?: number
  persistence?: number
  wetEdge?: number
  density?: number
  paperTextureId?: string
  paperTextureStrength?: number
}

export const DEFAULT_BRUSH_PRESET_ID: BuiltinBrushPresetId = 'pen'

export const DEFAULT_BRUSH_PRESETS: readonly BrushPreset[] = [
  {
    id: 'pen',
    name: 'Pen',
    engine: 'simple',
    tipId: 'round-hard',
    size: 10,
    opacity: 1,
    spacing: 0.22,
    hardness: 0,
    minSizeRatio: 0.18,
    maxSizeRatio: 1,
    minOpacity: 0.85,
    maxOpacity: 1,
    sizeCurve: 'linear',
    opacityCurve: 'ease-out',
    taperMinFactor: 0.18,
  },
  {
    id: 'pencil',
    name: 'Pencil',
    engine: 'simple',
    tipId: 'pencil-grain',
    size: 14,
    opacity: 0.72,
    spacing: 0.32,
    hardness: 0.36,
    minSizeRatio: 0.35,
    maxSizeRatio: 1,
    minOpacity: 0.12,
    maxOpacity: 0.55,
    sizeCurve: 'ease-out',
    opacityCurve: 'ease-in',
    pressureFallback: 'velocity',
  },
  {
    id: 'marker',
    name: 'Marker',
    engine: 'simple',
    tipId: 'marker-chisel',
    size: 22,
    opacity: 0.62,
    spacing: 0.18,
    hardness: 0.16,
    minSizeRatio: 0.72,
    maxSizeRatio: 1,
    minOpacity: 0.28,
    maxOpacity: 0.42,
    opacityCurve: 'linear',
    blendMode: 'max-alpha',
    rotation: -Math.PI / 7,
  },
  {
    id: 'airbrush',
    name: 'Airbrush',
    engine: 'airbrush',
    tipId: 'airbrush-soft',
    size: 34,
    opacity: 0.75,
    spacing: 0.5,
    hardness: 0.9,
    flow: 28,
    minSizeRatio: 0.7,
    maxSizeRatio: 1,
    minOpacity: 0.015,
    maxOpacity: 0.055,
  },
  {
    id: 'calligraphy',
    name: 'Calligraphy',
    engine: 'calligraphy',
    tipId: 'calligraphy-round',
    size: 28,
    opacity: 1,
    spacing: 0.35,
    hardness: 0.25,
    minSizeRatio: 0.15,
    maxSizeRatio: 1,
    minOpacity: 0.35,
    maxOpacity: 1,
  },
  {
    id: 'smudge',
    name: 'Smudge',
    engine: 'smudge',
    tipId: 'round-soft',
    size: 32,
    opacity: 0.9,
    spacing: 0.18,
    hardness: 0.7,
    minSizeRatio: 0.85,
    maxSizeRatio: 1,
    minOpacity: 0.8,
    maxOpacity: 1,
    smudge: 1,
    colorAmount: 0,
    persistence: 0.86,
    density: 0.75,
    dilution: 0.18,
  },
  {
    id: 'blender',
    name: 'Blender',
    engine: 'smudge',
    tipId: 'round-soft',
    size: 40,
    opacity: 0.85,
    spacing: 0.2,
    hardness: 0.78,
    minSizeRatio: 0.9,
    maxSizeRatio: 1,
    minOpacity: 0.75,
    maxOpacity: 1,
    smudge: 0.75,
    colorAmount: 0.12,
    persistence: 0.78,
    density: 0.55,
    dilution: 0.28,
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    engine: 'smudge',
    tipId: 'round-soft',
    size: 36,
    opacity: 0.78,
    spacing: 0.16,
    hardness: 0.82,
    minSizeRatio: 0.88,
    maxSizeRatio: 1,
    minOpacity: 0.72,
    maxOpacity: 1,
    smudge: 0.65,
    colorAmount: 0.38,
    persistence: 0.72,
    density: 0.6,
    dilution: 0.42,
    wetEdge: 0.72,
    paperTextureId: 'cold-press',
    paperTextureStrength: 0.45,
  },
]

export class BrushPresetRegistry {
  private readonly presets = new Map<BrushPresetId, BrushPreset>()

  constructor(presets: readonly BrushPreset[] = []) {
    for (const preset of presets)
      this.register(preset)
  }

  register(preset: BrushPreset): void {
    this.presets.set(preset.id, clonePreset(preset))
  }

  unregister(id: BrushPresetId): boolean {
    return this.presets.delete(id)
  }

  get(id: BrushPresetId): BrushPreset | undefined {
    const preset = this.presets.get(id)
    return preset ? clonePreset(preset) : undefined
  }

  require(id: BrushPresetId): BrushPreset {
    const preset = this.get(id)
    if (!preset)
      throw new Error(`Unknown brush preset: ${id}`)
    return preset
  }

  list(): BrushPreset[] {
    return [...this.presets.values()].map(clonePreset)
  }

  summaries(): BrushPresetSummary[] {
    return this.list().map(toBrushPresetSummary)
  }
}

export function createDefaultBrushPresetRegistry(): BrushPresetRegistry {
  return new BrushPresetRegistry(DEFAULT_BRUSH_PRESETS)
}

export function toBrushPresetSummary(preset: BrushPreset): BrushPresetSummary {
  return {
    id: preset.id,
    name: preset.name,
    engine: preset.engine,
    tipId: preset.tipId,
  }
}

export function createBrushEngineFromPreset(
  preset: BrushPreset,
  options: BrushEngineFromPresetOptions = {},
): BrushEngine {
  switch (preset.engine) {
    case 'airbrush':
      return new AirbrushEngine(resolveAirbrushOptions(preset, options))
    case 'calligraphy':
      return new CalligraphyEngine(resolveCalligraphyOptions(preset, options))
    case 'smudge':
      return new SmudgeEngine(resolveSmudgeOptions(preset, options))
    case 'simple':
    default:
      return new SimpleBrushEngine(resolveSimpleOptions(preset, options))
  }
}

function resolveSimpleOptions(
  preset: BrushPreset,
  options: BrushEngineFromPresetOptions,
): SimpleBrushEngineOptions {
  const opacity = clamp01(options.opacity ?? preset.opacity)
  const baseSize = options.baseSize ?? preset.size
  return {
    spacingRatio: options.spacing ?? preset.spacing,
    minSizeRatio: preset.minSizeRatio,
    maxSizeRatio: preset.maxSizeRatio,
    minOpacity: (preset.minOpacity ?? 1) * opacity,
    maxOpacity: (preset.maxOpacity ?? 1) * opacity,
    hardness: options.hardness ?? preset.hardness,
    tipId: preset.tipId,
    blendMode: preset.blendMode,
    rotation: preset.rotation,
    density: options.density ?? preset.density,
    dilution: options.dilution ?? preset.dilution,
    wetEdge: options.wetEdge ?? preset.wetEdge,
    paperTextureId: options.paperTextureId ?? preset.paperTextureId,
    paperTextureStrength: options.paperTextureStrength ?? preset.paperTextureStrength,
    pressureCurve: preset.pressureCurve,
    sizeCurve: preset.sizeCurve,
    opacityCurve: preset.opacityCurve,
    pressureFallback: options.pressureFallback ?? preset.pressureFallback,
    taperIn: preset.taperIn ?? baseSize,
    taperOut: preset.taperOut ?? baseSize,
    taperMinFactor: preset.taperMinFactor,
    ...preset.simple,
  }
}

function resolveSmudgeOptions(
  preset: BrushPreset,
  options: BrushEngineFromPresetOptions,
): SmudgeEngineOptions {
  const opacity = clamp01(options.opacity ?? preset.opacity)
  const baseSize = options.baseSize ?? preset.size
  return {
    spacingRatio: options.spacing ?? preset.spacing,
    minSizeRatio: preset.minSizeRatio,
    maxSizeRatio: preset.maxSizeRatio,
    minOpacity: (preset.minOpacity ?? 1) * opacity,
    maxOpacity: (preset.maxOpacity ?? 1) * opacity,
    hardness: options.hardness ?? preset.hardness,
    tipId: preset.tipId,
    rotation: preset.rotation,
    pressureCurve: preset.pressureCurve,
    sizeCurve: preset.sizeCurve,
    opacityCurve: preset.opacityCurve,
    pressureFallback: options.pressureFallback ?? preset.pressureFallback,
    taperIn: preset.taperIn ?? baseSize,
    taperOut: preset.taperOut ?? baseSize,
    taperMinFactor: preset.taperMinFactor,
    smudge: options.smudge ?? preset.smudge,
    colorAmount: options.colorAmount ?? preset.colorAmount,
    persistence: options.persistence ?? preset.persistence,
    density: options.density ?? preset.density,
    dilution: options.dilution ?? preset.dilution,
    wetEdge: options.wetEdge ?? preset.wetEdge,
    paperTextureId: options.paperTextureId ?? preset.paperTextureId,
    paperTextureStrength: options.paperTextureStrength ?? preset.paperTextureStrength,
    ...preset.simple,
  }
}

function resolveAirbrushOptions(
  preset: BrushPreset,
  options: BrushEngineFromPresetOptions,
): AirbrushEngineOptions {
  const opacity = clamp01(options.opacity ?? preset.opacity)
  return {
    flowRate: options.flow ?? preset.flow,
    spacingRatio: options.spacing ?? preset.spacing,
    minSizeRatio: preset.minSizeRatio,
    maxSizeRatio: preset.maxSizeRatio,
    minOpacity: (preset.minOpacity ?? 0.015) * opacity,
    maxOpacity: (preset.maxOpacity ?? 0.055) * opacity,
    hardness: options.hardness ?? preset.hardness,
    tipId: preset.tipId,
    pressureCurve: preset.pressureCurve,
    sizeCurve: preset.sizeCurve,
    opacityCurve: preset.opacityCurve,
    ...preset.airbrush,
  }
}

function resolveCalligraphyOptions(
  preset: BrushPreset,
  options: BrushEngineFromPresetOptions,
): CalligraphyEngineOptions {
  const opacity = clamp01(options.opacity ?? preset.opacity)
  return {
    spacingRatio: options.spacing ?? preset.spacing,
    minSizeRatio: preset.minSizeRatio,
    maxSizeRatio: preset.maxSizeRatio,
    minOpacity: (preset.minOpacity ?? 0.35) * opacity,
    maxOpacity: (preset.maxOpacity ?? 1) * opacity,
    hardness: options.hardness ?? preset.hardness,
    tipId: preset.tipId,
    ...preset.calligraphy,
  }
}

/** Return a defensive copy of a brush preset and its nested option objects. */
export function clonePreset(preset: BrushPreset): BrushPreset {
  return {
    ...preset,
    sizeCurve: clonePressureCurveConfig(preset.sizeCurve),
    opacityCurve: clonePressureCurveConfig(preset.opacityCurve),
    pressureCurve: clonePressureCurveConfig(preset.pressureCurve),
    simple: preset.simple ? { ...preset.simple } : undefined,
    airbrush: preset.airbrush ? { ...preset.airbrush } : undefined,
    calligraphy: preset.calligraphy ? { ...preset.calligraphy } : undefined,
  }
}

function clonePressureCurveConfig(config: PressureCurveConfig | undefined): PressureCurveConfig | undefined {
  if (Array.isArray(config))
    return config.map(point => ({ ...point }))
  return config
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}

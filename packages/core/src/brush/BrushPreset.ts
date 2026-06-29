import type { PressureCurveConfig } from '../input'
import type { BrushDabBlendMode, BrushEngine } from '../types'
import type { AirbrushEngineOptions } from './AirbrushEngine'
import type { CalligraphyEngineOptions } from './CalligraphyEngine'
import type { PressureFallbackMode, SimpleBrushEngineOptions } from './SimpleBrushEngine'
import { AirbrushEngine } from './AirbrushEngine'
import { CalligraphyEngine } from './CalligraphyEngine'
import { SimpleBrushEngine } from './SimpleBrushEngine'

export type BuiltinBrushPresetId
  = | 'pen'
    | 'pencil'
    | 'marker'
    | 'airbrush'
    | 'calligraphy'

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
      throw new Error('smudge engine not implemented (P7-04)')
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

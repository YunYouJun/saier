import type { BrushPreset, BrushPresetEngine, BrushPresetId } from './BrushPreset'

export interface MyPaintBrushImportOptions {
  id?: BrushPresetId
  name?: string
  group?: string
  engine?: BrushPresetEngine
  tipId?: string
}

type MyPaintSettingValue
  = | number
    | { base_value?: number, inputs?: Record<string, unknown> }

interface MyPaintBrushFile {
  comment?: string
  description?: string
  group?: string
  parent_brush_name?: string
  settings?: Record<string, MyPaintSettingValue>
}

const MAPPING_LIMITS = {
  minSize: 1,
  maxSize: 400,
  minSpacing: 0.05,
  maxSpacing: 1,
}

export function parseMyPaintBrushPreset(
  source: string,
  options: MyPaintBrushImportOptions = {},
): BrushPreset {
  const file = parseMyPaintBrushFile(source)
  const settings = file.settings ?? {}
  const name = options.name
    ?? file.parent_brush_name
    ?? firstNonEmptyLine(file.comment)
    ?? 'MyPaint Brush'
  const smudge = settingNumber(settings, 'smudge', 0)
  const engine = options.engine ?? (smudge > 0.05 ? 'smudge' : 'simple')

  return {
    id: options.id ?? toBrushPresetId(name),
    name,
    group: options.group ?? file.group ?? 'Imported',
    source: 'mypaint',
    custom: true,
    tags: ['mypaint'],
    engine,
    tipId: options.tipId ?? 'round-soft',
    size: clamp(
      Math.round(Math.exp(settingNumber(settings, 'radius_logarithmic', Math.log(8))) * 2),
      MAPPING_LIMITS.minSize,
      MAPPING_LIMITS.maxSize,
    ),
    opacity: clamp01(settingNumber(settings, 'opaque', 1)),
    spacing: clamp(
      1 / Math.max(1, settingNumber(settings, 'dabs_per_actual_radius', 4)),
      MAPPING_LIMITS.minSpacing,
      MAPPING_LIMITS.maxSpacing,
    ),
    hardness: clamp01(1 - settingNumber(settings, 'hardness', 0.8)),
    minOpacity: 0.05,
    maxOpacity: clamp01(settingNumber(settings, 'opaque', 1)),
    minSizeRatio: 0.2,
    maxSizeRatio: 1,
    smudge: engine === 'smudge' ? clamp01(smudge) : undefined,
    persistence: engine === 'smudge'
      ? clamp01(settingNumber(settings, 'smudge_length', 0.65))
      : undefined,
    colorAmount: engine === 'smudge'
      ? clamp01(1 - smudge)
      : undefined,
  }
}

function parseMyPaintBrushFile(source: string): MyPaintBrushFile {
  try {
    const parsed = JSON.parse(source) as MyPaintBrushFile
    if (parsed && typeof parsed === 'object')
      return parsed
  }
  catch {
    // Fall through to the legacy line parser.
  }

  const settings: Record<string, number> = {}
  const lines = source.split(/\r?\n/)
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#'))
      continue
    const match = /^(\w+)\s+(-?\d+(?:\.\d+)?)/.exec(trimmed)
    if (match)
      settings[match[1]!] = Number(match[2])
  }

  return {
    comment: lines.find(line => line.trim().startsWith('#'))?.replace(/^#+\s*/, ''),
    settings,
  }
}

function settingNumber(
  settings: Record<string, MyPaintSettingValue>,
  key: string,
  fallback: number,
): number {
  const setting = settings[key]
  if (typeof setting === 'number')
    return Number.isFinite(setting) ? setting : fallback
  if (setting && typeof setting.base_value === 'number' && Number.isFinite(setting.base_value))
    return setting.base_value
  return fallback
}

function firstNonEmptyLine(value: string | undefined): string | undefined {
  return value?.split(/\r?\n/).map(line => line.trim()).find(Boolean)
}

function toBrushPresetId(name: string): BrushPresetId {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `mypaint-${slug || 'brush'}`
}

function clamp01(value: number): number {
  return clamp(value, 0, 1)
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  if (value < min)
    return min
  if (value > max)
    return max
  return value
}

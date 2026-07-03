import type { BrushPreset, BrushPresetId, BrushPresetSource, PressureCurveConfig } from '@saier/core'
import { clonePreset, isSyncableBrushPreset } from '@saier/core'

export const SAIER_BRUSH_LIBRARY_FORMAT = 'saier.brush-library.v1'
export const SAIER_BRUSH_LIBRARY_VERSION = 1
export const SAIER_BRUSH_LIBRARY_FILE_NAME = 'brush-library.saier.brushes.json'
export const SAIER_BRUSH_LIBRARY_MAX_BYTES = 256 * 1024

export interface SaierBrushLibraryFile {
  format: typeof SAIER_BRUSH_LIBRARY_FORMAT
  version: typeof SAIER_BRUSH_LIBRARY_VERSION
  updatedAt: number
  presets: BrushPreset[]
}

export interface BrushPresetMergeResult {
  changed: boolean
  presets: BrushPreset[]
}

type BrushPresetNumberField = Extract<keyof BrushPreset, string>

const NUMBER_FIELDS: BrushPresetNumberField[] = [
  'size',
  'opacity',
  'spacing',
  'hardness',
  'smudge',
  'colorAmount',
  'dilution',
  'persistence',
  'wetEdge',
  'density',
  'paperTextureStrength',
  'flow',
  'minSizeRatio',
  'maxSizeRatio',
  'minOpacity',
  'maxOpacity',
  'taperIn',
  'taperOut',
  'taperMinFactor',
  'rotation',
]

const BRUSH_PRESET_SOURCES = new Set<BrushPresetSource>([
  'builtin',
  'custom',
  'external',
  'mypaint',
])

export function extractSyncableBrushPresets(presets: readonly BrushPreset[]): BrushPreset[] {
  return presets
    .filter(isSyncableBrushPreset)
    .map(clonePreset)
}

export function createBrushLibraryFile(
  presets: readonly BrushPreset[],
  updatedAt = Date.now(),
): SaierBrushLibraryFile {
  return {
    format: SAIER_BRUSH_LIBRARY_FORMAT,
    version: SAIER_BRUSH_LIBRARY_VERSION,
    updatedAt,
    presets: extractSyncableBrushPresets(presets),
  }
}

export function serializeBrushLibraryFile(library: SaierBrushLibraryFile): string {
  const text = JSON.stringify({
    ...library,
    presets: extractSyncableBrushPresets(library.presets),
  })
  if (encodedByteLength(text) > SAIER_BRUSH_LIBRARY_MAX_BYTES)
    throw new Error('brush_library_too_large')
  return text
}

export function parseBrushLibraryText(text: string): SaierBrushLibraryFile | undefined {
  if (encodedByteLength(text) > SAIER_BRUSH_LIBRARY_MAX_BYTES)
    return undefined

  try {
    return parseBrushLibraryFile(JSON.parse(text))
  }
  catch {
    return undefined
  }
}

export function parseBrushLibraryFile(value: unknown): SaierBrushLibraryFile | undefined {
  const record = asRecord(value)
  if (!record || record.format !== SAIER_BRUSH_LIBRARY_FORMAT || record.version !== SAIER_BRUSH_LIBRARY_VERSION)
    return undefined

  const rawPresets = Array.isArray(record.presets) ? record.presets : undefined
  const updatedAt = numberValue(record.updatedAt)
  if (!rawPresets || updatedAt === undefined)
    return undefined

  const presets: BrushPreset[] = []
  for (const rawPreset of rawPresets) {
    const preset = parseBrushPreset(rawPreset)
    if (!preset)
      return undefined
    if (isSyncableBrushPreset(preset))
      presets.push(preset)
  }

  if (rawPresets.length > 0 && presets.length === 0)
    return undefined

  return {
    format: SAIER_BRUSH_LIBRARY_FORMAT,
    version: SAIER_BRUSH_LIBRARY_VERSION,
    updatedAt,
    presets,
  }
}

export function mergeBrushPresets(
  cloudPresets: readonly BrushPreset[],
  localPresets: readonly BrushPreset[],
): BrushPresetMergeResult {
  const result: BrushPreset[] = []
  const usedIds = new Set<BrushPresetId>()

  for (const cloudPreset of extractSyncableBrushPresets(cloudPresets)) {
    const preset = clonePreset(cloudPreset)
    result.push(preset)
    usedIds.add(preset.id)
  }

  for (const localPreset of extractSyncableBrushPresets(localPresets)) {
    const existing = result.find(preset => preset.id === localPreset.id)
    if (!existing) {
      const preset = clonePreset(localPreset)
      preset.id = uniqueBrushPresetId(preset.id, usedIds)
      result.push(preset)
      usedIds.add(preset.id)
      continue
    }

    if (sameBrushPreset(existing, localPreset))
      continue

    const preset = clonePreset(localPreset)
    preset.id = uniqueBrushPresetId(`${preset.id}-local`, usedIds)
    preset.name = localCopyName(preset.name)
    result.push(preset)
    usedIds.add(preset.id)
  }

  return {
    changed: !sameBrushPresetList(result, extractSyncableBrushPresets(cloudPresets)),
    presets: result,
  }
}

export function sameBrushPresetList(a: readonly BrushPreset[], b: readonly BrushPreset[]): boolean {
  return stableStringify(extractSyncableBrushPresets(a)) === stableStringify(extractSyncableBrushPresets(b))
}

export function encodedByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength
}

function parseBrushPreset(value: unknown): BrushPreset | undefined {
  const record = asRecord(value)
  if (!record)
    return undefined

  const id = stringValue(record.id)
  const name = stringValue(record.name)
  const engine = stringValue(record.engine)
  const tipId = stringValue(record.tipId)
  const size = numberValue(record.size)
  const opacity = numberValue(record.opacity)
  const spacing = numberValue(record.spacing)
  const hardness = numberValue(record.hardness)
  if (!id || !name || !engine || !tipId || size === undefined || opacity === undefined || spacing === undefined || hardness === undefined)
    return undefined

  const preset: BrushPreset = {
    id: id as BrushPresetId,
    name,
    engine,
    tipId,
    size,
    opacity,
    spacing,
    hardness,
  }

  const group = stringValue(record.group)
  if (group)
    preset.group = group
  const source = stringValue(record.source)
  if (source && BRUSH_PRESET_SOURCES.has(source as BrushPresetSource))
    preset.source = source as BrushPresetSource
  if (record.custom === true)
    preset.custom = true
  const tags = arrayOfStrings(record.tags)
  if (tags)
    preset.tags = tags
  const paperTextureId = stringValue(record.paperTextureId)
  if (paperTextureId)
    preset.paperTextureId = paperTextureId
  const tipBlendMode = stringValue(record.blendMode)
  if (tipBlendMode)
    preset.blendMode = tipBlendMode as BrushPreset['blendMode']

  for (const field of NUMBER_FIELDS) {
    const number = numberValue(record[field])
    if (number !== undefined)
      Object.assign(preset, { [field]: number })
  }

  const sizeCurve = parsePressureCurveConfig(record.sizeCurve)
  if (sizeCurve)
    preset.sizeCurve = sizeCurve
  const opacityCurve = parsePressureCurveConfig(record.opacityCurve)
  if (opacityCurve)
    preset.opacityCurve = opacityCurve
  const pressureCurve = parsePressureCurveConfig(record.pressureCurve)
  if (pressureCurve)
    preset.pressureCurve = pressureCurve
  const pressureFallback = stringValue(record.pressureFallback)
  if (pressureFallback)
    preset.pressureFallback = pressureFallback as BrushPreset['pressureFallback']

  const simple = asRecord(record.simple)
  if (simple)
    preset.simple = { ...simple } as BrushPreset['simple']
  const airbrush = asRecord(record.airbrush)
  if (airbrush)
    preset.airbrush = { ...airbrush } as BrushPreset['airbrush']
  const calligraphy = asRecord(record.calligraphy)
  if (calligraphy)
    preset.calligraphy = { ...calligraphy } as BrushPreset['calligraphy']

  return clonePreset(preset)
}

function parsePressureCurveConfig(value: unknown): PressureCurveConfig | undefined {
  if (typeof value === 'string')
    return value as PressureCurveConfig
  if (!Array.isArray(value))
    return undefined

  const points = value.map((point) => {
    const record = asRecord(point)
    const x = numberValue(record?.x)
    const y = numberValue(record?.y)
    return x === undefined || y === undefined ? undefined : { x, y }
  })
  if (points.some(point => !point))
    return undefined
  return points as PressureCurveConfig
}

function uniqueBrushPresetId(baseId: BrushPresetId, usedIds: Set<BrushPresetId>): BrushPresetId {
  if (!usedIds.has(baseId))
    return baseId

  let index = 2
  let next = `${baseId}-${index}` as BrushPresetId
  while (usedIds.has(next)) {
    index += 1
    next = `${baseId}-${index}` as BrushPresetId
  }
  return next
}

function localCopyName(name: string): string {
  return /\(local\)$/i.test(name.trim()) ? name : `${name} (local)`
}

function sameBrushPreset(a: BrushPreset, b: BrushPreset): boolean {
  return stableStringify(clonePreset(a)) === stableStringify(clonePreset(b))
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value))
    return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    return `{${Object.keys(record)
      .filter(key => record[key] !== undefined)
      .sort()
      .map(key => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function arrayOfStrings(value: unknown): string[] | undefined {
  if (!Array.isArray(value))
    return undefined
  const strings = value
    .map(stringValue)
    .filter((item): item is string => Boolean(item))
  return strings.length === value.length ? strings : undefined
}

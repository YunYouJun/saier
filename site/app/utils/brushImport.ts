import type { BrushPreset, BrushPresetId } from '@saier/core'
import { parseMyPaintBrushPreset } from '@saier/core'

export type BrushPresetImportFormat = 'mypaint'

export type BrushPresetImportFailureReason
  = | 'empty_file'
    | 'invalid_mypaint'
    | 'unsupported_format'
    | 'unsupported_sai'

export interface BrushPresetImportOptions {
  existingIds?: Iterable<BrushPresetId | string>
  fileName?: string
}

export interface BrushPresetImportResult {
  format: BrushPresetImportFormat
  preset: BrushPreset
}

export class BrushPresetImportError extends Error {
  constructor(readonly reason: BrushPresetImportFailureReason) {
    super(reason)
    this.name = 'BrushPresetImportError'
  }
}

const MYPAINT_SETTING_KEYS = [
  'radius_logarithmic',
  'opaque',
  'hardness',
  'dabs_per_actual_radius',
  'smudge',
  'smudge_length',
] as const

const MYPAINT_SETTING_KEY_PATTERN = new RegExp(`^(?:${MYPAINT_SETTING_KEYS.join('|')})\\s+-?\\d`, 'm')

export function parseBrushPresetImportText(
  source: string,
  options: BrushPresetImportOptions = {},
): BrushPresetImportResult {
  const text = source.trim()
  if (!text)
    throw new BrushPresetImportError('empty_file')

  const fileName = options.fileName?.trim() ?? ''
  if (isSaiBrushFileName(fileName))
    throw new BrushPresetImportError('unsupported_sai')

  const mypaintFile = isMyPaintBrushFileName(fileName)
  if (!mypaintFile && !looksLikeMyPaintBrushText(text))
    throw new BrushPresetImportError('unsupported_format')

  if (!looksLikeMyPaintBrushText(text))
    throw new BrushPresetImportError('invalid_mypaint')

  const preset = parseMyPaintBrushPreset(text)
  preset.id = uniqueImportedBrushPresetId(preset.id, options.existingIds)
  preset.source = 'mypaint'
  preset.custom = true
  preset.tags = uniqueTags([...(preset.tags ?? []), 'imported'])
  return {
    format: 'mypaint',
    preset,
  }
}

export function isBrushPresetImportError(error: unknown): error is BrushPresetImportError {
  return error instanceof BrushPresetImportError
}

function looksLikeMyPaintBrushText(text: string): boolean {
  const json = parseJsonRecord(text)
  if (json) {
    const settings = asRecord(json.settings)
    return Boolean(settings && MYPAINT_SETTING_KEYS.some(key => key in settings))
  }

  return MYPAINT_SETTING_KEY_PATTERN.test(text)
}

function uniqueImportedBrushPresetId(
  id: BrushPresetId,
  existingIds: Iterable<BrushPresetId | string> | undefined,
): BrushPresetId {
  const used = new Set(existingIds ?? [])
  if (!used.has(id))
    return id

  let index = 2
  let next = `${id}-${index}` as BrushPresetId
  while (used.has(next)) {
    index += 1
    next = `${id}-${index}` as BrushPresetId
  }
  return next
}

function isMyPaintBrushFileName(fileName: string): boolean {
  return /\.myb(?:\.json)?$/i.test(fileName)
}

function isSaiBrushFileName(fileName: string): boolean {
  return /\.(?:sai2tool|sai2br|sai2tex|conf|ini|bmp)$/i.test(fileName)
}

function uniqueTags(tags: string[]): string[] {
  return [...new Set(tags.map(tag => tag.trim()).filter(Boolean))]
}

function parseJsonRecord(text: string): Record<string, unknown> | undefined {
  try {
    return asRecord(JSON.parse(text))
  }
  catch {
    return undefined
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : undefined
}

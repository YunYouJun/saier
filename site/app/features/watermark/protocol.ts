import type { PresetDescriptor, PresetPlacement } from './preset-contract.ts'
import { parsePresetPlacements, presetPlacementSchema } from './preset-contract.ts'

/** A snapshot identity travels with every provider result; models cannot change it. */
export interface AnalysisSnapshot {
  documentId: string
  revision: number
  sha256: string
  width: number
  height: number
}

export interface ProtectedRegion {
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface WatermarkAnalysis {
  regions: ProtectedRegion[]
  warnings: string[]
  placements?: PresetPlacement[]
}

export interface AnalysisRequest {
  snapshot: AnalysisSnapshot
  image: string
  rules: string
  preset?: PresetDescriptor
  openDesktop?: boolean
}

export interface AnalysisResponse {
  snapshot: AnalysisSnapshot
  analysis: WatermarkAnalysis
  threadId?: string
  chargedMicroPoints?: number
  operationId?: string
}

export interface WatermarkAnalysisProvider {
  analyze: (request: AnalysisRequest, signal: AbortSignal) => Promise<AnalysisResponse>
}

export const analysisSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['regions', 'warnings'],
  properties: {
    regions: {
      type: 'array',
      maxItems: 64,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'x', 'y', 'width', 'height'],
        properties: {
          label: { type: 'string', maxLength: 120 },
          x: { type: 'number', minimum: 0, maximum: 1 },
          y: { type: 'number', minimum: 0, maximum: 1 },
          width: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
          height: { type: 'number', exclusiveMinimum: 0, maximum: 1 },
        },
      },
    },
    warnings: { type: 'array', maxItems: 16, items: { type: 'string', maxLength: 500 } },
  },
} as const

export const presetAnalysisSchema = { ...analysisSchema, required: ['regions', 'warnings', 'placements'], properties: { ...analysisSchema.properties, placements: presetPlacementSchema } } as const

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validate model output again, including geometric constraints JSON Schema cannot express. */
export function parseAnalysis(value: unknown, preset?: PresetDescriptor, image?: { width: number, height: number }): WatermarkAnalysis {
  if (!object(value) || !Array.isArray(value.regions) || value.regions.length > 64
    || !Array.isArray(value.warnings) || value.warnings.length > 16) {
    throw new Error('Invalid analysis result')
  }
  const regions = value.regions.map((region): ProtectedRegion => {
    if (!object(region) || typeof region.label !== 'string' || region.label.length > 120)
      throw new Error('Invalid protected region')
    const { x, y, width, height } = region
    if (typeof x !== 'number' || typeof y !== 'number' || typeof width !== 'number' || typeof height !== 'number'
      || ![x, y, width, height].every(Number.isFinite)
      || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > 1 || y + height > 1) {
      throw new Error('Protected region is outside the image')
    }
    return { label: region.label, x, y, width, height }
  })
  const warnings = value.warnings.map((warning) => {
    if (typeof warning !== 'string' || warning.length > 500)
      throw new Error('Invalid analysis warning')
    return warning
  })
  return { regions, warnings, ...(preset && image ? { placements: parsePresetPlacements(value.placements, preset, image) } : {}) }
}

/** Reject results from another image, revision, or analysis coordinate system. */
export function sameSnapshot(a: AnalysisSnapshot, b: AnalysisSnapshot): boolean {
  return a.documentId === b.documentId && a.revision === b.revision && a.sha256 === b.sha256
    && a.width === b.width && a.height === b.height
}

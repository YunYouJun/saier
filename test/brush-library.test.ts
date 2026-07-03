import type { BrushPreset } from '@saier/core'
import { describe, expect, it } from 'vitest'
import {
  createBrushLibraryFile,
  encodedByteLength,
  mergeBrushPresets,
  parseBrushLibraryText,
  SAIER_BRUSH_LIBRARY_FORMAT,
  SAIER_BRUSH_LIBRARY_MAX_BYTES,
  SAIER_BRUSH_LIBRARY_VERSION,
  serializeBrushLibraryFile,
} from '../site/app/utils/brushLibrary'

const PEN: BrushPreset = {
  id: 'pen',
  name: 'Pen',
  source: 'builtin',
  engine: 'simple',
  tipId: 'round-hard',
  size: 10,
  opacity: 1,
  spacing: 0.22,
  hardness: 0,
}

const CUSTOM_WASH: BrushPreset = {
  id: 'custom-wash',
  name: 'Wash',
  group: 'Custom',
  source: 'custom',
  custom: true,
  engine: 'smudge',
  tipId: 'round-soft',
  size: 32,
  opacity: 0.6,
  spacing: 0.2,
  hardness: 0.7,
  smudge: 0.5,
  density: 0.4,
}

const MYPAINT_WASH: BrushPreset = {
  ...CUSTOM_WASH,
  id: 'custom-myb-wash',
  name: 'MyPaint Wash',
  source: 'mypaint',
}

describe('saier brush library file', () => {
  it('serializes and parses v1 brush libraries', () => {
    const library = createBrushLibraryFile([PEN, CUSTOM_WASH, MYPAINT_WASH], 1234)
    const parsed = parseBrushLibraryText(serializeBrushLibraryFile(library))

    expect(parsed).toMatchObject({
      format: SAIER_BRUSH_LIBRARY_FORMAT,
      version: SAIER_BRUSH_LIBRARY_VERSION,
      updatedAt: 1234,
    })
    expect(parsed?.presets.map(preset => preset.id)).toEqual([
      'custom-wash',
      'custom-myb-wash',
    ])
    expect(parsed?.presets.every(preset => preset.custom)).toBe(true)
  })

  it('rejects invalid, oversized, and builtin-only payloads', () => {
    expect(parseBrushLibraryText(JSON.stringify({
      format: 'wrong',
      version: SAIER_BRUSH_LIBRARY_VERSION,
      updatedAt: 1,
      presets: [CUSTOM_WASH],
    }))).toBeUndefined()

    expect(parseBrushLibraryText(JSON.stringify({
      format: SAIER_BRUSH_LIBRARY_FORMAT,
      version: SAIER_BRUSH_LIBRARY_VERSION,
      updatedAt: 1,
      presets: [PEN],
    }))).toBeUndefined()

    const oversized = JSON.stringify({
      format: SAIER_BRUSH_LIBRARY_FORMAT,
      version: SAIER_BRUSH_LIBRARY_VERSION,
      updatedAt: 1,
      presets: [{
        ...CUSTOM_WASH,
        tags: ['x'.repeat(SAIER_BRUSH_LIBRARY_MAX_BYTES)],
      }],
    })
    expect(encodedByteLength(oversized)).toBeGreaterThan(SAIER_BRUSH_LIBRARY_MAX_BYTES)
    expect(parseBrushLibraryText(oversized)).toBeUndefined()
  })

  it('allows empty libraries so deleting the last custom brush can sync', () => {
    const parsed = parseBrushLibraryText(serializeBrushLibraryFile(createBrushLibraryFile([], 4321)))

    expect(parsed).toMatchObject({
      format: SAIER_BRUSH_LIBRARY_FORMAT,
      presets: [],
      updatedAt: 4321,
    })
  })

  it('merges local and cloud presets without losing same-id conflicts', () => {
    const cloud = [
      CUSTOM_WASH,
      {
        ...MYPAINT_WASH,
        id: 'same-id',
        name: 'Cloud Same',
        size: 18,
      },
    ] satisfies BrushPreset[]
    const local = [
      CUSTOM_WASH,
      {
        ...MYPAINT_WASH,
        id: 'same-id',
        name: 'Local Same',
        size: 44,
      },
      {
        ...MYPAINT_WASH,
        id: 'local-only',
        name: 'Local Only',
      },
    ] satisfies BrushPreset[]

    const result = mergeBrushPresets(cloud, local)

    expect(result.changed).toBe(true)
    expect(result.presets.map(preset => preset.id)).toEqual([
      'custom-wash',
      'same-id',
      'same-id-local',
      'local-only',
    ])
    expect(result.presets.find(preset => preset.id === 'same-id')?.name).toBe('Cloud Same')
    expect(result.presets.find(preset => preset.id === 'same-id-local')).toMatchObject({
      name: 'Local Same (local)',
      size: 44,
    })
  })
})

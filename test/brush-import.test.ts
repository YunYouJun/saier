import { describe, expect, it } from 'vitest'
import {
  BrushPresetImportError,
  parseBrushPresetImportText,
} from '../site/app/utils/brushImport'

describe('site brush preset import', () => {
  it('imports MyPaint .myb JSON into a syncable custom preset', () => {
    const imported = parseBrushPresetImportText(JSON.stringify({
      parent_brush_name: 'Soft Wash',
      group: 'MyPaint',
      settings: {
        radius_logarithmic: { base_value: Math.log(20) },
        opaque: { base_value: 0.5 },
        hardness: { base_value: 0.25 },
        dabs_per_actual_radius: { base_value: 5 },
        smudge: { base_value: 0.4 },
      },
    }), {
      existingIds: ['mypaint-soft-wash'],
      fileName: 'soft-wash.myb',
    })

    expect(imported.format).toBe('mypaint')
    expect(imported.preset).toMatchObject({
      id: 'mypaint-soft-wash-2',
      name: 'Soft Wash',
      group: 'MyPaint',
      source: 'mypaint',
      custom: true,
      engine: 'smudge',
      size: 40,
      opacity: 0.5,
      smudge: 0.4,
      tags: ['mypaint', 'imported'],
    })
  })

  it('imports legacy MyPaint line presets', () => {
    const imported = parseBrushPresetImportText(`
# Legacy Pencil
radius_logarithmic 2.302585
opaque 0.45
hardness 0.6
dabs_per_actual_radius 4
`, {
      fileName: 'legacy.myb',
    })

    expect(imported.preset).toMatchObject({
      id: 'mypaint-legacy-pencil',
      name: 'Legacy Pencil',
      source: 'mypaint',
      custom: true,
      size: 20,
      opacity: 0.45,
    })
  })

  it('rejects empty, unsupported, malformed MyPaint, and SAI preset files', () => {
    expectImportReason(() => parseBrushPresetImportText('', { fileName: 'empty.myb' }), 'empty_file')
    expectImportReason(() => parseBrushPresetImportText('{"format":"saier.project"}', { fileName: 'project.json' }), 'unsupported_format')
    expectImportReason(() => parseBrushPresetImportText('not a brush', { fileName: 'broken.myb' }), 'invalid_mypaint')
    expectImportReason(() => parseBrushPresetImportText('brush preset data', { fileName: 'brush.sai2tool' }), 'unsupported_sai')
  })
})

function expectImportReason(action: () => unknown, reason: BrushPresetImportError['reason']): void {
  try {
    action()
  }
  catch (error) {
    expect(error).toBeInstanceOf(BrushPresetImportError)
    expect((error as BrushPresetImportError).reason).toBe(reason)
    return
  }

  throw new Error(`expected import error reason ${reason}`)
}

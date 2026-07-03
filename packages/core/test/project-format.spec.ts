import type { SaierProjectFile } from '../src'
import { describe, expect, it } from 'vitest'
import {
  createLayerTransform,
  deserializeSaierProject,
  Document,
  serializeSaierProject,
  TiledSurface,
} from '../src'

function pixel(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values)
}

describe('saier project format', () => {
  it('round-trips document metadata, layer attributes, masks, and sparse tile pixels', () => {
    const document = new Document({ width: 16, height: 16 })
    document.addLayer({ id: 'paper', label: 'Paper' })
    document.addGroup({ id: 'inks', label: 'Inks', collapsed: true })
    document.addLayer({
      id: 'ink',
      label: 'Ink',
      visible: false,
      opacity: 0.5,
      blendMode: 'multiply',
      lockAlpha: true,
      clip: true,
      parentId: 'inks',
      transform: createLayerTransform({ x: 4, y: 5, scaleX: 2 }),
    })
    document.attachMask('ink', 'ink-mask')
    document.setMaskEnabled('ink', false)
    document.setActive('paper')

    const paper = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const ink = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    const mask = new TiledSurface({ width: 16, height: 16, tileSize: 8 })
    paper.writeRegion({ x: 1, y: 1, width: 1, height: 1 }, pixel([255, 0, 0, 255]))
    ink.writeRegion({ x: 10, y: 2, width: 1, height: 1 }, pixel([0, 0, 128, 128]))
    mask.writeRegion({ x: 10, y: 2, width: 1, height: 1 }, pixel([255, 255, 255, 255]))

    const sourceSurfaces = new Map([
      ['paper', paper],
      ['ink', ink],
      ['ink-mask', mask],
    ])
    const file = serializeSaierProject({
      document,
      resolveSurface: id => sourceSurfaces.get(id),
      metadata: { name: 'Roundtrip' },
    })

    expect(file).toMatchObject({
      format: 'saier.project',
      version: 2,
      width: 16,
      height: 16,
      tileSize: 8,
      activeLayerId: 'paper',
      metadata: { name: 'Roundtrip' },
    })
    expect(file.layerTree).toEqual([
      expect.objectContaining({ type: 'raster', id: 'paper', label: 'Paper' }),
      expect.objectContaining({
        type: 'group',
        id: 'inks',
        label: 'Inks',
        collapsed: true,
        children: [expect.objectContaining({ type: 'raster', id: 'ink' })],
      }),
    ])
    expect(file.layers).toEqual([
      expect.objectContaining({ id: 'paper', label: 'Paper' }),
      expect.objectContaining({
        id: 'ink',
        label: 'Ink',
        visible: false,
        opacity: 0.5,
        blendMode: 'multiply',
        lockAlpha: true,
        clip: true,
        mask: { id: 'ink-mask', enabled: false },
      }),
    ])
    expect(file.surfaces.map(surface => [surface.id, surface.tiles.length])).toEqual([
      ['paper', 1],
      ['ink', 1],
      ['ink-mask', 1],
    ])

    const restored = deserializeSaierProject(file)
    expect(restored.metadata).toEqual({ name: 'Roundtrip' })
    expect(restored.document.activeLayerId).toBe('paper')
    expect(restored.document.layerTree).toEqual([
      expect.objectContaining({ type: 'raster', id: 'paper', label: 'Paper' }),
      expect.objectContaining({
        type: 'group',
        id: 'inks',
        label: 'Inks',
        collapsed: true,
        children: [expect.objectContaining({ type: 'raster', id: 'ink' })],
      }),
    ])
    expect(restored.document.layers).toEqual([
      expect.objectContaining({ id: 'paper', label: 'Paper' }),
      expect.objectContaining({
        id: 'ink',
        label: 'Ink',
        visible: false,
        opacity: 0.5,
        blendMode: 'multiply',
        lockAlpha: true,
        clip: true,
        transform: expect.objectContaining({ x: 4, y: 5, scaleX: 2 }),
        mask: { id: 'ink-mask', enabled: false },
      }),
    ])
    expect(restored.surfaces.get('paper')?.readRegion({ x: 1, y: 1, width: 1, height: 1 }))
      .toEqual(pixel([255, 0, 0, 255]))
    expect(restored.surfaces.get('ink')?.readRegion({ x: 10, y: 2, width: 1, height: 1 }))
      .toEqual(pixel([0, 0, 128, 128]))
    expect(restored.surfaces.get('ink-mask')?.readRegion({ x: 10, y: 2, width: 1, height: 1 }))
      .toEqual(pixel([255, 255, 255, 255]))
  })

  it('reads v1 flat project files as top-level raster layers', () => {
    const project: SaierProjectFile = {
      format: 'saier.project',
      version: 1,
      width: 8,
      height: 8,
      tileSize: 8,
      activeLayerId: 'ink',
      layers: [
        {
          id: 'paper',
          label: 'Paper',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          lockAlpha: false,
          clip: false,
        },
        {
          id: 'ink',
          label: 'Ink',
          visible: true,
          opacity: 1,
          blendMode: 'normal',
          lockAlpha: false,
          clip: false,
        },
      ],
      surfaces: [],
    }

    const restored = deserializeSaierProject(project)

    expect(restored.document.activeLayerId).toBe('ink')
    expect(restored.document.layerTree).toEqual([
      expect.objectContaining({ type: 'raster', id: 'paper' }),
      expect.objectContaining({ type: 'raster', id: 'ink' }),
    ])
    expect(restored.surfaces.has('paper')).toBe(true)
    expect(restored.surfaces.has('ink')).toBe(true)
  })

  it('fails loudly when a layer surface is missing during serialization', () => {
    const document = new Document({ width: 8, height: 8 })
    document.addLayer({ id: 'ink' })

    expect(() => serializeSaierProject({
      document,
      resolveSurface: () => undefined,
    })).toThrow('missing surface "ink"')
  })
})

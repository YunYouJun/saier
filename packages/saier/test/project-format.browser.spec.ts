import type { Painter } from '../src'
import { Document, serializeSaierProject, TiledSurface } from '@saier/core'
import { PixiTileTextureBackend } from '@saier/pixi'
import { afterEach, describe, expect, it } from 'vitest'
import { createPainter, PainterBrush, PainterEraser } from '../src'

const painters: Painter[] = []

afterEach(() => {
  for (const painter of painters.splice(0))
    painter.destroy()
  PainterBrush.enabled = true
  PainterBrush.color = 0x000000
  PainterBrush.size = 10
  PainterBrush.presetId = 'pen'
  PainterBrush.enablePressure = true
  PainterBrush.stabilizerStrength = 1
  PainterEraser.enabled = true
  PainterEraser.size = 10
})

async function createFixture(): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    backend: 'tiled',
    view: canvas,
    size: { width: 64, height: 64 },
    boardSize: { width: 32, height: 32 },
    pixiOptions: { backgroundAlpha: 0 },
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function backend(painter: Painter): PixiTileTextureBackend {
  if (!(painter.surface instanceof PixiTileTextureBackend))
    throw new Error('expected tiled backend')
  return painter.surface
}

function pixel(values: number[]): Uint8ClampedArray {
  return new Uint8ClampedArray(values)
}

function readPixel(painter: Painter, layerId: string, x: number, y: number): Uint8ClampedArray {
  return backend(painter).getSurface(layerId).readRegion({ x, y, width: 1, height: 1 })
}

describe('saier project save/load (P8)', () => {
  it('exports the active tiled document and imports it as a new document', async () => {
    const painter = await createFixture()
    const paperId = painter.document.activeLayerId
    if (!paperId)
      throw new Error('missing default layer')

    painter.controller.layer.setLabel(paperId, 'Paper')
    backend(painter).getSurface(paperId).writeRegion({ x: 3, y: 4, width: 1, height: 1 }, pixel([255, 0, 0, 255]))

    painter.controller.layer.add({
      id: 'ink',
      label: 'Ink',
      opacity: 0.5,
      blendMode: 'multiply',
      clip: true,
    })
    backend(painter).getSurface('ink').writeRegion({ x: 12, y: 5, width: 1, height: 1 }, pixel([0, 0, 160, 200]))
    painter.controller.layer.addMask('ink', 'ink-mask')
    backend(painter).getSurface('ink-mask').clear()
    backend(painter).getSurface('ink-mask').writeRegion({ x: 12, y: 5, width: 1, height: 1 }, pixel([255, 255, 255, 255]))
    painter.flushSurfaceUploads()

    const project = painter.exportProject({ metadata: { name: 'Saved File' } })
    expect(project).toMatchObject({
      format: 'saier.project',
      version: 1,
      width: 32,
      height: 32,
      metadata: { name: 'Saved File' },
      layers: [
        expect.objectContaining({ id: paperId, label: 'Paper' }),
        expect.objectContaining({
          id: 'ink',
          label: 'Ink',
          opacity: 0.5,
          blendMode: 'multiply',
          clip: true,
          mask: { id: 'ink-mask', enabled: true },
        }),
      ],
    })

    const imported = painter.importProject(project, { id: 'loaded' })
    expect(imported).toMatchObject({
      id: 'loaded',
      name: 'Saved File',
      width: 32,
      height: 32,
      active: true,
    })
    expect(painter.getDocuments()).toHaveLength(2)
    expect(painter.getActiveDocumentId()).toBe('loaded')
    expect(painter.document.layers).toEqual([
      expect.objectContaining({ id: paperId, label: 'Paper' }),
      expect.objectContaining({
        id: 'ink',
        label: 'Ink',
        opacity: 0.5,
        blendMode: 'multiply',
        clip: true,
        mask: { id: 'ink-mask', enabled: true },
      }),
    ])
    expect(readPixel(painter, paperId, 3, 4)).toEqual(pixel([255, 0, 0, 255]))
    expect(readPixel(painter, 'ink', 12, 5)).toEqual(pixel([0, 0, 160, 200]))
    expect(readPixel(painter, 'ink-mask', 12, 5)).toEqual(pixel([255, 255, 255, 255]))
  })

  it('reports unsupported project export on the RenderTexture backend', async () => {
    const canvas = document.createElement('canvas')
    const painter = createPainter({
      backend: 'rendertexture',
      view: canvas,
      size: { width: 64, height: 64 },
      boardSize: { width: 32, height: 32 },
      pixiOptions: { backgroundAlpha: 0 },
    })
    await painter.init()
    painters.push(painter)

    expect(() => painter.exportProject()).toThrow('requires the tiled backend')
  })

  it('imports project pixels when the saved tile size differs from the active backend', async () => {
    const painter = await createFixture()
    const document = new Document({ width: 32, height: 32 })
    document.addLayer({ id: 'small-tiles', label: 'Small tiles' })

    const savedSurface = new TiledSurface({ width: 32, height: 32, tileSize: 8 })
    savedSurface.writeRegion({ x: 9, y: 10, width: 1, height: 1 }, pixel([32, 64, 128, 255]))
    const project = serializeSaierProject({
      document,
      resolveSurface: id => id === 'small-tiles' ? savedSurface : undefined,
      metadata: { name: 'Small Tiles' },
    })

    painter.importProject(project, { id: 'small-tile-import' })

    expect(backend(painter).tileSize).not.toBe(project.tileSize)
    expect(readPixel(painter, 'small-tiles', 9, 10)).toEqual(pixel([32, 64, 128, 255]))
  })
})

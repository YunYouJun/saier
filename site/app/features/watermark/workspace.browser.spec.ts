import type { WatermarkWorkInput } from './workfile'
import { createPainter } from 'saier'
import { afterEach, expect, it } from 'vitest'
import { compositePreset } from './preset'
import { readWatermarkWorkfile, serializeWatermarkWorkfile } from './workfile'
import { WatermarkWorkspace } from './workspace'

const workspaces: WatermarkWorkspace[] = []
afterEach(() => workspaces.splice(0).forEach(workspace => workspace.destroy()))

function canvas(width: number, height: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')!.fillStyle = color
  canvas.getContext('2d')!.fillRect(0, 0, width, height)
  return canvas
}

function fixture(): WatermarkWorkInput {
  const artwork = canvas(320, 240, '#eeeeee')
  artwork.getContext('2d')!.fillStyle = '#446688'
  artwork.getContext('2d')!.fillRect(80, 60, 160, 120)
  const mark = canvas(60, 20, '#cc99ff80')
  const tile = canvas(4, 4, '#bbbbbb80')
  return {
    artwork,
    preset: { name: 'workspace-test', rules: '', assets: [
      { id: 'ribbon', role: 'horizontal-ribbon', width: 60, height: 20, recolorable: true, enabled: true, backdropBlur: 0.013, image: mark, source: mark.toDataURL() },
      { id: 'tile', role: 'repeated-watermark', width: 4, height: 4, recolorable: false, enabled: true, blendMode: 'linear-light', image: tile, source: tile.toDataURL() },
    ] },
    placements: [
      { assetId: 'ribbon', x: 0.2, y: 0.6, width: 0.6, rotation: 0, opacity: 0.8, color: '#304050' },
      { assetId: 'tile', x: 0, y: 0, width: 0.1, rotation: 0, opacity: 0.5, color: '' },
    ],
    regions: [{ label: 'face', x: 0.4, y: 0.2, width: 0.2, height: 0.2 }],
  }
}

it('edits native Saier transforms with undo, preserves PSD composition, and exports at source resolution', async () => {
  const input = fixture()
  const view = document.createElement('canvas')
  view.style.width = '600px'
  view.style.height = '400px'
  document.body.append(view)
  const workspace = new WatermarkWorkspace(view, input, () => {}, (error) => {
    throw error
  })
  workspaces.push(workspace)
  try {
    await workspace.init()
    const initial = compositePreset(input.artwork, input.preset, input.placements, input.regions).toDataURL()
    expect(workspace.painter.document.layers).toHaveLength(3)
    expect(workspace.exportCanvas().toDataURL()).toBe(initial)
    const ribbon = workspace.getState().layers[0]!
    workspace.select(ribbon.id)
    expect(workspace.painter.getTransformSelection()?.width).toBeCloseTo(192)
    workspace.update(ribbon.id, { width: 0.42, color: '#884433', rotation: 15 })
    expect(workspace.getPlacements()[0]!.width).toBeCloseTo(0.42)
    expect(workspace.exportCanvas().toDataURL()).not.toBe(initial)
    workspace.undo()
    expect(workspace.exportCanvas().toDataURL()).toBe(initial)
    workspace.redo()
    expect(workspace.getPlacements()[0]!.color).toBe('#884433')
    workspace.undo()
    workspace.select(ribbon.id)
    workspace.painter.nudgeTransformSelection(12, -6)
    workspace.finishTransform()
    expect(workspace.getPlacements()[0]!.x).toBeCloseTo(0.2 + 12 / 320)
    workspace.undo()
    expect(workspace.exportCanvas().toDataURL()).toBe(initial)
    workspace.zoom(2)
    const output = workspace.exportCanvas()
    expect([output.width, output.height]).toEqual([320, 240])
    expect(output.toDataURL()).toBe(initial)
    const sourcePixels = input.artwork.getContext('2d')!.getImageData(130, 50, 50, 30).data
    expect(output.getContext('2d')!.getImageData(130, 50, 50, 30).data).toEqual(sourcePixels)
    expect(() => workspace.update(ribbon.id, { opacity: 2 })).toThrow()
    expect(workspace.exportCanvas().toDataURL()).toBe(initial)
  }
  finally {
    view.remove()
  }
})

it('round-trips all source assets, effects, placements and protected regions without external requests', async () => {
  const input = fixture()
  const saved = serializeWatermarkWorkfile(input)
  const restored = await readWatermarkWorkfile(new File([saved], 'workspace.json'))
  expect(restored.placements).toEqual(input.placements)
  expect(restored.regions).toEqual(input.regions)
  expect(compositePreset(restored.artwork, restored.preset, restored.placements, restored.regions).toDataURL()).toEqual(compositePreset(input.artwork, input.preset, input.placements, input.regions).toDataURL())
  const invalid = JSON.parse(saved)
  invalid.artwork = 'https://example.com/private.png'
  await expect(readWatermarkWorkfile(new File([JSON.stringify(invalid)], 'bad.json'))).rejects.toThrow()
})

it('shares the main Painter across document tabs without flattening or destroying other documents', async () => {
  const view = document.createElement('canvas')
  view.style.width = '600px'
  view.style.height = '400px'
  document.body.append(view)
  const painter = createPainter({ view, boardSize: { width: 320, height: 240 }, imageDrop: false })
  await painter.init()
  painter.keyboard.destroy()
  const drawing = painter.getActiveDocumentId()
  const originalDocument = painter.document
  const originalExport = JSON.stringify(painter.exportProject())
  const first = new WatermarkWorkspace(view, fixture(), () => {}, (error) => {
    throw error
  }, painter)
  const second = new WatermarkWorkspace(view, fixture(), () => {}, (error) => {
    throw error
  }, painter)
  try {
    await first.init()
    expect(first.ownsPainter).toBe(false)
    const initial = first.exportCanvas().toDataURL()
    first.update(first.getState().layers[0]!.id, { color: '#113355', width: 0.42 })
    const edited = first.exportCanvas().toDataURL()
    await second.init()
    expect(painter.getDocuments()).toHaveLength(3)
    expect(second.exportCanvas().toDataURL()).toBe(initial)
    // Exporting an inactive adapter must still read its own document geometry.
    expect(first.exportCanvas().toDataURL()).toBe(edited)
    painter.switchDocument(drawing)
    expect(painter.document).toBe(originalDocument)
    expect(JSON.stringify(painter.exportProject())).toBe(originalExport)
    painter.switchDocument(first.documentId)
    first.resume()
    expect(first.exportCanvas().toDataURL()).toBe(edited)
    first.undo()
    expect(first.exportCanvas().toDataURL()).toBe(initial)
    painter.switchDocument(second.documentId)
    second.resume()
    first.destroy()
    painter.closeDocument(first.documentId)
    expect(second.exportCanvas().toDataURL()).toBe(initial)
    second.destroy()
    painter.closeDocument(second.documentId)
    expect(painter.getActiveDocumentId()).toBe(drawing)
    expect(JSON.stringify(painter.exportProject())).toBe(originalExport)
  }
  finally {
    first.destroy()
    second.destroy()
    painter.destroy()
    view.remove()
  }
})

import type { BrushPreset, StrokePatch } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { Document, PainterController, UndoManager } from '../src'

const PATCH: StrokePatch = {
  layerId: 'layer-1',
  rect: { x: 0, y: 0, width: 1, height: 1 },
  before: new Uint8Array([0]),
  after: new Uint8Array([1]),
}

const PEN_PRESET: BrushPreset = {
  id: 'pen',
  name: 'Pen',
  engine: 'simple',
  tipId: 'round-hard',
  size: 10,
  opacity: 1,
  spacing: 0.22,
  hardness: 0,
}

describe('painterController', () => {
  it('updates brush size and emits brush:change', () => {
    const document = new Document({ width: 100, height: 100 })
    const controller = new PainterController({ document })
    const spy = vi.fn()
    controller.on('brush:change', spy)

    controller.brush.setSize(24)

    expect(controller.getState().brush.size).toBe(24)
    expect(spy).toHaveBeenCalledOnce()
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({
      presetId: 'pen',
      size: 24,
      color: { r: 0, g: 0, b: 0, a: 1 },
      opacity: 1,
    }))
  })

  it('updates brush preset and adjustable parameters through the controller surface', () => {
    const document = new Document({ width: 100, height: 100 })
    const controller = new PainterController({ document })
    const spy = vi.fn()
    controller.on('brush:change', spy)

    controller.brush.setPreset('airbrush')
    controller.brush.setSpacing(0.4)
    controller.brush.setHardness(0.75)
    controller.brush.setFlow(42)
    controller.brush.setOpacity(0.5)

    expect(controller.getState().brush).toMatchObject({
      presetId: 'airbrush',
      spacing: 0.4,
      hardness: 0.75,
      flow: 42,
      opacity: 0.5,
    })
    expect(controller.getState().brush.presets.map(preset => preset.id))
      .toEqual(['pen', 'pencil', 'marker', 'airbrush', 'calligraphy', 'smudge', 'blender', 'watercolor'])
    expect(spy).toHaveBeenCalled()
  })

  it('normalizes P7 brush parameters from presets', () => {
    const document = new Document({ width: 100, height: 100 })
    const controller = new PainterController({
      document,
      brushPresets: [
        PEN_PRESET,
        {
          id: 'wet-mix',
          name: 'Wet Mix',
          engine: 'smudge',
          tipId: 'round-soft',
          size: 18,
          opacity: 1,
          spacing: 0.25,
          hardness: 0.35,
          smudge: 1.4,
          colorAmount: -0.5,
          dilution: 0.45,
          persistence: 2,
          wetEdge: 0.6,
          density: -0.2,
          paperTextureId: 'cold-press',
          paperTextureStrength: 1.5,
        },
      ],
    })

    controller.brush.setPreset('wet-mix')

    expect(controller.getState().brush).toMatchObject({
      presetId: 'wet-mix',
      smudge: 1,
      colorAmount: 0,
      dilution: 0.45,
      persistence: 1,
      wetEdge: 0.6,
      density: 0,
      paperTextureId: 'cold-press',
      paperTextureStrength: 1,
    })
  })

  it('creates and removes custom brush presets from the current brush state', () => {
    const document = new Document({ width: 100, height: 100 })
    const controller = new PainterController({ document })

    controller.brush.setPreset('watercolor')
    controller.brush.setSize(42)
    controller.brush.setOpacity(0.62)
    controller.brush.setSpacing(0.33)
    controller.brush.setDensity(0.44)

    const custom = controller.brush.createCustomPreset({
      name: 'Line Wash',
      group: 'Custom',
      select: true,
    })

    expect(custom).toMatchObject({
      id: 'custom-line-wash',
      name: 'Line Wash',
      group: 'Custom',
      source: 'custom',
      custom: true,
      engine: 'smudge',
      size: 42,
      opacity: 0.62,
      spacing: 0.33,
      density: 0.44,
    })
    expect(controller.getState().brush).toMatchObject({
      presetId: 'custom-line-wash',
      size: 42,
      opacity: 0.62,
    })
    expect(controller.getState().brush.presets.find(preset => preset.id === custom.id))
      .toMatchObject({ custom: true, group: 'Custom' })

    expect(controller.brush.removePreset(custom.id)).toBe(true)
    expect(controller.getState().brush.presetId).toBe('pen')
    expect(controller.getState().brush.presets.some(preset => preset.id === custom.id)).toBe(false)
  })

  it('updates P7 brush parameters and emits brush:change snapshots', () => {
    const document = new Document({ width: 100, height: 100 })
    const controller = new PainterController({
      document,
      brush: {
        smudge: -1,
        colorAmount: 2,
        dilution: 0.25,
        persistence: 0.5,
        wetEdge: 2,
        density: -0.5,
        paperTextureId: 'warm-press',
        paperTextureStrength: 1.5,
      },
    })
    const spy = vi.fn()
    controller.on('brush:change', spy)

    expect(controller.getState().brush).toMatchObject({
      smudge: 0,
      colorAmount: 1,
      dilution: 0.25,
      persistence: 0.5,
      wetEdge: 1,
      density: 0,
      paperTextureId: 'warm-press',
      paperTextureStrength: 1,
    })

    controller.brush.setSmudge(0.2)
    controller.brush.setColorAmount(0.8)
    controller.brush.setDilution(1.5)
    controller.brush.setPersistence(-0.5)
    controller.brush.setWetEdge(0.6)
    controller.brush.setDensity(2)
    controller.brush.setPaperTextureId('cold-press')
    controller.brush.setPaperTextureStrength(-0.5)

    expect(controller.getState().brush).toMatchObject({
      smudge: 0.2,
      colorAmount: 0.8,
      dilution: 1,
      persistence: 0,
      wetEdge: 0.6,
      density: 1,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0,
    })
    expect(spy).toHaveBeenCalledTimes(8)
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({
      smudge: 0.2,
      colorAmount: 0.8,
      dilution: 1,
      persistence: 0,
      wetEdge: 0.6,
      density: 1,
      paperTextureId: 'cold-press',
      paperTextureStrength: 0,
    }))
  })

  it('returns defensive snapshots for brush and layer state', () => {
    const document = new Document({ width: 100, height: 100 })
    document.addLayer({ id: 'ink', label: 'Ink' })
    const controller = new PainterController({ document })

    const state = controller.getState()
    state.brush.color.r = 1
    state.brush.smudge = 1
    state.brush.paperTextureId = 'mutated-paper'
    state.brush.paperTextureStrength = 1
    state.brush.presets[0].name = 'Mutated'
    state.layers[0].label = 'Mutated'

    expect(controller.getState().brush.color.r).toBe(0)
    expect(controller.getState().brush.smudge).toBe(0)
    expect(controller.getState().brush.paperTextureId).toBeUndefined()
    expect(controller.getState().brush.paperTextureStrength).toBe(0)
    expect(controller.getState().brush.presets[0].name).toBe('Pen')
    expect(controller.getState().layers[0].label).toBe('Ink')
  })

  it('emits tool and layer changes from core setters', () => {
    const document = new Document({ width: 100, height: 100 })
    const first = document.addLayer({ id: 'first' })
    document.addLayer({ id: 'second' })
    const controller = new PainterController({ document })
    const toolSpy = vi.fn()
    const layersSpy = vi.fn()
    controller.on('tool:change', toolSpy)
    controller.on('layers:change', layersSpy)

    controller.setTool('eraser')
    controller.setActiveLayer(first.id)

    expect(controller.getState()).toMatchObject({
      tool: 'eraser',
      activeLayerId: 'first',
    })
    expect(toolSpy).toHaveBeenCalledWith('eraser')
    expect(layersSpy).toHaveBeenCalledWith({
      activeLayerId: 'first',
      layers: expect.arrayContaining([
        expect.objectContaining({ id: 'first' }),
        expect.objectContaining({ id: 'second' }),
      ]),
    })
  })

  it('updates layer stack through the controller surface', () => {
    const document = new Document({ width: 100, height: 100 })
    const controller = new PainterController({ document })
    const layersSpy = vi.fn()
    controller.on('layers:change', layersSpy)

    const paper = controller.layer.add({ id: 'paper', label: 'Paper' })
    const ink = controller.layer.add({ id: 'ink', label: 'Ink', opacity: 1.5 })
    controller.layer.setOpacity(ink.id, 0.35)
    controller.layer.setVisible(ink.id, false)
    controller.layer.setBlendMode(ink.id, 'multiply')
    controller.layer.setLabel(ink.id, 'Ink 1')
    controller.layer.move(ink.id, 0)
    controller.layer.setActive(paper.id)
    controller.layer.remove(paper.id)

    expect(controller.getState()).toMatchObject({
      activeLayerId: 'ink',
      layers: [
        {
          id: 'ink',
          label: 'Ink 1',
          visible: false,
          opacity: 0.35,
          blendMode: 'multiply',
        },
      ],
    })
    expect(ink.opacity).toBe(1)
    expect(layersSpy).toHaveBeenCalled()
  })

  it('mirrors history changes from UndoManager', () => {
    const document = new Document({ width: 100, height: 100 })
    const history = new UndoManager()
    const controller = new PainterController({ document, history })
    const spy = vi.fn()
    controller.on('history:change', spy)

    history.record(PATCH)

    expect(controller.getState().history).toEqual({ canUndo: true, canRedo: false })
    expect(spy).toHaveBeenCalledWith({ canUndo: true, canRedo: false })
  })

  it('stops forwarding document and history events after dispose', () => {
    const document = new Document({ width: 100, height: 100 })
    const history = new UndoManager()
    const controller = new PainterController({ document, history })
    const layersSpy = vi.fn()
    const historySpy = vi.fn()
    controller.on('layers:change', layersSpy)
    controller.on('history:change', historySpy)

    controller.dispose()
    document.addLayer({ id: 'ink' })
    history.record(PATCH)

    expect(layersSpy).not.toHaveBeenCalled()
    expect(historySpy).not.toHaveBeenCalled()
  })
})

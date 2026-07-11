import type { FederatedPointerEvent } from 'pixi.js'
import type { Painter } from '../src'
import { Point, Rectangle } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'
import { createPainter } from '../src'
import { EditableLayer } from '../src/layers'

const painters: Painter[] = []

afterEach(() => {
  for (const painter of painters.splice(0))
    painter.destroy()
})

async function createFixture(
  boardSize: { width: number, height: number },
  backend: 'tiled' | 'rendertexture' = 'tiled',
): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    view: canvas,
    backend,
    size: { width: 320, height: 240 },
    boardSize,
    pixiOptions: { backgroundAlpha: 0 },
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function imageDataUrl(width: number, height: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('missing 2d context')
  context.fillStyle = '#e8402e'
  context.fillRect(0, 0, width, height)
  return canvas.toDataURL('image/png')
}

function importedLayers(painter: Painter): EditableLayer[] {
  return painter.boundingBoxes.children.flatMap(session =>
    session.children.filter(child => child instanceof EditableLayer) as EditableLayer[],
  )
}

function importedLayer(painter: Painter): EditableLayer {
  const layer = importedLayers(painter).at(-1)
  if (!layer)
    throw new Error('missing imported image transform overlay')
  return layer
}

function pointerEvent(global: Point, options: { shiftKey?: boolean } = {}): FederatedPointerEvent {
  return {
    global,
    shiftKey: options.shiftKey ?? false,
    stopPropagation: () => {},
  } as unknown as FederatedPointerEvent
}

function expectPointClose(actual: Point, expected: Point): void {
  expect(actual.x).toBeCloseTo(expected.x, 4)
  expect(actual.y).toBeCloseTo(expected.y, 4)
}

describe('imported image transforms', () => {
  it.each(['tiled', 'rendertexture'] as const)('imports fitted pixels into a real %s raster layer', async (backend) => {
    const painter = await createFixture({ width: 100, height: 50 }, backend)
    await painter.loadImage(imageDataUrl(200, 100))

    const state = painter.controller.getState()
    expect(state.layers).toHaveLength(2)
    expect(state.layers.at(-1)?.label).toMatch(/^Image /)
    expect(state.activeLayerId).toBe(state.layers.at(-1)?.id)

    const overlay = importedLayer(painter)
    const bounds = overlay.getLocalBounds()
    expect(bounds.width).toBeCloseTo(100, 4)
    expect(bounds.height).toBeCloseTo(50, 4)

    const pixels = painter.surface.readRegion?.(state.activeLayerId!, { x: 0, y: 0, width: 100, height: 50 })
    expect(pixels).toBeDefined()
    expect(pixels!.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
  })

  it('shows controls only for the active transformable layer', async () => {
    const painter = await createFixture({ width: 160, height: 120 })
    await painter.loadImage(imageDataUrl(80, 40))
    const firstId = painter.document.activeLayerId!
    await painter.loadImage(imageDataUrl(60, 60))
    const [first, second] = importedLayers(painter)

    expect(first?.visible).toBe(false)
    expect(second?.visible).toBe(true)

    painter.controller.layer.setActive(firstId)
    expect(first?.visible).toBe(true)
    expect(first?.boundingBoxContainer.visible).toBe(true)
    expect(second?.visible).toBe(false)
  })

  it('scales a rotated image in document space while keeping the opposite edge fixed', async () => {
    const painter = await createFixture({ width: 100, height: 50 })
    await painter.loadImage(imageDataUrl(100, 50))
    const layer = importedLayer(painter)
    painter.setTransformSelectionValues({ rotation: 90 })
    painter.zoomViewportAt({ x: 160, y: 120 }, 2)

    const fixedBefore = layer.toGlobal(new Point(-50, 0))
    const handle = layer.controlPoints.RIGHT_CENTER
    const start = handle.getGlobalPosition()
    const end = new Point(start.x, start.y + 40)

    handle.emit('pointerdown', pointerEvent(start))
    painter.app.stage.emit('pointermove', pointerEvent(end))
    painter.app.stage.emit('pointerup', pointerEvent(end))

    expect(layer.scale.x).toBeCloseTo(1.2, 4)
    expect(layer.scale.y).toBeCloseTo(1, 4)
    expectPointClose(layer.toGlobal(new Point(-50, 0)), fixedBefore)
    expectPointClose(handle.getGlobalPosition(), end)
  })

  it('preserves aspect ratio from a corner and keeps the opposite corner fixed', async () => {
    const painter = await createFixture({ width: 100, height: 50 })
    await painter.loadImage(imageDataUrl(100, 50))
    const layer = importedLayer(painter)
    painter.zoomViewportAt({ x: 160, y: 120 }, 1.5)

    const fixedBefore = layer.toGlobal(new Point(-50, -25))
    const handle = layer.controlPoints.BOTTOM_RIGHT
    const start = handle.getGlobalPosition()
    const end = new Point(start.x + 75, start.y + 37.5)

    handle.emit('pointerdown', pointerEvent(start))
    painter.app.stage.emit('pointermove', pointerEvent(end))
    painter.app.stage.emit('pointerup', pointerEvent(end))

    expect(layer.scale.x).toBeCloseTo(1.5, 4)
    expect(layer.scale.y).toBeCloseTo(1.5, 4)
    expectPointClose(layer.toGlobal(new Point(-50, -25)), fixedBefore)
    expectPointClose(handle.getGlobalPosition(), end)
  })

  it('keeps explicit transform hit targets screen-sized and simplifies tiny selections', async () => {
    const painter = await createFixture({ width: 100, height: 50 })
    await painter.loadImage(imageDataUrl(100, 50))
    const layer = importedLayer(painter)
    const corner = layer.controlPoints.BOTTOM_RIGHT

    expect(corner.hitArea).toBeInstanceOf(Rectangle)
    expect(corner.width * painter.getViewportSnapshot().scale).toBeCloseTo(32, 4)
    expect(layer.controlPoints.TOP_CENTER.visible).toBe(true)
    expect(layer.controlPoints.RIGHT_CENTER.visible).toBe(false)

    painter.zoomViewportAt({ x: 160, y: 120 }, 0.3)
    expect(corner.width * painter.getViewportSnapshot().scale).toBeCloseTo(32, 4)

    painter.setTransformSelectionValues({ width: 10, height: 5 })
    expect(layer.controlPoints.TOP_LEFT.visible).toBe(true)
    expect(layer.controlPoints.BOTTOM_RIGHT.visible).toBe(true)
    expect(layer.controlPoints.TOP_CENTER.visible).toBe(false)
    expect(layer.controlPoints.RIGHT_CENTER.visible).toBe(false)
    expect(layer.controlPoints.CENTER.visible).toBe(false)
    expect(layer.controlPoints.ROTATE.visible).toBe(true)
  })

  it('supports free corner scaling with Shift and snaps rotation to 15 degrees', async () => {
    const painter = await createFixture({ width: 100, height: 50 })
    await painter.loadImage(imageDataUrl(100, 50))
    const layer = importedLayer(painter)
    const corner = layer.controlPoints.BOTTOM_RIGHT
    const cornerStart = corner.getGlobalPosition()
    const cornerEnd = new Point(cornerStart.x + 50, cornerStart.y + 50)

    corner.emit('pointerdown', pointerEvent(cornerStart))
    painter.app.stage.emit('pointermove', pointerEvent(cornerEnd, { shiftKey: true }))
    painter.app.stage.emit('pointerup', pointerEvent(cornerEnd))

    expect(layer.scale.x).toBeCloseTo(1.5, 4)
    expect(layer.scale.y).toBeCloseTo(2, 4)

    const rotate = layer.controlPoints.ROTATE
    const rotateStart = rotate.getGlobalPosition()
    const center = layer.getGlobalPosition()
    const angle = Math.PI * 23 / 180
    const radius = Math.hypot(rotateStart.x - center.x, rotateStart.y - center.y)
    const rotateEnd = new Point(
      center.x + Math.sin(angle) * radius,
      center.y - Math.cos(angle) * radius,
    )

    rotate.emit('pointerdown', pointerEvent(rotateStart))
    painter.app.stage.emit('pointermove', pointerEvent(rotateEnd, { shiftKey: true }))
    painter.app.stage.emit('pointerup', pointerEvent(rotateEnd))

    expect(layer.rotation).toBeCloseTo(Math.PI / 6, 4)
  })

  it('cancels or commits a transform as one undoable transaction', async () => {
    const painter = await createFixture({ width: 100, height: 50 })
    await painter.loadImage(imageDataUrl(100, 50))
    painter.history.clear()
    const original = painter.getTransformSelection()!

    painter.setTransformSelectionValues({ x: original.x + 12, width: 80 })
    painter.cancelTransform()
    expect(painter.getTransformSelection()?.x).toBeCloseTo(original.x, 4)
    expect(painter.getTransformSelection()?.width).toBeCloseTo(original.width, 4)
    expect(painter.history.canUndo()).toBe(false)

    painter.setTransformSelectionValues({ x: original.x + 12, width: 80, rotation: 30 })
    painter.confirmTransform()
    expect(painter.history.canUndo()).toBe(true)
    expect(painter.controller.getState().history.canUndo).toBe(true)

    painter.history.undo()
    expect(painter.getTransformSelection()?.x).toBeCloseTo(original.x, 4)
    expect(painter.getTransformSelection()?.width).toBeCloseTo(original.width, 4)
    painter.history.redo()
    expect(painter.getTransformSelection()?.x).toBeCloseTo(original.x + 12, 4)
    expect(painter.getTransformSelection()?.rotation).toBeCloseTo(30, 4)
  })

  it('deletes and restores the raster layer, pixels, and controls together', async () => {
    const painter = await createFixture({ width: 100, height: 50 })
    await painter.loadImage(imageDataUrl(100, 50))
    painter.confirmTransform()
    painter.history.clear()
    const layerId = painter.document.activeLayerId!
    const overlay = importedLayer(painter)

    painter.removeSelectedTransformLayer()
    expect(painter.document.getLayer(layerId)).toBeUndefined()
    expect(overlay.parent).toBeNull()
    expect(overlay.boundingBoxContainer.parent).toBeNull()

    painter.history.undo()
    expect(painter.document.getLayer(layerId)).toBeDefined()
    expect(overlay.parent).not.toBeNull()
    const pixels = painter.surface.readRegion?.(layerId, { x: 0, y: 0, width: 100, height: 50 })
    expect(pixels?.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)

    painter.history.redo()
    expect(painter.document.getLayer(layerId)).toBeUndefined()
  })

  it('round-trips imported pixels and transform through the project format', async () => {
    const painter = await createFixture({ width: 120, height: 80 })
    await painter.loadImage(imageDataUrl(60, 40))
    painter.setTransformSelectionValues({ x: 70, y: 35, width: 90, rotation: 20 })
    painter.confirmTransform()
    const project = painter.exportProject()

    const restored = await createFixture({ width: 32, height: 32 })
    restored.importProject(project)
    const imageLayer = restored.document.layers.find(layer => layer.label.startsWith('Image '))
    expect(imageLayer?.transform?.x).toBeCloseTo(70, 4)
    expect(imageLayer?.transform?.rotation).toBeCloseTo(20 * Math.PI / 180, 4)
    expect(importedLayers(restored)).toHaveLength(1)
    const pixels = restored.surface.readRegion?.(imageLayer!.id, { x: 30, y: 20, width: 60, height: 40 })
    expect(pixels?.some((value, index) => index % 4 === 3 && value > 0)).toBe(true)
  })
})

import type { FederatedPointerEvent } from 'pixi.js'
import type { Painter, PainterInputSnapshot } from '../src'
import { Container, Point, Rectangle, Sprite } from 'pixi.js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPainter, PainterBrush, PainterEraser } from '../src'

const painters: Painter[] = []

afterEach(() => {
  for (const painter of painters.splice(0))
    painter.destroy()
  PainterBrush.enabled = true
  PainterBrush.color = 0x000000
  PainterBrush.size = 10
  PainterBrush.enablePressure = true
  PainterBrush.stabilizerStrength = 1
  PainterEraser.enabled = true
  PainterEraser.size = 10
  PainterEraser.enablePressure = true
})

async function createFixture(options: {
  pointerSource?: 'dom' | 'pixi'
  diagnostics?: boolean
  wheelMode?: 'figma' | 'zoom'
} = {}): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    input: {
      pointerSource: options.pointerSource ?? 'dom',
      diagnostics: options.diagnostics ?? true,
      wheelMode: options.wheelMode,
    },
    view: canvas,
    size: { width: 64, height: 64 },
    boardSize: { width: 64, height: 64 },
    pixiOptions: {
      backgroundAlpha: 0,
    },
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function eventAt(painter: Painter, x: number, y: number, timeStamp = 0): FederatedPointerEvent {
  const board = painter.board.container
  const global = new Point(
    board.position.x + x * board.scale.x,
    board.position.y + y * board.scale.y,
  )
  return {
    global,
    pressure: 1,
    timeStamp,
    pointerId: 1,
    pointerType: 'pen',
  } as unknown as FederatedPointerEvent
}

function layerTarget(painter: Painter): Container | Sprite {
  const layerId = painter.document.activeLayerId
  if (!layerId)
    throw new Error('missing active layer')
  const handle = painter.surface.getDisplayHandle(layerId)
  if (handle instanceof Container || handle instanceof Sprite)
    return handle
  throw new TypeError('unsupported display handle')
}

function readPixel(painter: Painter, x: number, y: number): Uint8Array {
  const { pixels } = painter.app.renderer.extract.pixels({
    target: layerTarget(painter),
    frame: new Rectangle(x, y, 1, 1),
  })

  return new Uint8Array(pixels)
}

function dispatchPointer(
  painter: Painter,
  type: string,
  options: PointerEventInit = {},
  coalesced: PointerEvent[] = [],
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'pen',
    clientX: 32,
    clientY: 32,
    pressure: 1,
    ...options,
  })

  if (coalesced.length > 0) {
    Object.defineProperty(event, 'getCoalescedEvents', {
      configurable: true,
      value: () => coalesced,
    })
  }

  painter.app.canvas.dispatchEvent(event)
}

function dispatchWheel(painter: Painter, options: WheelEventInit = {}): WheelEvent {
  const event = new WheelEvent('wheel', {
    bubbles: true,
    cancelable: true,
    clientX: 32,
    clientY: 32,
    deltaY: -50,
    ctrlKey: true,
    ...options,
  })

  painter.app.canvas.dispatchEvent(event)
  return event
}

function coalescedMove(options: PointerEventInit): PointerEvent {
  return new PointerEvent('pointermove', {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'pen',
    clientX: 32,
    clientY: 32,
    pressure: 1,
    ...options,
  })
}

describe('dom pointer input adapter', () => {
  it('paints a pen stroke through DOM pointer events and records one history entry', async () => {
    const painter = await createFixture()
    painter.useTool('brush')
    painter.brush.setSize(20)

    dispatchPointer(painter, 'pointerdown', { clientX: 32, clientY: 32, timeStamp: 0 })
    dispatchPointer(painter, 'pointermove', { clientX: 40, clientY: 32, timeStamp: 1 })
    dispatchPointer(painter, 'pointerup', { clientX: 40, clientY: 32, timeStamp: 2 })
    painter.flushSurfaceUploads()

    expect(readPixel(painter, 32, 32)[3]).toBeGreaterThan(0)
    expect(painter.history.undoStack).toHaveLength(1)
  })

  it('maps pointer coordinates through the canvas CSS scale', async () => {
    const painter = await createFixture()
    const beginDocumentStroke = vi.spyOn(painter.brush, 'beginDocumentStroke')
    const canvas = painter.app.canvas
    painter.useTool('brush')

    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      bottom: 82,
      height: 32,
      left: 100,
      right: 132,
      top: 50,
      width: 32,
      x: 100,
      y: 50,
      toJSON: () => ({}),
    })

    dispatchPointer(painter, 'pointerdown', {
      clientX: 116,
      clientY: 66,
      timeStamp: 0,
    })

    expect(beginDocumentStroke).toHaveBeenCalledWith(
      expect.objectContaining({ x: 32, y: 32 }),
      1,
    )
  })

  it('zooms the viewport from wheel gestures by default', async () => {
    const painter = await createFixture({ diagnostics: false })
    const board = painter.board.container
    const initialScale = board.scale.x

    const zoomIn = dispatchWheel(painter, { ctrlKey: false, deltaY: -50 })

    expect(zoomIn.defaultPrevented).toBe(true)
    expect(board.scale.x).toBeGreaterThan(initialScale)
  })

  it('pans the viewport from plain wheel gestures in figma mode', async () => {
    const painter = await createFixture({ diagnostics: false, wheelMode: 'figma' })
    const board = painter.board.container
    const initialScale = board.scale.x
    const initialX = board.position.x
    const initialY = board.position.y

    const event = dispatchWheel(painter, {
      ctrlKey: false,
      deltaX: 12,
      deltaY: 18,
    })

    expect(event.defaultPrevented).toBe(true)
    expect(board.scale.x).toBe(initialScale)
    expect(board.position.x).toBe(initialX - 12)
    expect(board.position.y).toBe(initialY - 18)
  })

  it('zooms the viewport from modified wheel gestures in figma mode', async () => {
    const painter = await createFixture({ diagnostics: false, wheelMode: 'figma' })
    const board = painter.board.container
    const initialScale = board.scale.x

    const zoomIn = dispatchWheel(painter, { deltaY: -50 })

    expect(zoomIn.defaultPrevented).toBe(true)
    expect(board.scale.x).toBeGreaterThan(initialScale)

    const zoomedScale = board.scale.x
    const zoomOut = dispatchWheel(painter, { deltaY: 50 })

    expect(zoomOut.defaultPrevented).toBe(true)
    expect(board.scale.x).toBeLessThan(zoomedScale)
  })

  it('feeds coalesced pointermove samples into one active brush stroke', async () => {
    const painter = await createFixture()
    const moveDocumentStroke = vi.spyOn(painter.brush, 'moveDocumentStroke')
    painter.useTool('brush')
    painter.brush.setSize(12)

    dispatchPointer(painter, 'pointerdown', { clientX: 32, clientY: 32, timeStamp: 0 })
    dispatchPointer(
      painter,
      'pointermove',
      { clientX: 44, clientY: 32, timeStamp: 3 },
      [
        coalescedMove({ clientX: 36, clientY: 32, pressure: 0.5, timeStamp: 1 }),
        coalescedMove({ clientX: 40, clientY: 32, pressure: 0.75, timeStamp: 2 }),
        coalescedMove({ clientX: 44, clientY: 32, pressure: 1, timeStamp: 3 }),
      ],
    )
    dispatchPointer(painter, 'pointerup', { clientX: 44, clientY: 32, timeStamp: 4 })

    expect(moveDocumentStroke).toHaveBeenCalledTimes(3)
    expect(painter.history.undoStack).toHaveLength(1)
  })

  it('marks mouse input without pressure as no-pressure in diagnostics', async () => {
    const painter = await createFixture()
    const snapshots: PainterInputSnapshot[] = []
    painter.emitter.on('input:pointer', snapshot => snapshots.push(snapshot))

    dispatchPointer(painter, 'pointerdown', {
      pointerId: 2,
      pointerType: 'mouse',
      pressure: 0,
      timeStamp: 0,
    })

    expect(snapshots.at(-1)).toMatchObject({
      pointerId: 2,
      pointerType: 'mouse',
      pressure: 0,
      hasPressure: false,
    })
  })

  it('emits pen diagnostics with pressure, tilt, and coalesced sample counts', async () => {
    const painter = await createFixture()
    const snapshots: PainterInputSnapshot[] = []
    painter.emitter.on('input:pointer', snapshot => snapshots.push(snapshot))

    dispatchPointer(
      painter,
      'pointermove',
      {
        clientX: 42,
        clientY: 33,
        pressure: 0.25,
        tiltX: 4,
        tiltY: -2,
        twist: 10,
        timeStamp: 8,
      },
      [
        coalescedMove({
          clientX: 40,
          clientY: 32,
          pressure: 0.6,
          tiltX: 12,
          tiltY: -8,
          twist: 30,
          timeStamp: 7,
        }),
        coalescedMove({
          clientX: 42,
          clientY: 33,
          pressure: 0.8,
          tiltX: 14,
          tiltY: -6,
          twist: 45,
          timeStamp: 8,
        }),
      ],
    )

    const snapshot = snapshots.at(-1)
    expect(snapshot).toMatchObject({
      source: 'dom',
      eventType: 'pointermove',
      pointerType: 'pen',
      hasPressure: true,
      tiltX: 14,
      tiltY: -6,
      twist: 45,
      coalescedCount: 2,
      sampleCount: 2,
    })
    expect(snapshot?.pressure).toBeCloseTo(0.8)
    expect(snapshot?.time).toBeGreaterThan(0)
  })

  it('keeps the Pixi federated pointer path available as fallback', async () => {
    const painter = await createFixture({ pointerSource: 'pixi', diagnostics: false })
    painter.useTool('brush')
    painter.brush.setSize(20)

    painter.brush.pointerDown(eventAt(painter, 0, 0, 0))
    painter.brush.pointerMove(eventAt(painter, 8, 0, 1))
    painter.brush.pointerUp(eventAt(painter, 8, 0, 2))
    painter.flushSurfaceUploads()

    expect(readPixel(painter, 32, 32)[3]).toBeGreaterThan(0)
  })
})

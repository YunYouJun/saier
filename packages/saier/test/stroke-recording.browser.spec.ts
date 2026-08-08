import type { BrushInputPoint, SaierStrokeCommit } from '@saier/core'
import type {
  Painter,
  PainterStrokeCommittedEvent,
  PainterStrokeCommittedSummaryEvent,
  PainterStrokeEventScope,
} from '../src'
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

async function createFixture(strokeEventScope?: PainterStrokeEventScope): Promise<Painter> {
  const canvas = document.createElement('canvas')
  const painter = createPainter({
    backend: 'tiled',
    view: canvas,
    size: { width: 64, height: 64 },
    boardSize: { width: 64, height: 64 },
    pixiOptions: { backgroundAlpha: 0 },
    strokeEventScope,
  })
  await painter.init()
  painters.push(painter)
  return painter
}

describe('stroke recording runtime', () => {
  it('counts successful local strokes per document without changing the count on undo or redo', async () => {
    const painter = await createFixture()

    expect(painter.getStrokeCount()).toBe(0)
    drawDocumentStroke(painter)
    expect(painter.getStrokeCount()).toBe(1)

    drawDocumentEraserStroke(painter)
    expect(painter.getStrokeCount()).toBe(2)

    painter.history.undo()
    expect(painter.getStrokeCount()).toBe(2)
    painter.history.redo()
    expect(painter.getStrokeCount()).toBe(2)

    painter.clearCanvas()
    expect(painter.getStrokeCount()).toBe(0)
  })

  it('does not count an eraser stroke that leaves a blank canvas unchanged', async () => {
    const painter = await createFixture()

    drawDocumentEraserStroke(painter)

    expect(painter.getStrokeCount()).toBe(0)
  })

  it('offers a lightweight committed-stroke summary for counters and plugins', async () => {
    const painter = await createFixture()
    const events: PainterStrokeCommittedSummaryEvent[] = []
    const dispose = painter.onStrokeCommitted(
      event => events.push(event),
      { detail: 'summary' },
    )

    drawDocumentStroke(painter)
    dispose()
    drawDocumentStroke(painter)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      documentScope: 'room-main',
      documentId: painter.getActiveDocumentId(),
      tool: 'brush',
      paintTarget: 'layer',
      source: 'local',
      strokeNumber: 1,
    })
    expect(events[0]?.dirtyRect.width).toBeGreaterThan(0)
    expect(events[0]).not.toHaveProperty('commit')
    expect(events[0]).not.toHaveProperty('patch')
  })

  it('keeps the persistent log opt-in while still emitting committed strokes', async () => {
    const disabled = await createFixture()
    const disabledEmitted: SaierStrokeCommit[] = []
    disabled.emitter.on('stroke:commit', commit => disabledEmitted.push(commit))
    drawDocumentStroke(disabled)
    expect(disabled.strokeRecording.getStrokes()).toHaveLength(0)
    expect(disabledEmitted).toHaveLength(1)
  })

  it('emits a scoped stroke event with the canonical patch and activity fence', async () => {
    const painter = await createFixture({
      documentScope: 'activity',
      sessionId: 'session-1',
      activityEpoch: 3,
      roundId: 'round-2',
    })
    const events: PainterStrokeCommittedEvent[] = []
    const dispose = painter.onStrokeCommitted(event => events.push(event))

    drawDocumentStroke(painter)
    dispose()
    drawDocumentStroke(painter)

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      documentScope: 'activity',
      sessionId: 'session-1',
      activityEpoch: 3,
      roundId: 'round-2',
      surfaceId: events[0]?.commit.layerId,
      patch: {
        layerId: events[0]?.commit.layerId,
      },
    })
  })

  it('rejects activity painters without a complete session fence', () => {
    const canvas = document.createElement('canvas')
    expect(() => createPainter({
      view: canvas,
      strokeEventScope: {
        documentScope: 'activity',
        sessionId: 'session-1',
      },
    })).toThrow('Activity stroke events require sessionId, activityEpoch, and roundId.')
  })

  it('is opt-in and replays a recorded brush stroke into identical pixels', async () => {
    const source = await createFixture()
    const emitted: SaierStrokeCommit[] = []
    source.emitter.on('stroke:commit', commit => emitted.push(commit))
    source.strokeRecording.setEnabled(true)
    drawDocumentStroke(source)

    const strokes = source.strokeRecording.getStrokes()
    expect(strokes).toHaveLength(1)
    expect(emitted).toHaveLength(1)
    expect(strokes[0]).toMatchObject({
      schema: 'saier.stroke.v1',
      tool: 'brush',
      compositeMode: 'normal',
      inputPipeline: 'resolved-v1',
    })
    expect(strokes[0]!.events.some(event => event.kind === 'point')).toBe(true)

    const target = await createFixture()
    target.strokeRecording.replayStroke(strokes[0]!)
    target.flushSurfaceUploads()

    expect(readActiveLayerPixels(target)).toEqual(readActiveLayerPixels(source))
  })

  it('imports an exported stroke log into the active document with a fallback target layer', async () => {
    const source = await createFixture()
    source.strokeRecording.setEnabled(true)
    drawDocumentStroke(source)
    const log = source.strokeRecording.getLog()

    const target = await createFixture()
    const layerId = target.document.activeLayerId
    if (!layerId)
      throw new Error('missing active layer')

    const imported = target.strokeRecording.importLog(log, {
      documentId: target.getActiveDocumentId(),
      layerIdFallback: layerId,
    })
    expect(imported).toBe(1)
    expect(target.strokeRecording.getStrokes()).toHaveLength(1)

    target.strokeRecording.replayLog(target.strokeRecording.getLog())
    target.flushSurfaceUploads()

    expect(readActiveLayerPixels(target)).toEqual(readActiveLayerPixels(source))
  })

  it('replays stroke-local timing without changing the resulting pixels', async () => {
    const source = await createFixture()
    source.strokeRecording.setEnabled(true)
    drawDocumentStroke(source)
    const stroke = source.strokeRecording.getStrokes()[0]
    if (!stroke)
      throw new Error('missing recorded stroke')

    const target = await createFixture()
    await target.strokeRecording.replayStrokeTimed(stroke, {
      recordHistory: false,
      speed: 1000,
    })

    expect(readActiveLayerPixels(target)).toEqual(readActiveLayerPixels(source))
    expect(target.history.canUndo()).toBe(false)
  })
})

function drawDocumentStroke(painter: Painter): void {
  painter.useTool('brush')
  painter.brush.setColor(0x000000)
  painter.brush.setSize(16)
  painter.brush.beginDocumentStroke(pt(16, 16, 0), 1)
  painter.brush.moveDocumentStroke(pt(24, 18, 8), 1)
  painter.brush.moveDocumentStroke(pt(32, 16, 16), 1)
  painter.brush.endDocumentStroke(1)
  painter.flushSurfaceUploads()
}

function drawDocumentEraserStroke(painter: Painter): void {
  painter.useTool('eraser')
  PainterEraser.size = 8
  painter.eraser.beginDocumentStroke(pt(20, 16, 20), 2)
  painter.eraser.moveDocumentStroke(pt(24, 16, 28), 2)
  painter.eraser.endDocumentStroke(2)
  painter.flushSurfaceUploads()
}

function pt(x: number, y: number, time: number): BrushInputPoint {
  return { x, y, pressure: 1, hasPressure: true, pointerType: 'pen', time }
}

function backend(painter: Painter): PixiTileTextureBackend {
  if (!(painter.surface instanceof PixiTileTextureBackend))
    throw new Error('expected tiled backend')
  return painter.surface
}

function readActiveLayerPixels(painter: Painter): Uint8ClampedArray {
  const layerId = painter.document.activeLayerId
  if (!layerId)
    throw new Error('missing active layer')
  return backend(painter).getSurface(layerId).readRegion({
    x: 0,
    y: 0,
    width: painter.surface.width,
    height: painter.surface.height,
  })
}

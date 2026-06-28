import type { BrushDab, CompositeMode, DirtyRect, StrokePatch, SurfaceBackend } from '../src'
import { describe, expect, it, vi } from 'vitest'
import { Document, UndoManager } from '../src'

/**
 * A minimal in-memory backend: the "canvas" is a flat Uint8Array of bytes.
 * A stroke fills a rect with a value; the patch carries the before/after bytes
 * of that rect so `applyPatch` can restore either side.
 */
class FakeBackend implements SurfaceBackend {
  readonly width: number
  readonly height: number
  readonly pixels: Uint8Array
  private layers = new Set<string>()

  constructor(width: number, height: number) {
    this.width = width
    this.height = height
    this.pixels = new Uint8Array(width * height)
  }

  createLayer(id: string): void {
    this.layers.add(id)
  }

  removeLayer(id: string): void {
    this.layers.delete(id)
  }

  beginStroke(): void {}

  paintDab(_layerId: string, _dab: BrushDab, _mode: CompositeMode): DirtyRect {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  endStroke(): StrokePatch {
    throw new Error('not used in this test')
  }

  /** Test helper: fill a rect with `value`, returning the undo patch. */
  fill(layerId: string, rect: DirtyRect, value: number): StrokePatch {
    const before = this.read(rect)
    this.write(rect, this.solid(rect, value))
    const after = this.read(rect)
    return { layerId, rect, before, after }
  }

  applyPatch(patch: StrokePatch, dir: 'undo' | 'redo'): void {
    const data = dir === 'undo' ? patch.before : patch.after
    this.write(patch.rect, data as Uint8Array)
  }

  getDisplayHandle(id: string): unknown {
    return id
  }

  snapshot(): number[] {
    return Array.from(this.pixels)
  }

  private solid(rect: DirtyRect, value: number): Uint8Array {
    return new Uint8Array(rect.width * rect.height).fill(value)
  }

  private read(rect: DirtyRect): Uint8Array {
    const out = new Uint8Array(rect.width * rect.height)
    for (let row = 0; row < rect.height; row++) {
      const src = (rect.y + row) * this.width + rect.x
      out.set(this.pixels.subarray(src, src + rect.width), row * rect.width)
    }
    return out
  }

  private write(rect: DirtyRect, data: Uint8Array): void {
    for (let row = 0; row < rect.height; row++) {
      const dst = (rect.y + row) * this.width + rect.x
      this.pixels.set(data.subarray(row * rect.width, (row + 1) * rect.width), dst)
    }
  }
}

const RECT = { x: 1, y: 1, width: 2, height: 2 }

describe('undoManager', () => {
  it('round-trips canvas state through record → undo → redo', () => {
    const backend = new FakeBackend(4, 4)
    backend.createLayer('a')
    const undo = new UndoManager({ backend })

    const blank = backend.snapshot()
    undo.record(backend.fill('a', RECT, 1))
    const afterFirst = backend.snapshot()
    undo.record(backend.fill('a', RECT, 2))
    const afterSecond = backend.snapshot()

    expect(afterFirst).not.toEqual(blank)
    expect(afterSecond).not.toEqual(afterFirst)

    undo.undo()
    expect(backend.snapshot()).toEqual(afterFirst)
    undo.undo()
    expect(backend.snapshot()).toEqual(blank)

    undo.redo()
    expect(backend.snapshot()).toEqual(afterFirst)
    undo.redo()
    expect(backend.snapshot()).toEqual(afterSecond)
  })

  it('clears redo after a new record', () => {
    const backend = new FakeBackend(4, 4)
    backend.createLayer('a')
    const undo = new UndoManager({ backend })

    undo.record(backend.fill('a', RECT, 1))
    undo.record(backend.fill('a', RECT, 2))
    undo.undo()
    expect(undo.canRedo()).toBe(true)

    undo.record(backend.fill('a', RECT, 3))
    expect(undo.canRedo()).toBe(false)
  })

  it('enforces the capacity cap, dropping the oldest steps', () => {
    const backend = new FakeBackend(4, 4)
    backend.createLayer('a')
    const undo = new UndoManager({ backend, capacity: 2 })

    undo.record(backend.fill('a', RECT, 1))
    undo.record(backend.fill('a', RECT, 2))
    undo.record(backend.fill('a', RECT, 3))

    // Only the last 2 steps are retained.
    undo.undo()
    undo.undo()
    expect(undo.canUndo()).toBe(false)
  })

  it('emits history:change and throws without a backend', () => {
    const undo = new UndoManager()
    const spy = vi.fn()
    undo.on('history:change', spy)
    undo.record({ layerId: 'a', rect: RECT, before: new Uint8Array(), after: new Uint8Array() })
    expect(spy).toHaveBeenCalledWith({ canUndo: true, canRedo: false })
    expect(() => undo.undo()).toThrow(/no backend/)
  })
})

describe('document', () => {
  it('adds, activates, reorders and removes layers', () => {
    const doc = new Document({ width: 100, height: 100 })
    const a = doc.addLayer({ label: 'A' })
    const b = doc.addLayer({ label: 'B' })

    expect(doc.layers.map(l => l.id)).toEqual([a.id, b.id])
    expect(doc.activeLayerId).toBe(b.id) // newest is active

    doc.moveLayer(b.id, 0)
    expect(doc.layers.map(l => l.id)).toEqual([b.id, a.id])

    doc.removeLayer(b.id)
    expect(doc.layers.map(l => l.id)).toEqual([a.id])
    expect(doc.activeLayerId).toBe(a.id) // active falls back to top layer
  })

  it('generates deterministic ids', () => {
    const doc = new Document({ width: 10, height: 10 })
    expect(doc.addLayer().id).toBe('layer-1')
    expect(doc.addLayer().id).toBe('layer-2')
  })

  it('skips explicit ids when generating deterministic ids', () => {
    const doc = new Document({ width: 10, height: 10 })
    expect(doc.addLayer({ id: 'layer-1' }).id).toBe('layer-1')
    expect(doc.addLayer().id).toBe('layer-2')
  })

  it('emits layers:change on structural and property changes', () => {
    const doc = new Document({ width: 10, height: 10 })
    const spy = vi.fn()
    doc.on('layers:change', spy)

    const layer = doc.addLayer()
    doc.setOpacity(layer.id, 0.5)
    doc.setVisible(layer.id, false)
    doc.setBlendMode(layer.id, 'screen')
    doc.setLabel(layer.id, 'Highlights')

    expect(spy).toHaveBeenCalledTimes(5)
    expect(doc.getLayer(layer.id)).toMatchObject({
      opacity: 0.5,
      visible: false,
      blendMode: 'screen',
      label: 'Highlights',
    })

    // no-op changes do not re-emit
    spy.mockClear()
    doc.setOpacity(layer.id, 0.5)
    doc.setBlendMode(layer.id, 'screen')
    doc.setLabel(layer.id, 'Highlights')
    expect(spy).not.toHaveBeenCalled()
  })

  it('clamps layer opacity on creation and updates', () => {
    const doc = new Document({ width: 10, height: 10 })
    const layer = doc.addLayer({ opacity: 2 })
    expect(layer.opacity).toBe(1)

    doc.setOpacity(layer.id, -1)
    expect(layer.opacity).toBe(0)
  })
})

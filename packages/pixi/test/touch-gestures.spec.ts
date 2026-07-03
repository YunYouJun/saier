import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_PINCH_ZOOM_SENSITIVITY, TouchGestureRouter } from '../src'

function touch(pointerId: number, x: number, y: number) {
  return { pointerId, pointerType: 'touch', clientX: x, clientY: y }
}

function pen(pointerId: number, x: number, y: number) {
  return { pointerId, pointerType: 'pen', clientX: x, clientY: y }
}

describe('touchGestureRouter', () => {
  it('routes one touch to stroke callbacks', () => {
    const onStrokeStart = vi.fn()
    const onStrokeMove = vi.fn()
    const onStrokeEnd = vi.fn()
    const router = new TouchGestureRouter({
      viewport: { panBy: vi.fn(), zoomAt: vi.fn() },
      onStrokeStart,
      onStrokeMove,
      onStrokeEnd,
    })

    router.pointerDown(touch(1, 0, 0))
    router.pointerMove(touch(1, 5, 0))
    router.pointerUp(touch(1, 5, 0))

    expect(onStrokeStart).toHaveBeenCalledTimes(1)
    expect(onStrokeMove).toHaveBeenCalledTimes(1)
    expect(onStrokeEnd).toHaveBeenCalledTimes(1)
  })

  it('turns two touches into pan and pinch without stroke moves', () => {
    const panBy = vi.fn()
    const zoomAt = vi.fn()
    const onStrokeCancel = vi.fn()
    const onStrokeMove = vi.fn()
    const router = new TouchGestureRouter({
      viewport: { panBy, zoomAt },
      onStrokeCancel,
      onStrokeMove,
    })

    router.pointerDown(touch(1, 0, 0))
    router.pointerDown(touch(2, 10, 0))
    router.pointerMove(touch(2, 20, 0))

    expect(onStrokeCancel).toHaveBeenCalledTimes(1)
    expect(onStrokeMove).not.toHaveBeenCalled()
    expect(panBy).toHaveBeenCalledWith(5, 0)
    expect(zoomAt).toHaveBeenCalledTimes(1)
    expect(zoomAt.mock.calls[0]![0]).toEqual({ x: 10, y: 0 })
    expect(zoomAt.mock.calls[0]![1]).toBeCloseTo(2 ** DEFAULT_PINCH_ZOOM_SENSITIVITY)
  })

  it('can keep pinch zoom at physical one-to-one sensitivity', () => {
    const zoomAt = vi.fn()
    const router = new TouchGestureRouter({
      viewport: { panBy: vi.fn(), zoomAt },
      pinchZoomSensitivity: 1,
    })

    router.pointerDown(touch(1, 0, 0))
    router.pointerDown(touch(2, 10, 0))
    router.pointerMove(touch(2, 20, 0))

    expect(zoomAt).toHaveBeenCalledWith({ x: 10, y: 0 }, 2)
  })

  it('keeps pen input on the stroke path', () => {
    const onStrokeStart = vi.fn()
    const onStrokeMove = vi.fn()
    const router = new TouchGestureRouter({
      viewport: { panBy: vi.fn(), zoomAt: vi.fn() },
      onStrokeStart,
      onStrokeMove,
    })

    router.pointerDown(pen(7, 0, 0))
    router.pointerMove(pen(7, 5, 0))

    expect(onStrokeStart).toHaveBeenCalledTimes(1)
    expect(onStrokeMove).toHaveBeenCalledTimes(1)
  })
})

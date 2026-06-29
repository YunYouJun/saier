import type { PointerEventLike } from '../src'
import { describe, expect, it } from 'vitest'
import { PointerSampler } from '../src'

function event(overrides: Partial<PointerEventLike> = {}): PointerEventLike {
  return {
    type: 'pointermove',
    clientX: 10,
    clientY: 20,
    timeStamp: 5,
    ...overrides,
  }
}

describe('pointerSampler', () => {
  it('expands coalesced pointermove events into multiple document points', () => {
    const sampler = new PointerSampler({
      viewport: {
        toDocument: point => ({ x: point.x + 100, y: point.y + 200 }),
      },
    })

    const points = sampler.sample(event({
      getCoalescedEvents: () => [
        event({ clientX: 1, clientY: 2, pressure: 0.25, pointerType: 'pen', timeStamp: 1 }),
        event({ clientX: 3, clientY: 4, pressure: 0.5, pointerType: 'pen', timeStamp: 2 }),
      ],
    }))

    expect(points).toHaveLength(2)
    expect(points.map(point => [point.x, point.y, point.pressure, point.time])).toEqual([
      [101, 202, 0.25, 1],
      [103, 204, 0.5, 2],
    ])
  })

  it('preserves pen tilt and barrel rotation from coalesced events', () => {
    const sampler = new PointerSampler({
      viewport: { toDocument: point => point },
    })

    const points = sampler.sample(event({
      getCoalescedEvents: () => [
        event({
          clientX: 12,
          clientY: 24,
          pressure: 0.75,
          pointerType: 'pen',
          tiltX: 18,
          tiltY: -12,
          twist: 45,
          timeStamp: 7,
        }),
      ],
    }))

    expect(points).toEqual([
      expect.objectContaining({
        x: 12,
        y: 24,
        pressure: 0.75,
        hasPressure: true,
        pointerType: 'pen',
        tiltX: 18,
        tiltY: -12,
        twist: 45,
        time: 7,
      }),
    ])
  })

  it('marks mouse input as no-pressure and does not invent 0.5', () => {
    const sampler = new PointerSampler({
      viewport: { toDocument: point => point },
    })

    const [point] = sampler.sample(event({ pointerType: 'mouse', pressure: undefined }))

    expect(point.hasPressure).toBe(false)
    expect(point.pressure).toBe(0)
  })

  it('projects every point through the viewport into document space', () => {
    const sampler = new PointerSampler({
      viewport: {
        toDocument: point => ({ x: point.x / 2, y: point.y / 4 }),
      },
    })

    const [point] = sampler.sample(event({ clientX: 80, clientY: 40, pressure: 1, pointerType: 'pen' }))

    expect(point.x).toBe(40)
    expect(point.y).toBe(10)
    expect(point.hasPressure).toBe(true)
  })
})

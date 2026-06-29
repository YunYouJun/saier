import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createLayerTransform, Document, PainterController } from '../src'

describe('layer attribute model (P6-01)', () => {
  let doc: Document

  beforeEach(() => {
    doc = new Document({ width: 64, height: 64 })
  })

  it('new layers default to unlocked / unclipped / no transform / no mask', () => {
    const layer = doc.addLayer({ id: 'a' })
    expect(layer.lockAlpha).toBe(false)
    expect(layer.clip).toBe(false)
    expect(layer.transform).toBeUndefined()
    expect(layer.mask).toBeUndefined()
  })

  it('setLockAlpha / setClip toggle and emit once, no-op stays silent', () => {
    doc.addLayer({ id: 'a' })
    const onChange = vi.fn()
    doc.on('layers:change', onChange)

    doc.setLockAlpha('a', true)
    doc.setClip('a', true)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(doc.getLayer('a')?.lockAlpha).toBe(true)
    expect(doc.getLayer('a')?.clip).toBe(true)

    doc.setLockAlpha('a', true) // no-op
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('setTransform sets a defensive copy and can clear it', () => {
    doc.addLayer({ id: 'a' })
    const t = createLayerTransform({ x: 10, scaleX: 2 })
    doc.setTransform('a', t)
    expect(doc.getLayer('a')?.transform).toEqual(t)
    expect(doc.getLayer('a')?.transform).not.toBe(t) // copied

    doc.setTransform('a', undefined)
    expect(doc.getLayer('a')?.transform).toBeUndefined()
  })

  it('attach / enable / detach mask', () => {
    doc.addLayer({ id: 'a' })
    doc.attachMask('a')
    expect(doc.getLayer('a')?.mask).toEqual({ id: 'a:mask', enabled: true })

    doc.attachMask('a') // already exists → no replace
    expect(doc.getLayer('a')?.mask?.id).toBe('a:mask')

    doc.setMaskEnabled('a', false)
    expect(doc.getLayer('a')?.mask?.enabled).toBe(false)

    doc.detachMask('a')
    expect(doc.getLayer('a')?.mask).toBeUndefined()
  })

  it('controller forwards the commands and mirrors them in the snapshot', () => {
    const controller = new PainterController({ document: doc })
    doc.addLayer({ id: 'a' })

    controller.layer.setLockAlpha('a', true)
    controller.layer.setClip('a', true)
    controller.layer.setTransform('a', createLayerTransform({ rotation: 1 }))
    controller.layer.addMask('a')

    const snap = controller.getState().layers.find(l => l.id === 'a')
    expect(snap?.lockAlpha).toBe(true)
    expect(snap?.clip).toBe(true)
    expect(snap?.transform?.rotation).toBe(1)
    expect(snap?.mask).toEqual({ id: 'a:mask', enabled: true })
  })

  it('snapshot is a defensive copy (mutating it does not touch the model)', () => {
    const controller = new PainterController({ document: doc })
    doc.addLayer({ id: 'a' })
    controller.layer.setTransform('a', createLayerTransform({ x: 5 }))

    const snap = controller.getState().layers.find(l => l.id === 'a')!
    snap.transform!.x = 999
    expect(doc.getLayer('a')?.transform?.x).toBe(5)
  })
})

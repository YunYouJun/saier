import type { Painter, PainterTransformSnapshot } from 'saier'
import mitt from 'mitt'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import PainterTransformBar from '../components/PainterTransformBar.vue'

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function createFakePainter(snapshot: PainterTransformSnapshot | null) {
  const emitter = mitt<{ 'transform:change': PainterTransformSnapshot | null }>()
  return {
    emitter,
    getTransformSelection: vi.fn(() => snapshot),
    setTransformSelectionValues: vi.fn(),
    setTransformAspectRatioLocked: vi.fn(),
    flipTransformSelection: vi.fn(),
    removeSelectedTransformLayer: vi.fn(),
    cancelSelection: vi.fn(),
    confirmTransform: vi.fn(),
  } as unknown as Painter
}

function mountBar(snapshot: PainterTransformSnapshot | null) {
  const painter = createFakePainter(snapshot)
  const root = document.createElement('div')
  document.body.appendChild(root)
  const app = createApp(PainterTransformBar, { painter })
  app.mount(root)
  mounted.push({
    unmount: () => {
      app.unmount()
      root.remove()
    },
  })
  return { painter, root }
}

const selection: PainterTransformSnapshot = {
  layerId: 'image-1',
  x: 120,
  y: 80,
  width: 240,
  height: 160,
  rotation: 15,
  scaleX: 1,
  scaleY: 1,
  aspectRatioLocked: true,
}

describe('painter transform bar', () => {
  it('exposes exact accessible transform fields and actions', async () => {
    const { painter, root } = mountBar(selection)
    const width = root.querySelector<HTMLInputElement>('input[aria-label="Width"]')!
    expect(width.value).toBe('240')
    width.value = '300'
    width.dispatchEvent(new Event('change', { bubbles: true }))
    await nextTick()
    expect(painter.setTransformSelectionValues).toHaveBeenCalledWith({ width: 300 })

    root.querySelector<HTMLButtonElement>('button[aria-label="Unlock aspect ratio"]')!.click()
    root.querySelector<HTMLButtonElement>('button[aria-label="Flip horizontal"]')!.click()
    root.querySelector<HTMLButtonElement>('button[aria-label="Delete layer"]')!.click()
    await nextTick()

    expect(painter.setTransformAspectRatioLocked).toHaveBeenCalledWith(false)
    expect(painter.flipTransformSelection).toHaveBeenCalledWith('horizontal')
    expect(painter.removeSelectedTransformLayer).toHaveBeenCalledOnce()
  })

  it('mirrors live transform events and hides when selection clears', async () => {
    const { painter, root } = mountBar(selection)
    painter.emitter.emit('transform:change', { ...selection, x: 144, rotation: -30 })
    await nextTick()
    expect(root.querySelector<HTMLInputElement>('input[aria-label="X position"]')?.value).toBe('144')
    expect(root.querySelector<HTMLInputElement>('input[aria-label="Rotation"]')?.value).toBe('-30')

    painter.emitter.emit('transform:change', null)
    await nextTick()
    expect(root.querySelector('.painter-transform')).toBeNull()
  })

  it('provides explicit cancel and confirm controls', async () => {
    const { painter, root } = mountBar(selection)
    const buttons = [...root.querySelectorAll<HTMLButtonElement>('.painter-transform__footer button')]
    buttons[0]?.click()
    buttons[1]?.click()
    await nextTick()
    expect(painter.cancelSelection).toHaveBeenCalledOnce()
    expect(painter.confirmTransform).toHaveBeenCalledOnce()
  })
})

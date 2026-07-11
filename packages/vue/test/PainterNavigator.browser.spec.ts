import type { PainterViewportSnapshot } from 'saier'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick } from 'vue'
import PainterNavigator from '../components/PainterNavigator.vue'

interface MountedNavigator {
  el: HTMLDivElement
  handlers: {
    onCenter: ReturnType<typeof vi.fn>
    onRefresh: ReturnType<typeof vi.fn>
    onReset: ReturnType<typeof vi.fn>
  }
  unmount: () => void
}

const mounted: MountedNavigator[] = []
const TRANSPARENT_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/lC3oWQAAAABJRU5ErkJggg=='

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function createViewport(overrides: Partial<PainterViewportSnapshot> = {}): PainterViewportSnapshot {
  return {
    x: 0,
    y: 0,
    scale: 2,
    viewWidth: 500,
    viewHeight: 300,
    documentWidth: 1000,
    documentHeight: 500,
    visibleRect: {
      x: 250,
      y: 100,
      width: 250,
      height: 150,
    },
    ...overrides,
  }
}

function mountNavigator(viewport = createViewport()): MountedNavigator {
  const handlers = {
    onCenter: vi.fn(),
    onRefresh: vi.fn(),
    onReset: vi.fn(),
  }
  const el = document.createElement('div')
  document.body.appendChild(el)
  const app = createApp(PainterNavigator, {
    thumbnail: TRANSPARENT_PIXEL,
    viewport,
    onCenter: handlers.onCenter,
    onRefresh: handlers.onRefresh,
    onReset: handlers.onReset,
  })
  app.mount(el)

  const item = {
    el,
    handlers,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

function navigatorSurface(root: ParentNode): HTMLButtonElement {
  const element = root.querySelector('.painter-navigator__surface')
  if (!(element instanceof HTMLButtonElement))
    throw new Error('missing navigator surface')
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    bottom: 120,
    height: 100,
    left: 10,
    right: 210,
    top: 20,
    width: 200,
    x: 10,
    y: 20,
    toJSON: () => {},
  })
  return element
}

function pointerEvent(type: string, x: number, y: number): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    button: 0,
    clientX: x,
    clientY: y,
    pointerId: 1,
  })
}

function nextFrame(): Promise<void> {
  return new Promise(resolve => requestAnimationFrame(() => resolve()))
}

describe('painter navigator', () => {
  it('renders the viewport rectangle in document-relative percentages', async () => {
    const { el } = mountNavigator()
    await nextTick()

    const rect = el.querySelector<HTMLElement>('.painter-navigator__viewport')
    expect(rect?.style.left).toBe('25%')
    expect(rect?.style.top).toBe('20%')
    expect(rect?.style.width).toBe('25%')
    expect(rect?.style.height).toBe('30%')
  })

  it('preserves tall document aspect ratios within the preview height cap', async () => {
    const { el } = mountNavigator(createViewport({
      documentWidth: 100,
      documentHeight: 300,
      visibleRect: {
        x: 10,
        y: 30,
        width: 50,
        height: 100,
      },
    }))
    await nextTick()

    const surface = el.querySelector<HTMLElement>('.painter-navigator__surface')
    if (!surface)
      throw new Error('missing navigator surface')

    const rect = surface.getBoundingClientRect()
    expect(rect.height).toBeLessThanOrEqual(190)
    expect(rect.width / rect.height).toBeCloseTo(1 / 3, 1)
  })

  it('maps pointer positions to document centers', async () => {
    const { el, handlers } = mountNavigator()
    const surface = navigatorSurface(el)

    surface.dispatchEvent(pointerEvent('pointerdown', 60, 45))
    await nextFrame()

    expect(handlers.onCenter).toHaveBeenCalledWith({
      x: 250,
      y: 125,
    })
  })

  it('coalesces drag centers to one emit per frame', async () => {
    const { el, handlers } = mountNavigator()
    const surface = navigatorSurface(el)

    surface.dispatchEvent(pointerEvent('pointerdown', 10, 20))
    surface.dispatchEvent(pointerEvent('pointermove', 210, 120))
    surface.dispatchEvent(pointerEvent('pointermove', 110, 70))
    await nextFrame()

    expect(handlers.onCenter).toHaveBeenCalledTimes(1)
    expect(handlers.onCenter).toHaveBeenCalledWith({
      x: 500,
      y: 250,
    })
  })

  it('emits refresh and reset actions', async () => {
    const { el, handlers } = mountNavigator()
    const buttons = [...el.querySelectorAll<HTMLButtonElement>('.painter-navigator__icon')]

    buttons[0]?.click()
    buttons[1]?.click()
    await nextTick()

    expect(handlers.onRefresh).toHaveBeenCalledTimes(1)
    expect(handlers.onReset).toHaveBeenCalledTimes(1)
  })
})

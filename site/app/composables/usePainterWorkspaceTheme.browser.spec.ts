import type { Painter } from 'saier'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { syncPainterWorkspaceTheme } from './usePainterWorkspaceTheme'
import '~/assets/theme.css'

const mounted: HTMLElement[] = []

afterEach(() => {
  for (const element of mounted.splice(0))
    element.remove()
})

function createPainterProbe(): {
  background: { alpha: number, color: string }
  canvas: HTMLCanvasElement
  painter: Painter
  render: ReturnType<typeof vi.fn>
} {
  const canvas = document.createElement('canvas')
  document.body.appendChild(canvas)
  mounted.push(canvas)

  const background = { alpha: 0, color: '' }
  const render = vi.fn()
  const painter = {
    app: {
      render,
      renderer: {
        background,
        canvas,
      },
    },
  } as unknown as Painter

  return { background, canvas, painter, render }
}

describe('painter workspace theme', () => {
  it.each([
    ['light', '#d8dce2'],
    ['dark', '#282a2e'],
  ] as const)('applies the %s canvas surround token to Pixi', (theme, color) => {
    const { background, canvas, painter, render } = createPainterProbe()

    syncPainterWorkspaceTheme(painter, theme)

    expect(canvas.dataset.saierTheme).toBe(theme)
    expect(background.color).toBe(color)
    expect(background.alpha).toBe(1)
    expect(render).toHaveBeenCalledOnce()
  })
})

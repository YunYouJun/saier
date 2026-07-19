import type { Painter } from 'saier'
import type { SiteResolvedTheme } from './useSiteTheme'

const CANVAS_SURROUND_COLOR_TOKEN = '--saier-color-canvas-surround'

/** Keeps Pixi's visible workspace clear color aligned with the site theme. */
export function syncPainterWorkspaceTheme(painter: Painter, theme: SiteResolvedTheme): void {
  const { canvas, background } = painter.app.renderer
  canvas.dataset.saierTheme = theme

  const color = getComputedStyle(canvas)
    .getPropertyValue(CANVAS_SURROUND_COLOR_TOKEN)
    .trim()
  if (!color)
    return

  background.color = color
  background.alpha = 1
  painter.app.render()
}

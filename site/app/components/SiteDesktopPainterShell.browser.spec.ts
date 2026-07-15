import type { SitePainterPanelId } from '~/types/painter-app'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SiteDesktopPainterShell from './SiteDesktopPainterShell.vue'
import '~/assets/theme.css'

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function mountShell(workspaceKind: 'activity' | 'document' = 'document', theme: 'dark' | 'light' = 'dark') {
  const el = document.createElement('div')
  el.className = theme
  document.body.appendChild(el)

  const availablePanels: SitePainterPanelId[] = ['options', 'controls']
  const panelVisibility: Record<SitePainterPanelId, boolean> = {
    controls: true,
    diagnostics: false,
    layers: false,
    navigator: false,
    options: true,
  }

  const app = createApp({
    setup() {
      return () => h(SiteDesktopPainterShell, {
        appName: 'Saier',
        availablePanels,
        closePreviewLabel: 'Close preview',
        currentLocaleLabel: 'EN',
        exportPreviewLabel: 'Export preview',
        languageLabel: 'Language',
        loading: false,
        loadingLabel: 'Loading',
        locale: 'en',
        localeOptions: [],
        panelActionLabels: {
          collapse: 'Collapse',
          detach: 'Detach',
          expand: 'Expand',
          hide: 'Hide',
        },
        panelLabels: {
          controls: 'Color Palette',
          diagnostics: 'Diagnostics',
          layers: 'Layers',
          navigator: 'Navigator',
          options: 'Brush Options',
        },
        panelVisibility,
        statusLabel: 'Ready',
        tagline: 'Painting runtime',
        workspaceKind,
      }, {
        canvas: () => h('canvas'),
        controls: () => h('div', 'Palette content'),
        options: () => h('div', 'Brush content'),
      })
    },
  })
  app.component('Logos', { render: () => h('span') })
  app.mount(el)

  const item = {
    el,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

function pointerEvent(type: string, options: PointerEventInit): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    pointerId: 1,
    pointerType: 'mouse',
    ...options,
  })
}

describe('site desktop painter shell panels', () => {
  it('shows the color palette independently and lets users drag it', async () => {
    const { el } = mountShell()
    await nextTick()

    const controls = el.querySelector<HTMLElement>('.site-painter-panel--controls')
    const options = el.querySelector<HTMLElement>('.site-painter-panel--options')
    const header = controls?.querySelector<HTMLElement>('.site-painter-panel__header')
    if (!controls || !options || !header)
      throw new Error('missing desktop painter panels')

    expect(getComputedStyle(controls).display).not.toBe('none')
    expect(getComputedStyle(options).display).not.toBe('none')
    expect(controls.textContent).toContain('Color Palette')
    expect(options.textContent).toContain('Brush Options')

    const initialLeft = Number.parseFloat(controls.style.left)
    const rect = header.getBoundingClientRect()
    header.dispatchEvent(pointerEvent('pointerdown', {
      button: 0,
      clientX: rect.left + 80,
      clientY: rect.top + 16,
    }))
    window.dispatchEvent(pointerEvent('pointermove', {
      clientX: rect.left + 200,
      clientY: rect.top - 64,
    }))
    window.dispatchEvent(pointerEvent('pointerup', {
      clientX: rect.left + 200,
      clientY: rect.top - 64,
    }))
    await nextTick()

    expect(Number.parseFloat(controls.style.left)).toBeGreaterThan(initialLeft)
  })

  it('keeps the shell and tabs while an activity owns the workspace', async () => {
    const { el } = mountShell('activity')
    await nextTick()

    expect(el.querySelector('.site-painter')?.classList.contains('is-activity')).toBe(true)
    expect(el.querySelector('.site-painter__toolbar')).toBeNull()
    expect(getComputedStyle(el.querySelector<HTMLElement>('.site-painter__panel-stage')!).display).toBe('none')
  })

  it('themes application chrome without changing the neutral canvas surround', async () => {
    const dark = mountShell('document', 'dark')
    const light = mountShell('document', 'light')
    await nextTick()

    const darkShell = dark.el.querySelector<HTMLElement>('.site-painter')!
    const lightShell = light.el.querySelector<HTMLElement>('.site-painter')!
    const darkCanvas = dark.el.querySelector<HTMLCanvasElement>('.site-painter__canvas-host canvas')!
    const lightCanvas = light.el.querySelector<HTMLCanvasElement>('.site-painter__canvas-host canvas')!

    expect(getComputedStyle(darkShell).backgroundColor).not.toBe(getComputedStyle(lightShell).backgroundColor)
    expect(getComputedStyle(darkShell).color).not.toBe(getComputedStyle(lightShell).color)
    expect(getComputedStyle(darkCanvas).backgroundColor).toBe('rgb(81, 84, 90)')
    expect(getComputedStyle(lightCanvas).backgroundColor).toBe('rgb(81, 84, 90)')
  })
})

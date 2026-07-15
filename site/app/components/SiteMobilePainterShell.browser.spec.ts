import type { SitePainterPanelId } from '~/types/painter-app'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SiteMobilePainterShell from './SiteMobilePainterShell.vue'

const mounted: Array<() => void> = []

afterEach(() => {
  for (const unmount of mounted.splice(0))
    unmount()
})

describe('site mobile painter shell activity workspace', () => {
  it('keeps the app chrome while removing painter-only sheets and dock', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const availablePanels: SitePainterPanelId[] = ['options']
    const app = createApp({
      render: () => h(SiteMobilePainterShell, {
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
          controls: 'Controls',
          diagnostics: 'Diagnostics',
          layers: 'Layers',
          navigator: 'Navigator',
          options: 'Brush Options',
        },
        panelVisibility: {
          controls: false,
          diagnostics: false,
          layers: false,
          navigator: false,
          options: true,
        },
        statusLabel: 'Ready',
        tagline: 'Painting runtime',
        workspaceKind: 'activity',
      }, {
        canvas: () => h('div', { class: 'fake-activity-workspace' }, 'Activity'),
        documents: () => h('div', { class: 'fake-workspace-tabs' }, 'Tabs'),
      }),
    })
    app.mount(el)
    mounted.push(() => {
      app.unmount()
      el.remove()
    })
    await nextTick()

    expect(el.querySelector('.site-mobile-painter')?.classList.contains('is-activity')).toBe(true)
    expect(el.querySelector('.fake-workspace-tabs')?.textContent).toBe('Tabs')
    expect(el.querySelector('.fake-activity-workspace')?.textContent).toBe('Activity')
    expect(el.querySelector('.site-mobile-painter__dock')).toBeNull()
    expect(el.querySelector('.site-mobile-painter__sheet')).toBeNull()
  })
})

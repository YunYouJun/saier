import type { SitePainterColorSectionId, SitePainterPanelId } from '~/types/painter-app'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import { useSiteI18n } from '~/composables/useSiteI18n'
import SitePainterMenubar from './SitePainterMenubar.vue'

const mounted: { unmount: () => void }[] = []

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function mountMenubar() {
  const about = vi.fn()
  const el = document.createElement('div')
  document.body.appendChild(el)

  const { locale, localeOptions, text } = useSiteI18n()
  const panelVisibility: Record<SitePainterPanelId, boolean> = {
    controls: true,
    diagnostics: false,
    layers: true,
    navigator: true,
    options: true,
  }
  const colorSectionVisibility: Record<SitePainterColorSectionId, boolean> = {
    palette: true,
    rgbSliders: true,
    wheel: true,
  }

  const app = createApp({
    setup() {
      return () => h(SitePainterMenubar, {
        activityMenuItems: [],
        activeLayerVisible: true,
        activeTool: 'brush',
        availablePanels: [],
        canApplyFilter: true,
        canMoveLayerDown: false,
        canMoveLayerUp: false,
        canRedo: false,
        canRemoveLayer: false,
        canRepeatFilter: false,
        canUndo: false,
        colorSectionVisibility,
        disabled: false,
        hasActiveLayer: true,
        labels: text.value.menu,
        locale: locale.value,
        localeOptions,
        panelVisibility,
        shortcuts: {},
        themePreference: 'system',
        onOpenAbout: about,
      })
    },
  })
  app.mount(el)

  const item = {
    about,
    el,
    labels: text.value.menu,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

describe('site painter help menu', () => {
  it('opens official help links and the about action', async () => {
    const { about, el, labels } = mountMenubar()
    const helpTrigger = [...el.querySelectorAll<HTMLButtonElement>('.site-menubar__trigger')]
      .find(trigger => trigger.textContent?.trim() === labels.help)
    if (!helpTrigger)
      throw new Error('missing help menu trigger')

    helpTrigger.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      button: 0,
    }))
    await nextTick()

    const manual = document.body.querySelector<HTMLAnchorElement>('a[href="https://saier-docs.pages.dev/guide/getting-started"]')
    const issue = document.body.querySelector<HTMLAnchorElement>('a[href="https://github.com/YunYouJun/saier/issues/new/choose"]')
    const aboutItem = [...document.body.querySelectorAll<HTMLElement>('[role="menuitem"]')]
      .find(item => item.textContent?.trim() === labels.aboutSaier)

    expect(manual?.target).toBe('_blank')
    expect(manual?.rel).toContain('noopener')
    expect(issue?.target).toBe('_blank')
    expect(aboutItem).toBeTruthy()

    aboutItem?.click()
    expect(about).toHaveBeenCalledOnce()
  })
})

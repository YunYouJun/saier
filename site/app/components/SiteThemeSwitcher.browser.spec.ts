import type { SiteThemePreference } from '~/composables/useSiteTheme'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import SiteThemeSwitcher from './SiteThemeSwitcher.vue'
import '~/assets/theme.css'

const mounted: Array<() => void> = []

afterEach(() => {
  for (const unmount of mounted.splice(0))
    unmount()
})

function mountSwitcher(initialPreference: SiteThemePreference = 'system') {
  const preference = shallowRef<SiteThemePreference>(initialPreference)
  const el = document.createElement('div')
  el.className = 'light'
  document.body.appendChild(el)

  const app = createApp({
    render: () => h(SiteThemeSwitcher, {
      appearanceLabel: 'Appearance',
      darkLabel: 'Dark',
      lightLabel: 'Light',
      preference: preference.value,
      systemLabel: 'Follow system',
      onSetThemePreference: (value: SiteThemePreference) => preference.value = value,
    }),
  })
  app.mount(el)
  mounted.push(() => {
    app.unmount()
    el.remove()
  })
  return { el, preference }
}

describe('site theme switcher', () => {
  it('exposes the active preference from the top-right trigger', async () => {
    const { el } = mountSwitcher('system')
    await nextTick()

    const trigger = el.querySelector<HTMLButtonElement>('.site-theme-switcher__trigger')!
    expect(trigger.getAttribute('aria-label')).toBe('Appearance: Follow system')
    expect(trigger.textContent).toContain('Follow system')
  })

  it('offers all modes and emits the selected preference', async () => {
    const { el, preference } = mountSwitcher()
    await nextTick()

    el.querySelector<HTMLButtonElement>('.site-theme-switcher__trigger')!.click()
    await nextTick()

    const items = document.querySelectorAll<HTMLElement>('[data-theme-preference]')
    expect([...items].map(item => item.dataset.themePreference)).toEqual(['system', 'light', 'dark'])

    document.querySelector<HTMLElement>('[data-theme-preference="dark"]')!.click()
    await nextTick()
    expect(preference.value).toBe('dark')
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SiteAboutDialog from './SiteAboutDialog.vue'
import '~/assets/theme.css'

const mounted: { unmount: () => void }[] = []

const labels = {
  close: 'Close',
  copyright: 'Copyright © 2023–present YunYouJun',
  description: 'An elegant online painting workspace powered by PixiJS.',
  license: 'Open source under the MPL-2.0 license.',
  sourceCode: 'View source code',
  title: 'About Saier',
  version: 'Version',
}

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function mountAboutDialog() {
  const close = vi.fn()
  const el = document.createElement('div')
  el.className = 'dark'
  document.body.appendChild(el)

  const app = createApp({
    setup() {
      return () => h(SiteAboutDialog, {
        appName: 'Saier',
        labels,
        open: true,
        version: '0.1.6-beta.1',
        onClose: close,
      })
    },
  })
  app.mount(el)

  const item = {
    close,
    el,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

describe('site about dialog', () => {
  it('shows product metadata and a safe source link', async () => {
    const { el } = mountAboutDialog()
    await nextTick()

    const dialog = el.querySelector<HTMLElement>('[role="dialog"]')
    const sourceLink = el.querySelector<HTMLAnchorElement>('a[href="https://github.com/YunYouJun/saier"]')

    expect(dialog?.getAttribute('aria-label')).toBe('About Saier')
    expect(dialog?.textContent).toContain('v0.1.6-beta.1')
    expect(dialog?.textContent).toContain('MPL-2.0')
    expect(sourceLink?.target).toBe('_blank')
    expect(sourceLink?.rel).toContain('noopener')
  })

  it('closes from both the close control and Escape', async () => {
    const { close, el } = mountAboutDialog()
    await nextTick()

    const closeButton = el.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
    const dialog = el.querySelector<HTMLElement>('[role="dialog"]')
    if (!closeButton || !dialog)
      throw new Error('missing about dialog controls')

    expect(document.activeElement).toBe(closeButton)
    closeButton.click()
    dialog.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }))

    expect(close).toHaveBeenCalledTimes(2)
  })
})

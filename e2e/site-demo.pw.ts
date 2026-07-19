import process from 'node:process'
import { expect, test } from '@playwright/test'

const SITE_URL = process.env.SAIER_SITE_E2E_URL ?? 'http://127.0.0.1:8090'

/**
 * The Nuxt site's index page sets up its own painter (separate bootstrap from
 * examples/vue). It was broken on v8 — it never called `init()`, so the UI
 * rendered against an uninitialised renderer. Same proof as the examples spec:
 * `__PIXI_APP__.renderer` exists only after `await app.init()` completes.
 */
test('site demo boots the Pixi v8 painter without throwing', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.addInitScript(() => localStorage.setItem('saier:color-mode', 'light'))

  await page.goto(`${SITE_URL}/`)

  await expect
    .poll(
      () => page.evaluate(() => {
        const app = (globalThis as any).__PIXI_APP__
        return Boolean(app && app.renderer)
      }),
      { timeout: 20_000, message: 'site: Pixi app.renderer should exist after await app.init()' },
    )
    .toBe(true)

  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return c ? { w: c.width, h: c.height } : null
  })
  expect(size, 'site: a <canvas> should be present').not.toBeNull()
  expect(size!.w).toBeGreaterThan(0)

  const appearance = await page.evaluate(() => {
    const app = (globalThis as any).__PIXI_APP__
    const canvas = document.querySelector<HTMLCanvasElement>('.site-painter__canvas-host canvas')
    return {
      canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : null,
      rendererBackgroundAlpha: app?.renderer?.background?.alpha,
      rendererBackgroundColor: app?.renderer?.background?.color?.toHex?.(),
    }
  })
  expect(appearance.rendererBackgroundAlpha).toBe(1)
  expect(appearance.rendererBackgroundColor).toBe('#d8dce2')
  expect(appearance.canvasBackground).toBe('rgb(216, 220, 226)')

  const toolbarLayout = await page.evaluate(() => {
    const toolSwitcher = document.querySelector<HTMLElement>('.painter-tool-switcher')
    const stabilizer = document.querySelector<HTMLElement>('.site-toolbar__stabilizer')
    const primaryToolbar = document.querySelector<HTMLElement>('.site-toolbar')
    const replayToolbar = document.querySelector<HTMLElement>('.site-stroke-replay')
    if (!toolSwitcher || !stabilizer || !primaryToolbar || !replayToolbar)
      return null

    return {
      primaryRight: primaryToolbar.getBoundingClientRect().right,
      replayLeft: replayToolbar.getBoundingClientRect().left,
      stabilizerLeft: stabilizer.getBoundingClientRect().left,
      toolSwitcherRight: toolSwitcher.getBoundingClientRect().right,
    }
  })
  expect(toolbarLayout).not.toBeNull()
  expect(toolbarLayout!.toolSwitcherRight).toBeLessThanOrEqual(toolbarLayout!.stabilizerLeft)
  expect(toolbarLayout!.primaryRight).toBeLessThanOrEqual(toolbarLayout!.replayLeft)

  const initialViewport = page.viewportSize()!
  await page.setViewportSize({ width: 900, height: initialViewport.height })
  const compactToolbarLayout = await page.evaluate(() => {
    const toolbar = document.querySelector<HTMLElement>('.site-painter-toolbar-stack')
    const finalGroup = toolbar?.lastElementChild as HTMLElement | null
    if (!toolbar || !finalGroup)
      return null

    toolbar.scrollLeft = toolbar.scrollWidth
    return {
      finalGroupRight: finalGroup.getBoundingClientRect().right,
      scrollable: toolbar.scrollWidth > toolbar.clientWidth,
      toolbarRight: toolbar.getBoundingClientRect().right,
    }
  })
  expect(compactToolbarLayout).not.toBeNull()
  expect(compactToolbarLayout!.scrollable).toBe(true)
  expect(compactToolbarLayout!.finalGroupRight).toBeLessThanOrEqual(compactToolbarLayout!.toolbarRight + 1)
  await page.setViewportSize(initialViewport)

  const themeTrigger = page.locator('.site-theme-switcher__trigger')
  await expect(themeTrigger).toBeVisible()
  const triggerBounds = await themeTrigger.boundingBox()
  expect(triggerBounds?.x).toBeGreaterThan(640)
  expect(triggerBounds?.y).toBeLessThan(50)

  await themeTrigger.click()
  await expect(page.locator('[data-theme-preference]')).toHaveCount(3)
  await page.locator('[data-theme-preference="dark"]').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(themeTrigger).toHaveAttribute('aria-label', /Dark$/)
  await expect.poll(() => page.evaluate(() => {
    const app = (globalThis as any).__PIXI_APP__
    const canvas = document.querySelector<HTMLCanvasElement>('.site-painter__canvas-host canvas')
    return {
      canvasBackground: canvas ? getComputedStyle(canvas).backgroundColor : null,
      rendererBackgroundAlpha: app?.renderer?.background?.alpha,
      rendererBackgroundColor: app?.renderer?.background?.color?.toHex?.(),
    }
  })).toEqual({
    canvasBackground: 'rgb(40, 42, 46)',
    rendererBackgroundAlpha: 1,
    rendererBackgroundColor: '#282a2e',
  })

  const bootThrows = pageErrors.filter(m =>
    /resolution|renderer|background|reading '|app\.init/i.test(m),
  )
  expect(bootThrows, `site bootstrap threw:\n${bootThrows.join('\n')}`).toEqual([])
})

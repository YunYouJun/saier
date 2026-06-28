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

  const bootThrows = pageErrors.filter(m =>
    /resolution|renderer|background|reading '|app\.init/i.test(m),
  )
  expect(bootThrows, `site bootstrap threw:\n${bootThrows.join('\n')}`).toEqual([])
})

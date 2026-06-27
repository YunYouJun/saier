import { expect, test } from '@playwright/test'

/**
 * P0-02 regression: on Pixi v8, `createPainter()` used to throw at runtime
 * because the constructor read `app.renderer.resolution` before
 * `await app.init()` created the renderer.
 *
 * The example creates the painter with `debug: true`, which sets
 * `globalThis.__PIXI_APP__ = app` only AFTER `await app.init()` completes.
 * So `__PIXI_APP__.renderer` being truthy proves the async bootstrap ran
 * to completion without throwing.
 */
test('createPainter()/init() boot the Pixi v8 app without throwing', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(e.message))

  await page.goto('/')

  // primary proof: renderer exists => `await app.init()` finished
  await expect
    .poll(
      () => page.evaluate(() => {
        const app = (globalThis as any).__PIXI_APP__
        return Boolean(app && app.renderer)
      }),
      { timeout: 15_000, message: 'Pixi app.renderer should exist after await app.init()' },
    )
    .toBe(true)

  // a <canvas> is actually rendered and sized
  const size = await page.evaluate(() => {
    const c = document.querySelector('canvas')
    return c ? { w: c.width, h: c.height } : null
  })
  expect(size, 'a <canvas> should be present').not.toBeNull()
  expect(size!.w).toBeGreaterThan(0)
  expect(size!.h).toBeGreaterThan(0)

  // the specific regression: nothing thrown during bootstrap
  const bootThrows = pageErrors.filter(m =>
    /resolution|renderer|Cannot read prop|reading '|app\.init/i.test(m),
  )
  expect(bootThrows, `bootstrap threw:\n${bootThrows.join('\n')}`).toEqual([])
})

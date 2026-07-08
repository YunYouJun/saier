import process from 'node:process'
import { expect, test } from '@playwright/test'

const SITE_URL = process.env.SAIER_SITE_E2E_URL ?? 'http://127.0.0.1:8090'

test('site cloud room command opens the backend-gated room dialog', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(e.message))

  await page.goto(`${SITE_URL}/`)

  await expect
    .poll(
      () => page.evaluate(() => {
        const app = (globalThis as any).__PIXI_APP__
        return Boolean(app && app.renderer)
      }),
      { timeout: 20_000, message: 'site: Pixi app.renderer should exist before toolbar interaction' },
    )
    .toBe(true)

  const cloudRoomButton = page.locator('button[title="Cloud room..."]')
  await expect(cloudRoomButton).toBeVisible()
  await expect(cloudRoomButton).toBeEnabled()
  await cloudRoomButton.click()

  const dialog = page.getByRole('dialog', { name: 'Cloud room' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('Requires the saier-room-api backend.')).toBeVisible()
  await expect(dialog.getByText('Sign in with YunLeFun to use cloud rooms.')).toBeVisible()

  const bootThrows = pageErrors.filter(m =>
    /resolution|renderer|Cannot read prop|reading '|app\.init/i.test(m),
  )
  expect(bootThrows, `site bootstrap threw:\n${bootThrows.join('\n')}`).toEqual([])
})

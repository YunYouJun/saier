import process from 'node:process'
import { expect, test } from '@playwright/test'

const SITE_URL = process.env.SAIER_SITE_E2E_URL ?? 'http://127.0.0.1:8090'

test('shodo demo draws with the core CalligraphyEngine bridge', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(e.message))

  await page.goto(`${SITE_URL}/shodo`)
  const canvas = page.locator('canvas').first()
  await expect(canvas).toBeVisible({ timeout: 20_000 })

  const before = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())
  const box = await canvas.boundingBox()
  expect(box, 'shodo canvas should have a layout box').not.toBeNull()

  await page.mouse.move(box!.x + 40, box!.y + 40)
  await page.mouse.down()
  await page.mouse.move(box!.x + 100, box!.y + 52, { steps: 8 })
  await page.mouse.up()
  await page.waitForTimeout(100)

  const after = await canvas.evaluate((node: HTMLCanvasElement) => node.toDataURL())

  expect(after).not.toBe(before)
  expect(pageErrors).toEqual([])
})

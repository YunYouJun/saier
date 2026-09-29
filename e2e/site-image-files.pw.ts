import type { Download, Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { expect, test } from '@playwright/test'

const SITE_URL = process.env.SAIER_SITE_E2E_URL ?? 'http://127.0.0.1:8090'

async function artwork(page: Page): Promise<Buffer> {
  const data = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 1200
    canvas.height = 800
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#d8ebef'
    ctx.fillRect(0, 0, 900, 800)
    ctx.fillStyle = '#447889'
    ctx.beginPath()
    ctx.moveTo(0, 800)
    ctx.lineTo(330, 200)
    ctx.lineTo(720, 800)
    ctx.fill()
    return canvas.toDataURL().split(',')[1]!
  })
  return Buffer.from(data, 'base64')
}

async function importFromPicker(page: Page, buffer: Buffer): Promise<void> {
  const chooser = page.waitForEvent('filechooser')
  await page.getByTitle('Open image…', { exact: true }).click()
  await (await chooser).setFiles({ name: 'mountain.png', mimeType: 'image/png', buffer })
  await expect(page.getByRole('dialog', { name: 'Open or place image' })).toBeHidden()
  await expect(page.locator('.site-workspace-tabs')).toContainText('mountain.png')
}

async function downloadPixels(page: Page, download: Download): Promise<{ width: number, height: number, alpha: number, green: number }> {
  const bytes = await readFile((await download.path())!)
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:application/octet-stream;base64,${base64}`)).blob()
    const bitmap = await createImageBitmap(blob)
    const canvas = document.createElement('canvas')
    canvas.width = bitmap.width
    canvas.height = bitmap.height
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(bitmap, 0, 0)
    const pixel = ctx.getImageData(bitmap.width - 10, 10, 1, 1).data
    bitmap.close()
    return { width: canvas.width, height: canvas.height, alpha: pixel[3]!, green: pixel[1]! }
  }, bytes.toString('base64'))
}

test.beforeEach(async ({ page }) => {
  await page.goto(SITE_URL)
  await expect(page.getByTitle('Open image…', { exact: true })).toBeEnabled({ timeout: 20000 })
})

test('original-size opening, transparent PNG and JPEG download', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await importFromPicker(page, await artwork(page))
  await page.getByTitle('Export image…', { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export image', exact: true })
  await expect(dialog).toContainText('1200 × 800 px')
  if (process.env.SAIER_QA_SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SAIER_QA_SCREENSHOT_DIR}/image-export-desktop.png` })
  let event = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  const png = await event
  expect(png.suggestedFilename()).toBe('mountain.png')
  expect(await downloadPixels(page, png)).toMatchObject({ width: 1200, height: 800, alpha: 0 })
  await expect(dialog).toBeHidden()

  await page.getByTitle('Export image…', { exact: true }).click()
  await dialog.getByRole('combobox', { name: 'Format', exact: true }).selectOption('jpeg')
  await dialog.getByLabel('Background color').fill('#00ff00')
  event = page.waitForEvent('download')
  await dialog.getByRole('button', { name: 'Download', exact: true }).click()
  const jpeg = await event
  expect(jpeg.suggestedFilename()).toBe('mountain.jpg')
  expect(await downloadPixels(page, jpeg)).toMatchObject({ width: 1200, height: 800, alpha: 255 })
  expect((await downloadPixels(page, jpeg)).green).toBeGreaterThan(240)
  expect(errors).toEqual([])
})

test('drop and paste offer explicit placement; Escape and text focus preserve the document', async ({ page }) => {
  const buffer = await artwork(page)
  await importFromPicker(page, buffer)
  await page.evaluate((base64) => {
    const bytes = Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'signature.png', { type: 'image/png' }))
    document.querySelector('canvas')!.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: data }))
  }, buffer.toString('base64'))
  const dialog = page.getByRole('dialog', { name: 'Open or place image' })
  await expect(dialog).toContainText('signature.png')
  await dialog.getByRole('button', { name: 'Place as a layer', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.site-workspace-tabs')).not.toContainText('signature.png')
  await page.evaluate((base64) => {
    const data = new DataTransfer()
    data.items.add(new File([Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))], 'paste.png', { type: 'image/png' }))
    window.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }))
  }, buffer.toString('base64'))
  await expect(dialog).toContainText('paste.png')
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(page.locator('.site-workspace-tabs')).not.toContainText('paste.png')
  await page.getByTitle('Export image…', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: 'Export image', exact: true })).toContainText('1200 × 800 px')
  await page.getByLabel('File name').focus()
  await page.evaluate((base64) => {
    const data = new DataTransfer()
    data.items.add(new File([Uint8Array.from(atob(base64), ch => ch.charCodeAt(0))], 'ignored.png', { type: 'image/png' }))
    document.activeElement!.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, clipboardData: data }))
  }, buffer.toString('base64'))
  await expect(dialog).toBeHidden()
})

test('mobile export stays within the viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await importFromPicker(page, await artwork(page))
  await page.getByTitle('Export image…', { exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Export image', exact: true })
  await expect(dialog.getByRole('button', { name: 'Download', exact: true })).toBeVisible()
  const bounds = await dialog.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390)
  if (process.env.SAIER_QA_SCREENSHOT_DIR)
    await page.screenshot({ path: `${process.env.SAIER_QA_SCREENSHOT_DIR}/image-export-mobile.png` })
})

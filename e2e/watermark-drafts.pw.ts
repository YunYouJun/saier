import type { Page } from '@playwright/test'
import { Buffer } from 'node:buffer'
import { readFile } from 'node:fs/promises'
import process from 'node:process'
import { expect, test } from '@playwright/test'

test.use({ baseURL: process.env.SAIER_SITE_E2E_URL ?? 'http://127.0.0.1:8090', viewport: { width: 1440, height: 1000 } })
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('saier:locale', 'zh')
    localStorage.setItem('saier:color-mode', 'light')
    if (!localStorage.getItem('saier:editor-plugins:v1'))
      localStorage.setItem('saier:editor-plugins:v1', '["watermark"]')
  })
  await page.goto('/')
  await expect(page.getByLabel('Saier 主画布', { exact: true })).toBeVisible({ timeout: 30000 })
})

async function openFixture(page: Page, name: string) {
  const bytes = await readFile('site/public/pwa-192x192.png')
  const source = `data:image/png;base64,${bytes.toString('base64')}`
  const file = {
    format: 'saier.watermark-workfile',
    version: 1,
    artwork: source,
    preset: { format: 'saier.watermark-preset', version: 1, name, rules: '保护主体', assets: [
      { id: 'heart', role: 'heart-signature', width: 192, height: 192, enabled: true, recolorable: true, source },
      { id: 'tile', role: 'repeated-watermark', width: 192, height: 192, enabled: true, recolorable: true, source, blendMode: 'linear-light' },
    ] },
    analysis: { regions: [{ label: 'face', x: 0.4, y: 0.2, width: 0.2, height: 0.2 }], warnings: [], placements: [
      { assetId: 'heart', x: 0.2, y: 0.3, width: 0.2, rotation: 0, opacity: 0.7, color: '#304050' },
      { assetId: 'tile', x: 0, y: 0, width: 0.15, rotation: 0, opacity: 0.2, color: '#888888' },
    ] },
  }
  await page.getByLabel('打开水印工作文件', { exact: true }).setInputFiles({ name: 'workfile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(file)) })
  await expect(page.getByRole('button', { name: '下载 PNG', exact: true })).toBeEnabled()
  return file
}

async function download(page: Page, name: string): Promise<Buffer> {
  const event = page.waitForEvent('download')
  await page.getByRole('button', { name, exact: true }).click()
  return readFile((await (await event).path())!)
}

async function saved(page: Page) {
  await expect(page.getByRole('region', { name: '水印本地草稿', exact: true }).getByText('已保存到本机', { exact: true })).toBeVisible()
}

async function editColor(page: Page, color: string) {
  await page.getByLabel('图层颜色', { exact: true }).fill(color)
  await page.getByLabel('图层颜色', { exact: true }).dispatchEvent('change')
}

test('restores two independent workfiles, selected layer and identical full-resolution PNGs after reload', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openFixture(page, '作品 A')
  await page.getByRole('button', { name: '选择图层 满屏小字与图案（线性光）', exact: true }).click()
  await editColor(page, '#cc8844')
  await saved(page)
  const first = JSON.parse((await download(page, '保存水印工作文件')).toString())
  const firstPng = await download(page, '下载 PNG')
  await page.screenshot({ path: test.info().outputPath('01-saved.png') })
  await openFixture(page, '作品 B')
  await editColor(page, '#4466aa')
  const second = JSON.parse((await download(page, '保存水印工作文件')).toString())
  const secondPng = await download(page, '下载 PNG')
  // Switch before the debounce fires: A's state must never replace B's snapshot.
  const tabs = page.locator('.site-workspace-tabs').getByRole('tab')
  await tabs.nth(1).click()
  await page.getByRole('button', { name: '立即保存草稿', exact: true }).click()
  await saved(page)
  await tabs.nth(2).click()
  await saved(page)
  // Startup recovery remains discoverable even if the plugin panel was closed.
  await page.getByRole('menuitem', { name: '插件', exact: true }).click()
  await page.getByRole('menuitemcheckbox', { name: '水印', exact: true }).click()
  await page.keyboard.press('Escape')
  await page.reload()
  const recovery = page.getByRole('region', { name: '水印本地草稿', exact: true })
  await expect(recovery.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(2)
  await page.screenshot({ path: test.info().outputPath('02-recovery.png') })
  await recovery.getByRole('listitem').filter({ hasText: '作品 A' }).getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(page.getByLabel('图层颜色', { exact: true })).toHaveValue('#cc8844')
  expect(JSON.parse((await download(page, '保存水印工作文件')).toString())).toEqual(first)
  expect(await download(page, '下载 PNG')).toEqual(firstPng)
  await recovery.getByRole('listitem').filter({ hasText: '作品 B' }).getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(page.getByLabel('图层颜色', { exact: true })).toHaveValue('#4466aa')
  expect(JSON.parse((await download(page, '保存水印工作文件')).toString())).toEqual(second)
  expect(await download(page, '下载 PNG')).toEqual(secondPng)
  await page.screenshot({ path: test.info().outputPath('03-restored.png') })
  // Discard is explicit and does not destroy the open artwork or recreate on reload.
  await recovery.getByRole('button', { name: '丢弃本地草稿', exact: true }).click()
  await recovery.getByRole('button', { name: '确认丢弃', exact: true }).click()
  await expect(recovery.getByText('本地草稿已丢弃；再次编辑后自动保存', { exact: true })).toBeVisible()
  expect(await download(page, '下载 PNG')).toEqual(secondPng)
  await page.reload()
  await expect(recovery.getByRole('listitem')).toHaveCount(1)
  await expect(recovery.getByRole('listitem')).toContainText('作品 A')
  expect(errors).toEqual([])
})

test('keeps the previous saved version after quota failure, supports retry and explicit corrupt-draft discard', async ({ page }) => {
  await openFixture(page, '失败保护')
  await saved(page)
  const before = await download(page, '下载 PNG')
  await page.evaluate(() => {
    const original = IDBDatabase.prototype.transaction
    IDBDatabase.prototype.transaction = function (...args: Parameters<typeof original>) {
      if (this.name === 'saier-watermark-drafts' && args[1] === 'readwrite')
        throw new DOMException('simulated full disk', 'QuotaExceededError')
      return original.apply(this, args)
    }
  })
  await editColor(page, '#ee3322')
  await expect(page.getByText('本地草稿保存失败', { exact: true })).toBeVisible()
  await expect(page.getByRole('region', { name: '水印本地草稿', exact: true })).toContainText('本地存储空间不足')
  await page.screenshot({ path: test.info().outputPath('04-save-failed.png') })
  await page.getByRole('button', { name: '重试保存草稿', exact: true }).click()
  await expect(page.getByText('本地草稿保存失败', { exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(page.getByLabel('图层颜色', { exact: true })).toHaveValue('#304050')
  expect(await download(page, '下载 PNG')).toEqual(before)
  await editColor(page, '#112233')
  await saved(page)
  // Both generations damaged: don't open a partial document or silently erase it.
  await page.evaluate(async () => {
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('saier-watermark-drafts', 1)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('documents', 'readwrite')
        const store = tx.objectStore('documents')
        const get = store.getAll()
        get.onsuccess = () => {
          for (const record of get.result)
            store.put({ id: record.id })
        }
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onerror = () => reject(tx.error)
      }
    })
  })
  await page.reload()
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click()
  await expect(page.getByText('草稿已损坏或版本不受支持，无法恢复。可丢弃此草稿并打开已下载的工作文件。', { exact: true })).toBeVisible()
  await expect(page.locator('.site-workspace-tabs').getByRole('tab')).toHaveCount(1)
  await page.getByRole('button', { name: '丢弃草稿', exact: true }).click()
  await page.getByRole('button', { name: '确认丢弃', exact: true }).click()
  await expect(page.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: '恢复草稿', exact: true })).toHaveCount(0)
})

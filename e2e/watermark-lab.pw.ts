import { Buffer } from 'node:buffer'
import { expect, test } from '@playwright/test'

test('composes a watermark locally, displays analysis regions and downloads a PNG', async ({ page }) => {
  await page.goto('/watermark-lab')
  await expect(page.getByRole('heading', { name: '水印 · 智能布局测试' })).toBeVisible()
  const image = 'site/public/pwa-192x192.png'
  await page.getByLabel('画作', { exact: true }).setInputFiles(image)
  await page.getByLabel('水印素材').setInputFiles(image)
  await page.getByLabel('本机配对码').fill('test-pairing-code')
  let calls = 0
  await page.route('http://127.0.0.1:47831/analyze', async (route) => {
    calls++
    const input = route.request().postDataJSON()
    expect(input.image).toMatch(/^data:image\/png;base64,/)
    expect(input.snapshot.sha256).toMatch(/^[a-f0-9]{64}$/)
    await route.fulfill({
      json: {
        snapshot: input.snapshot,
        analysis: { regions: [{ label: '角色脸部（测试）', x: 0.3, y: 0.1, width: 0.3, height: 0.4 }], warnings: [] },
        threadId: 'test-thread',
      },
    })
  })
  await page.getByRole('button', { name: '识别保护区域' }).click()
  await expect(page.getByRole('list', { name: '保护区域' })).toContainText('角色脸部（测试）')
  expect(calls).toBe(1)
  const previewBeforeTint = await page.getByAltText('水印合成预览').getAttribute('src')
  await page.getByRole('button', { name: '根据背景推荐颜色与透明度' }).click()
  await expect(page.getByRole('checkbox', { name: '单色水印换色' })).toBeChecked()
  await expect(page.getByLabel('水印颜色')).toHaveValue(/^#[a-f0-9]{6}$/)
  await expect.poll(() => page.getByAltText('水印合成预览').getAttribute('src')).not.toBe(previewBeforeTint)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 PNG' }).click()
  expect((await download).suggestedFilename()).toBe('saier-watermarked.png')
  await page.getByLabel('分析方式').selectOption('manual')
  await expect(page.getByRole('list', { name: '保护区域' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '下载 PNG' })).toBeEnabled()
})

test('rejects late results after rules change', async ({ page }) => {
  await page.goto('/watermark-lab')
  await page.getByLabel('画作', { exact: true }).setInputFiles('site/public/pwa-192x192.png')
  await page.getByLabel('本机配对码').fill('test-pairing-code')
  let reply: (() => Promise<void>) | undefined
  await page.route('http://127.0.0.1:47831/analyze', async (route) => {
    const snapshot = route.request().postDataJSON().snapshot
    await new Promise<void>((resolve) => {
      reply = async () => {
        await route.fulfill({ json: { snapshot, analysis: { regions: [{ label: 'stale-face', x: 0, y: 0, width: 0.5, height: 0.5 }], warnings: [] } } })
        resolve()
      }
    })
  })
  await page.getByRole('button', { name: '识别保护区域' }).click()
  await expect.poll(() => Boolean(reply)).toBe(true)
  await page.getByLabel('避让规则').fill('只保护签名')
  await reply!()
  await expect(page.getByRole('button', { name: '识别保护区域' })).toBeVisible()
  await expect(page.getByText('stale-face')).toHaveCount(0)
})

test('opens a portable workfile in native Saier, edits layers, undoes, saves and applies the result', async ({ page }) => {
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile('site/public/pwa-192x192.png')
  const source = `data:image/png;base64,${bytes.toString('base64')}`
  const workfile = {
    format: 'saier.watermark-workfile',
    version: 1,
    artwork: source,
    preset: { format: 'saier.watermark-preset', version: 1, name: '可编辑水印', rules: '', assets: [{ id: 'heart', role: 'heart-signature', width: 192, height: 192, enabled: true, recolorable: true, source }] },
    analysis: { regions: [], warnings: [], placements: [{ assetId: 'heart', x: 0.2, y: 0.3, width: 0.2, rotation: 0, opacity: 0.7, color: '#304050' }] },
  }
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/watermark-lab')
  await page.getByLabel('打开水印工作文件', { exact: true }).setInputFiles({ name: 'workfile.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(workfile)) })
  const workspace = page.getByRole('region', { name: 'Saier 水印工作台', exact: true })
  await expect(workspace).toBeVisible()
  await expect(page.getByRole('button', { name: '下载原尺寸 PNG', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: '选择图层 心形签名', exact: true }).click()
  await expect(page.getByLabel('图层宽度 %', { exact: true })).toHaveValue('20')
  const editorCanvas = page.getByLabel('Saier 图层编辑画布', { exact: true })
  const view = (await editorCanvas.boundingBox())!
  const centerX = view.x + view.width / 2 + (0.3 - 0.5) * 192
  const centerY = view.y + view.height / 2 + (0.4 - 0.5) * 192
  await page.mouse.move(centerX, centerY)
  await page.mouse.down()
  await page.mouse.move(centerX + 12, centerY + 6, { steps: 3 })
  await page.mouse.up()
  await expect.poll(async () => Number(await page.getByLabel('图层 X %', { exact: true }).inputValue())).toBeGreaterThan(20)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByLabel('图层 X %', { exact: true })).toHaveValue('20')
  await editorCanvas.focus()
  await editorCanvas.press('ArrowUp')
  await expect.poll(async () => Number(await page.getByLabel('图层 Y %', { exact: true }).inputValue())).toBeLessThan(30)
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await page.getByRole('button', { name: '缩小为 70%', exact: true }).click()
  await expect(page.getByLabel('图层宽度 %', { exact: true })).toHaveValue('14')
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByLabel('图层宽度 %', { exact: true })).toHaveValue('20')
  await page.getByRole('button', { name: '重做', exact: true }).click()
  await expect(page.getByLabel('图层宽度 %', { exact: true })).toHaveValue('14')
  await page.getByLabel('图层颜色', { exact: true }).fill('#445566')
  await page.getByLabel('图层颜色', { exact: true }).dispatchEvent('change')
  const saved = page.waitForEvent('download')
  await page.getByRole('button', { name: '保存工作文件', exact: true }).click()
  const savedFile = await saved
  const savedPath = await savedFile.path()
  const savedData = JSON.parse(await readFile(savedPath!, 'utf8'))
  expect(savedData.analysis.placements[0].width).toBeCloseTo(0.14)
  expect(savedData.analysis.placements[0].color).toBe('#445566')
  expect(savedData.preset.assets[0].source).toBe(source)
  expect(savedData.artwork).toMatch(/^data:image\/png;base64,/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载原尺寸 PNG', exact: true }).click()
  const png = await readFile((await (await download).path())!)
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([192, 192])
  const psdDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载分层 PSD', exact: true }).click()
  const psd = await readFile((await (await psdDownload).path())!)
  expect(psd.toString('ascii', 0, 4)).toBe('8BPS')
  expect([psd.readUInt32BE(18), psd.readUInt32BE(14)]).toEqual([192, 192])
  await page.getByRole('button', { name: '应用调整', exact: true }).click()
  await expect(workspace).toHaveCount(0)
  await expect(page.getByLabel('宽度 %', { exact: true })).toHaveValue('14')
  await page.getByRole('button', { name: '在 Saier 工作台编辑图层', exact: true }).click()
  await expect(page.getByRole('button', { name: '下载原尺寸 PNG', exact: true })).toBeEnabled()
  await expect(page.getByLabel('图层颜色', { exact: true })).toHaveValue('#445566')
  expect(errors).toEqual([])
})

test('imports a whole preset, applies AI placements, edits them and retains manual edits across analysis preferences', async ({ page }) => {
  await page.goto('/watermark-lab')
  const { readFile } = await import('node:fs/promises')
  const bytes = await readFile('site/public/pwa-192x192.png')
  const source = `data:image/png;base64,${bytes.toString('base64')}`
  const asset = { role: 'small-seal', width: 192, height: 192, enabled: true, recolorable: true, source }
  const preset = { format: 'saier.watermark-preset', version: 1, name: '双签名预设', rules: 'avoid faces', assets: [{ ...asset, id: 'a' }, { ...asset, id: 'b' }] }
  await page.getByLabel('画作', { exact: true }).setInputFiles('site/public/pwa-192x192.png')
  await page.getByRole('button', { name: '整套水印预设', exact: true }).setInputFiles({ name: 'test.saier-watermarks.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(preset)) })
  await expect(page.getByText('双签名预设')).toBeVisible()
  await page.getByLabel('本机配对码').fill('fixture')
  let count = 0
  await page.route('http://127.0.0.1:47831/analyze', async (route) => {
    const request = route.request().postDataJSON()
    expect(request.preset.assets).toHaveLength(2)
    expect(JSON.stringify(request.preset)).not.toContain('data:image')
    count++
    await route.fulfill({ json: { snapshot: request.snapshot, analysis: { regions: [{ label: 'center face', x: 0.35, y: 0.35, width: 0.3, height: 0.3 }], warnings: [], placements: ['a', 'b'].map((assetId, i) => ({ assetId, x: 0.05 + 0.7 * i, y: 0.75, width: 0.2, rotation: 0, opacity: 0.6, color: '#668fb8' })) } } })
  })
  await page.getByRole('button', { name: '分析并套用整套预设' }).click()
  await expect(page.locator('fieldset')).toHaveCount(2)
  const before = await page.getByAltText('水印合成预览').getAttribute('src')
  await page.getByLabel('X %', { exact: true }).first().fill('10')
  await page.getByLabel('X %', { exact: true }).first().press('Tab')
  await expect.poll(() => page.getByAltText('水印合成预览').getAttribute('src')).not.toBe(before)
  expect(count).toBe(1)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 PNG' }).click()
  expect((await download).suggestedFilename()).toBe('saier-watermarked.png')
  // Direct manipulation commits once on release; history restores the exact composition.
  const manual = await page.getByAltText('水印合成预览').getAttribute('src')
  const target = page.getByRole('button', { name: '选择水印 1 · 小印章', exact: true })
  await target.scrollIntoViewIfNeeded()
  const box = (await target.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 20, box.y + box.height / 2 - 10)
  await page.mouse.up()
  await expect.poll(() => page.getByAltText('水印合成预览').getAttribute('src')).not.toBe(manual)
  await page.getByRole('button', { name: '撤销调整' }).click()
  await expect(page.getByAltText('水印合成预览')).toHaveAttribute('src', manual!)
  await page.getByRole('button', { name: '重做调整' }).click()
  await expect.poll(() => page.getByAltText('水印合成预览').getAttribute('src')).not.toBe(manual)
  await page.getByRole('button', { name: '撤销调整' }).click()

  await page.getByRole('button', { name: '缩小为 70%' }).click()
  await expect(page.getByLabel('宽度 %', { exact: true })).toHaveValue('14')
  await page.getByRole('button', { name: '撤销调整' }).click()
  await expect(page.getByAltText('水印合成预览')).toHaveAttribute('src', manual!)
  const handle = page.getByRole('button', { name: '等比缩放选中水印' })
  await handle.scrollIntoViewIfNeeded()
  const corner = (await handle.boundingBox())!
  await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
  await page.mouse.down()
  await page.mouse.move(corner.x + corner.width / 2 - 5, corner.y + corner.height / 2 - 5)
  await page.mouse.up()
  await expect.poll(async () => Number(await page.getByLabel('宽度 %', { exact: true }).inputValue())).toBeLessThan(20)
  await page.getByRole('button', { name: '撤销调整' }).click()

  await target.focus()
  await target.press('ArrowUp')
  await expect(page.getByLabel('Y %', { exact: true })).toHaveValue('74.48')
  await target.press('Control+z')
  await expect(page.getByAltText('水印合成预览')).toHaveAttribute('src', manual!)
  await page.getByLabel('颜色', { exact: true }).fill('#304050')
  await page.getByLabel('颜色', { exact: true }).dispatchEvent('change')
  await expect.poll(() => page.getByAltText('水印合成预览').getAttribute('src')).not.toBe(manual)
  await page.getByRole('button', { name: '撤销调整' }).click()
  expect(count).toBe(1)
  await page.getByLabel('避让规则').fill('new rules')
  await expect(page.locator('fieldset')).toHaveCount(2)
  await expect(page.getByLabel('X %', { exact: true })).toHaveValue('10')
  await expect(page.getByRole('button', { name: '下载 PNG' })).toBeEnabled()
  await page.getByLabel('分析方式').selectOption('manual')
  await expect(page.getByAltText('水印合成预览')).toHaveAttribute('src', manual!)
  await page.getByRole('button', { name: '移除此处水印' }).click()
  await expect(page.locator('fieldset')).toHaveCount(1)
  await page.getByRole('button', { name: '撤销调整' }).click()
  await expect(page.getByAltText('水印合成预览')).toHaveAttribute('src', manual!)
  await page.getByRole('button', { name: '添加小印章' }).first().click()
  await expect(page.locator('fieldset')).toHaveCount(3)
  expect(count).toBe(1)
})

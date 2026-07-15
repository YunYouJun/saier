import type { BrowserContext, Locator, Page } from '@playwright/test'
import { createHash } from 'node:crypto'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { signedInYunlefunSitePage } from './fixtures/yunlefun-browser-session'
import { getYunlefunTestAccountCredentials } from './fixtures/yunlefun-test-accounts'

const SITE_URL = process.env.SAIER_SITE_E2E_URL ?? 'http://127.0.0.1:8090'
const YUNLEFUN_CLOUDBASE_ENV = process.env.NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV ?? 'yunlefun-8g7ybcxc7345c490'
const REAL_E2E_ENABLED = process.env.SAIER_E2E_YUNLEFUN_REAL === '1'

test.describe('Pictionary with real YunLeFun test accounts', () => {
  test.skip(!REAL_E2E_ENABLED, 'Set SAIER_E2E_YUNLEFUN_REAL=1 to run production CloudBase smoke tests.')
  test.use({ actionTimeout: 15_000 })
  test.setTimeout(240_000)

  test('plays a complete two-player game and syncs a thick committed stroke', async ({ browser }, testInfo) => {
    const ownerCredentials = getYunlefunTestAccountCredentials('owner', process.env)
    const viewerCredentials = getYunlefunTestAccountCredentials('viewer', process.env)
    if (!ownerCredentials || !viewerCredentials) {
      test.skip(true, 'Missing owner/viewer YunLeFun test account credentials.')
      return
    }

    const ownerContext = await browser.newContext({ viewport: { height: 900, width: 1440 } })
    const viewerContext = await browser.newContext({ viewport: { height: 900, width: 1440 } })

    try {
      const ownerPage = await signedInActivityPage(ownerContext, ownerCredentials)
      const viewerPage = await signedInActivityPage(viewerContext, viewerCredentials)
      const roomTitle = `Saier smoke Pictionary ${new Date().toISOString()}`
      const inviteUrl = await createPictionaryRoom(ownerPage, roomTitle)

      await viewerPage.goto(inviteUrl)
      await expect(viewerPage.locator('.room-lobby')).toBeVisible({ timeout: 90_000 })
      await expect(ownerPage.locator('.player-list li')).toHaveCount(2, { timeout: 90_000 })
      await expect(viewerPage.locator('.player-list li')).toHaveCount(2, { timeout: 90_000 })

      await ownerPage.locator('.lobby-settings select').first().selectOption('1')
      const startGame = ownerPage.getByRole('button', { name: '开始游戏' })
      await expect(startGame).toBeEnabled({ timeout: 30_000 })
      await startGame.click()

      for (let turn = 0; turn < 2; turn += 1) {
        const { answer, drawer, guesser } = await chooseCurrentWord(ownerPage, viewerPage)
        await expect(guesser.locator('.guess-bar input')).toBeVisible({ timeout: 30_000 })

        if (turn === 0)
          await drawAndVerifyThickStroke(drawer, guesser)

        await guesser.locator('.guess-bar input').fill(answer)
        await guesser.locator('.guess-bar').getByRole('button', { name: '猜' }).click()
        await expect(guesser.locator('.live-guess')).toContainText('猜对了！', { timeout: 30_000 })
        await expect(drawer.locator('.canvas-overlay.is-reveal h2')).toHaveText(answer, { timeout: 30_000 })
        await expect(guesser.locator('.canvas-overlay.is-reveal h2')).toHaveText(answer, { timeout: 30_000 })
      }

      await expect(ownerPage.getByText('FINAL SCORE')).toBeVisible({ timeout: 30_000 })
      await expect(viewerPage.getByText('FINAL SCORE')).toBeVisible({ timeout: 30_000 })
      await expect(ownerPage.locator('.scoreboard li')).toHaveCount(2)
      await expect(viewerPage.locator('.scoreboard li')).toHaveCount(2)

      const screenshotPath = testInfo.outputPath('pictionary-online-complete.png')
      await ownerPage.screenshot({ fullPage: true, path: screenshotPath })
      await testInfo.attach('pictionary-online-complete', { contentType: 'image/png', path: screenshotPath })
    }
    finally {
      await Promise.allSettled([ownerContext.close(), viewerContext.close()])
    }
  })
})

async function signedInActivityPage(
  context: BrowserContext,
  credentials: { password: string, username: string },
): Promise<Page> {
  return signedInYunlefunSitePage(context, credentials, {
    cloudbaseEnv: YUNLEFUN_CLOUDBASE_ENV,
    siteUrl: SITE_URL,
  })
}

async function createPictionaryRoom(page: Page, roomTitle: string): Promise<string> {
  await page.goto(`${SITE_URL}/?activity=pictionary`)
  await expect(page.getByRole('heading', { name: '你画，我猜。' })).toBeVisible({ timeout: 30_000 })
  const form = page.locator('.pictionary-card').first()
  await form.locator('input').fill(roomTitle)
  await form.locator('textarea').fill('苹果\n自行车\n城堡')
  await form.getByRole('button', { name: '创建并进入 Lobby' }).click()
  await expect(page.locator('.room-lobby')).toBeVisible({ timeout: 90_000 })
  await expect(page).toHaveURL(/[?&]activityRoom=sr_[\w-]+/u)
  return page.url()
}

async function chooseCurrentWord(ownerPage: Page, viewerPage: Page): Promise<{
  answer: string
  drawer: Page
  guesser: Page
}> {
  try {
    await expect
      .poll(
        () => readyPrivateWordControls(ownerPage, viewerPage),
        { message: 'the next drawer should receive candidates or the authoritative auto-selected answer', timeout: 30_000 },
      )
      .toBeGreaterThan(0)
  }
  catch (error) {
    const diagnostics = await Promise.all([
      privateWordDiagnostics(ownerPage),
      privateWordDiagnostics(viewerPage),
    ])
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${JSON.stringify(diagnostics, null, 2)}`)
  }
  const ownerCandidateCount = await ownerPage.locator('.candidate-list button').count()
  const ownerAnswerReady = await hasReadyDrawerAnswer(ownerPage)
  const ownerIsDrawer = ownerCandidateCount > 0 || ownerAnswerReady
  const drawer = ownerIsDrawer ? ownerPage : viewerPage
  const guesser = ownerIsDrawer ? viewerPage : ownerPage
  const candidate = drawer.locator('.candidate-list button').first()
  const hasCandidate = await candidate.count() > 0
  if (hasCandidate) {
    // The 10-second authoritative auto-choice may replace this button while
    // Playwright is preparing the click. Either path is valid; the private
    // projection below is the source of truth for the selected answer.
    await candidate.click({ timeout: 3_000 }).catch(() => undefined)
  }
  await expect
    .poll(() => hasReadyDrawerAnswer(drawer), { timeout: 20_000 })
    .toBe(true)
  const answer = ((await drawer.locator('.drawer-answer strong').textContent()) ?? '').trim()
  expect(answer).toBeTruthy()
  return { answer, drawer, guesser }
}

async function privateWordDiagnostics(page: Page): Promise<Record<string, unknown>> {
  return { ...await privateWordDomState(page), url: page.url() }
}

async function readyPrivateWordControls(ownerPage: Page, viewerPage: Page): Promise<number> {
  const [owner, viewer] = await Promise.all([
    privateWordDomState(ownerPage),
    privateWordDomState(viewerPage),
  ])
  return owner.candidateCount + viewer.candidateCount
    + Number(owner.drawerAnswerReady) + Number(viewer.drawerAnswerReady)
}

async function hasReadyDrawerAnswer(page: Page): Promise<boolean> {
  return (await privateWordDomState(page)).drawerAnswerReady
}

async function privateWordDomState(page: Page): Promise<{
  candidateCount: number
  drawerAnswerReady: boolean
  drawerAnswerVisible: boolean
  drawerAnswerWaiting: boolean
  guessInputVisible: boolean
  phase: string
  roomWarning: string
}> {
  return page.evaluate(() => {
    const drawerAnswer = document.querySelector<HTMLElement>('.drawer-answer')
    const drawerAnswerText = drawerAnswer?.querySelector('strong')?.textContent ?? ''
    return {
      candidateCount: document.querySelectorAll('.candidate-list button').length,
      drawerAnswerReady: Boolean(drawerAnswer && !/正在同步/u.test(drawerAnswerText)),
      drawerAnswerVisible: Boolean(drawerAnswer),
      drawerAnswerWaiting: /正在同步/u.test(drawerAnswerText),
      guessInputVisible: Boolean(document.querySelector('.guess-bar input')),
      phase: document.querySelector('.round-strip .room-kicker')?.textContent?.trim() ?? '',
      roomWarning: document.querySelector('.room-warning')?.textContent?.trim() ?? '',
    }
  })
}

async function drawAndVerifyThickStroke(drawer: Page, guesser: Page): Promise<void> {
  const size = drawer.getByRole('slider', { name: '画笔粗细' })
  await size.fill('64')
  await expect(drawer.locator('.drawing-size span')).toHaveText('粗细 64')

  const drawerCanvas = drawer.locator('.activity-canvas canvas').first()
  const guesserCanvas = guesser.locator('.activity-canvas canvas').first()
  const drawerBeforeHash = await canvasScreenshotHash(drawerCanvas)
  const guesserBeforeHash = await canvasScreenshotHash(guesserCanvas)
  const box = await drawerCanvas.boundingBox()
  if (!box)
    throw new Error('Drawer canvas has no visible bounding box.')

  await drawer.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.35)
  await drawer.mouse.down()
  await drawer.mouse.move(box.x + box.width * 0.72, box.y + box.height * 0.65, { steps: 18 })
  await drawer.mouse.up()

  await expect
    .poll(
      async () => {
        const drawerHash = await canvasScreenshotHash(drawerCanvas)
        const guesserHash = await canvasScreenshotHash(guesserCanvas)
        return drawerHash !== drawerBeforeHash && guesserHash !== guesserBeforeHash
      },
      { message: 'the committed stroke should become visible for both drawer and guesser', timeout: 45_000 },
    )
    .toBe(true)

  const drawerDarkPixels = await screenshotDarkPixelCount(drawer, drawerCanvas)
  const guesserDarkPixels = await screenshotDarkPixelCount(guesser, guesserCanvas)
  expect(drawerDarkPixels, 'drawer 64px stroke should occupy a visibly thick pixel area').toBeGreaterThan(2_000)
  expect(guesserDarkPixels, 'guesser replay should preserve the 64px stroke area').toBeGreaterThan(2_000)
  const relativePixelDifference = Math.abs(drawerDarkPixels - guesserDarkPixels) / drawerDarkPixels
  expect(relativePixelDifference, 'drawer and guesser stroke areas should stay within GPU raster tolerance').toBeLessThan(0.08)
}

async function canvasScreenshotHash(canvas: Locator): Promise<string> {
  return createHash('sha256').update(await canvas.screenshot()).digest('hex')
}

async function screenshotDarkPixelCount(page: Page, canvas: Locator): Promise<number> {
  const png = await canvas.screenshot()
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`
  return page.evaluate(async (source) => {
    const image = new Image()
    image.src = source
    await image.decode()
    const target = document.createElement('canvas')
    target.width = image.naturalWidth
    target.height = image.naturalHeight
    const context = target.getContext('2d', { willReadFrequently: true })
    if (!context)
      throw new Error('2D canvas is unavailable for screenshot verification.')
    context.drawImage(image, 0, 0)
    const pixels = context.getImageData(0, 0, target.width, target.height).data
    let dark = 0
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 180 && pixels[index + 1] < 180 && pixels[index + 2] < 180 && pixels[index + 3] > 0)
        dark += 1
    }
    return dark
  }, dataUrl)
}

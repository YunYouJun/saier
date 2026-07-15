import type { BrowserContext, Page } from '@playwright/test'
import process from 'node:process'
import { expect, test } from '@playwright/test'
import { signedInYunlefunSitePage } from './fixtures/yunlefun-browser-session'
import { getYunlefunTestAccountCredentials } from './fixtures/yunlefun-test-accounts'

const SITE_URL = process.env.SAIER_SITE_E2E_URL ?? 'http://127.0.0.1:8090'
const REAL_E2E_ENABLED = process.env.SAIER_E2E_YUNLEFUN_REAL === '1'
const YUNLEFUN_CLOUDBASE_ENV = process.env.NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV ?? 'yunlefun-8g7ybcxc7345c490'

interface SiteCloudRoomE2eLayerState {
  id: string
}

interface SiteCloudRoomE2eNoticeState {
  message?: string
  title: string
}

interface SiteCloudRoomE2eState {
  canvasHash: string
  headRevision: number
  layers: SiteCloudRoomE2eLayerState[]
  notices: SiteCloudRoomE2eNoticeState[]
  readOnly: boolean
}

type SiteCloudRoomE2eMethod = 'addLayer' | 'drawDab' | 'state' | 'syncNow' | 'tryReadOnlyAddLayer'

test.describe('site cloud room with real YunLeFun test accounts', () => {
  test.skip(!REAL_E2E_ENABLED, 'Set SAIER_E2E_YUNLEFUN_REAL=1 to run production CloudBase smoke tests.')
  test.setTimeout(150_000)

  test('syncs room snapshot, strokes, layer commands, read-only guards, and snapshot replay', async ({ browser }) => {
    const ownerCredentials = getYunlefunTestAccountCredentials('owner', process.env)
    const viewerCredentials = getYunlefunTestAccountCredentials('viewer', process.env)
    if (!ownerCredentials || !viewerCredentials) {
      test.skip(true, 'Missing owner/viewer YunLeFun test account credentials.')
      return
    }

    const ownerContext = await browser.newContext()
    const viewerContext = await browser.newContext()
    let restoredContext: BrowserContext | undefined

    try {
      const ownerPage = await signedInSitePage(ownerContext, ownerCredentials)
      const roomTitle = `Saier smoke ${new Date().toISOString()}`
      const shareUrl = await createCloudRoom(ownerPage, roomTitle)

      expect(shareUrl).toContain('room=')

      const viewerPage = await signedInSitePage(viewerContext, viewerCredentials)
      await joinCloudRoom(viewerPage, shareUrl, roomTitle)

      const ownerHasBridge = await hasSiteE2eBridge(ownerPage)
      const viewerHasBridge = await hasSiteE2eBridge(viewerPage)
      const bridgeRequired = /^(?:http:\/\/)?(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(SITE_URL)
      if (bridgeRequired) {
        expect(ownerHasBridge).toBe(true)
        expect(viewerHasBridge).toBe(true)
      }
      if (!ownerHasBridge || !viewerHasBridge)
        return

      await callSiteE2eBridge(ownerPage, 'drawDab', {
        b: 0,
        g: 0,
        r: 1,
        radius: 12,
        x: 48,
        y: 48,
      })
      await waitForSyncedCanvas(ownerPage, viewerPage, 1)

      const layerId = `e2e_layer_${Date.now()}`
      await callSiteE2eBridge(ownerPage, 'addLayer', layerId)
      await waitForLayer(viewerPage, layerId, 2)

      const blocked = await callSiteE2eBridge(viewerPage, 'tryReadOnlyAddLayer', 'viewer_blocked_layer')
      expect(blocked.readOnly).toBe(true)
      expect(blocked.layers.some(layer => layer.id === 'viewer_blocked_layer')).toBe(false)
      expect(blocked.notices.some(notice =>
        /read-only|只读/i.test(`${notice.title} ${notice.message ?? ''}`),
      )).toBe(true)

      const beforeBlockedStroke = await callSiteE2eBridge(viewerPage, 'state')
      const blockedStroke = await callSiteE2eBridge(viewerPage, 'drawDab', {
        b: 1,
        g: 0,
        r: 0,
        radius: 10,
        x: 72,
        y: 72,
      })
      expect(blockedStroke.headRevision).toBe(beforeBlockedStroke.headRevision)
      expect(blockedStroke.canvasHash).toBe(beforeBlockedStroke.canvasHash)
      expect(blockedStroke.notices.some(notice =>
        /read-only|只读/i.test(`${notice.title} ${notice.message ?? ''}`),
      )).toBe(true)

      restoredContext = await browser.newContext()
      const restoredPage = await signedInSitePage(restoredContext, ownerCredentials)
      await joinCloudRoom(restoredPage, shareUrl, roomTitle, {
        roleBadge: 'Owner',
        roleLabel: 'Owner',
      })
      await waitForSyncedCanvas(ownerPage, restoredPage, 2)
    }
    finally {
      await Promise.all([
        ownerContext.close(),
        viewerContext.close(),
        restoredContext?.close(),
      ])
    }
  })
})

async function signedInSitePage(context: BrowserContext, credentials: { password: string, username: string }): Promise<Page> {
  return signedInYunlefunSitePage(context, credentials, {
    cloudbaseEnv: YUNLEFUN_CLOUDBASE_ENV,
    siteUrl: SITE_URL,
  })
}

async function createCloudRoom(page: Page, title: string): Promise<string> {
  await openCloudRoomDialog(page)
  const dialog = page.getByRole('dialog', { name: 'Cloud room' })
  await expect(dialog.getByText('Sign in with YunLeFun to use cloud rooms.')).toHaveCount(0)

  await dialog.locator('.site-cloud-room__form').first().locator('input').fill(title)
  await dialog.getByRole('button', { name: 'Create room' }).click()

  const shareInput = dialog.locator('input[readonly]').first()
  await expect(shareInput).toHaveValue(/room=/, { timeout: 90_000 })
  await expect(dialog.getByText(title)).toBeVisible()
  await expect(dialog.locator('.site-cloud-room__room-title em')).toHaveText('Owner')

  return shareInput.inputValue()
}

async function joinCloudRoom(
  page: Page,
  shareUrl: string,
  title: string,
  options: { roleBadge: string, roleLabel: string } = {
    roleBadge: 'Read-only',
    roleLabel: 'Viewer',
  },
): Promise<void> {
  await openCloudRoomDialog(page)
  const dialog = page.getByRole('dialog', { name: 'Cloud room' })
  await expect(dialog.getByText('Sign in with YunLeFun to use cloud rooms.')).toHaveCount(0)

  await dialog.locator('.site-cloud-room__form').nth(1).locator('input').fill(shareUrl)
  await dialog.getByRole('button', { name: 'Join room' }).click()

  await expect(dialog.getByText(title)).toBeVisible({ timeout: 90_000 })
  await expect(dialog.locator('.site-cloud-room__room-title em')).toHaveText(options.roleBadge)
  await expect(dialog.locator('.site-cloud-room__member small', { hasText: options.roleLabel }).first()).toBeVisible()
}

async function openCloudRoomDialog(page: Page): Promise<void> {
  const cloudRoomButton = page.locator('button[title="Cloud room..."]')
  await expect(cloudRoomButton).toBeVisible()
  await expect(cloudRoomButton).toBeEnabled()
  await cloudRoomButton.click()

  await expect(page.getByRole('dialog', { name: 'Cloud room' })).toBeVisible()
}

async function hasSiteE2eBridge(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const bridge = (globalThis as Record<string, unknown>).__SAIER_SITE_E2E__
    return Boolean(bridge && typeof bridge === 'object')
  })
}

async function callSiteE2eBridge(
  page: Page,
  method: SiteCloudRoomE2eMethod,
  payload?: unknown,
): Promise<SiteCloudRoomE2eState> {
  return page.evaluate(
    async ({ method, payload }) => {
      const bridge = (globalThis as Record<string, unknown>).__SAIER_SITE_E2E__
      if (!bridge || typeof bridge !== 'object')
        throw new Error('Saier site e2e bridge is unavailable.')

      const bridgeRecord = bridge as Record<string, unknown>
      const fn = bridgeRecord[method]
      if (typeof fn !== 'function')
        throw new Error(`Saier site e2e bridge method is unavailable: ${method}`)

      return Reflect.apply(fn, bridge, payload === undefined ? [] : [payload]) as Promise<SiteCloudRoomE2eState>
    },
    { method, payload },
  )
}

async function waitForSyncedCanvas(ownerPage: Page, viewerPage: Page, minRevision: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const owner = await callSiteE2eBridge(ownerPage, 'syncNow')
        const viewer = await callSiteE2eBridge(viewerPage, 'syncNow')
        return owner.headRevision >= minRevision
          && viewer.headRevision >= minRevision
          && owner.canvasHash === viewer.canvasHash
      },
      { timeout: 90_000, message: `viewer should sync canvas at room revision >= ${minRevision}` },
    )
    .toBe(true)
}

async function waitForLayer(page: Page, layerId: string, minRevision: number): Promise<void> {
  await expect
    .poll(
      async () => {
        const state = await callSiteE2eBridge(page, 'syncNow')
        return state.headRevision >= minRevision
          && state.layers.some(layer => layer.id === layerId)
      },
      { timeout: 90_000, message: `viewer should receive layer command for ${layerId}` },
    )
    .toBe(true)
}

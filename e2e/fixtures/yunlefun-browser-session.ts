import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export interface YunlefunTestCredentials {
  password: string
  username: string
}

export interface SignedInYunlefunPageOptions {
  cloudbaseEnv: string
  siteUrl: string
  waitForPainter?: boolean
}

export async function signedInYunlefunSitePage(
  context: BrowserContext,
  credentials: YunlefunTestCredentials,
  options: SignedInYunlefunPageOptions,
): Promise<Page> {
  const page = await context.newPage()
  await page.goto(`${options.siteUrl}/`)
  if (options.waitForPainter !== false)
    await waitForPainterReady(page)
  await signInWithCloudbasePassword(page, credentials, options.cloudbaseEnv)
  await page.reload()
  if (options.waitForPainter !== false)
    await waitForPainterReady(page)

  await expect(page.locator('.site-account-button--signed-in')).toBeVisible({ timeout: 30_000 })
  return page
}

export async function waitForPainterReady(page: Page): Promise<void> {
  await expect
    .poll(
      () => page.evaluate(() => {
        const record = globalThis as Record<string, unknown>
        const app = record.__PIXI_APP__ && typeof record.__PIXI_APP__ === 'object'
          ? record.__PIXI_APP__ as Record<string, unknown>
          : undefined
        return Boolean(app?.renderer)
      }),
      { timeout: 30_000, message: 'site: Pixi app.renderer should exist before cloud room interaction' },
    )
    .toBe(true)
}

async function signInWithCloudbasePassword(
  page: Page,
  credentials: YunlefunTestCredentials,
  cloudbaseEnv: string,
): Promise<void> {
  const signedInUid = await page.evaluate(
    async ({ env, password, username }) => {
      function asBrowserRecord(value: unknown): Record<string, unknown> | undefined {
        return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
      }

      function stringifyBrowserError(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
      }

      const moduleUrls = [
        '/node_modules/.cache/vite/client/deps/@cloudbase_js-sdk.js',
        '/node_modules/.vite/deps/@cloudbase_js-sdk.js',
        '/_nuxt/node_modules/.cache/vite/client/deps/@cloudbase_js-sdk.js',
      ]
      const importErrors: string[] = []
      let cloudbaseModule: Record<string, unknown> | undefined

      for (const moduleUrl of moduleUrls) {
        try {
          cloudbaseModule = await import(moduleUrl) as Record<string, unknown>
          break
        }
        catch (error) {
          importErrors.push(`${moduleUrl}: ${stringifyBrowserError(error)}`)
        }
      }

      const globalRecord = globalThis as Record<string, unknown>
      const cloudbase = asBrowserRecord(cloudbaseModule?.default)
        ?? cloudbaseModule
        ?? asBrowserRecord(globalRecord.cloudbase)
      const init = typeof cloudbase?.init === 'function' ? cloudbase.init : undefined
      if (!init)
        throw new Error(`Unable to load @cloudbase/js-sdk in browser: ${importErrors.join('; ')}`)

      const app = asBrowserRecord(Reflect.apply(init, cloudbase, [{ env }]))
      const authFactory = typeof app?.auth === 'function' ? app.auth : undefined
      if (!authFactory)
        throw new Error('@cloudbase/js-sdk app.auth() is unavailable.')

      const auth = asBrowserRecord(Reflect.apply(authFactory, app, [{ persistence: 'local' }]))
      const signInWithPassword = typeof auth?.signInWithPassword === 'function'
        ? auth.signInWithPassword
        : undefined
      if (!signInWithPassword)
        throw new Error('@cloudbase/js-sdk auth.signInWithPassword() is unavailable.')

      await Reflect.apply(signInWithPassword, auth, [{ password, username }])
      const getLoginState = typeof auth.getLoginState === 'function'
        ? auth.getLoginState
        : undefined
      if (!getLoginState)
        throw new Error('@cloudbase/js-sdk auth.getLoginState() is unavailable.')

      const loginState = asBrowserRecord(await Reflect.apply(getLoginState, auth, []))
      const user = asBrowserRecord(loginState?.user)
      const uid = typeof user?.uid === 'string' ? user.uid : ''
      if (!uid)
        throw new Error(`CloudBase password sign-in did not produce a user for ${username}.`)

      return uid
    },
    {
      env: cloudbaseEnv,
      password: credentials.password,
      username: credentials.username,
    },
  )

  expect(signedInUid, `CloudBase password sign-in should return a uid for ${credentials.username}`).toBeTruthy()
}

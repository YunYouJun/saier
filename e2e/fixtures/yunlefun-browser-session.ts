import type { BrowserContext, Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect } from '@playwright/test'

const VITE_CLOUDBASE_DEPS_DIR = fileURLToPath(new URL('../../site/node_modules/.cache/vite/client/deps/', import.meta.url))
const SDK_PROXY_PATH = '/__saier_e2e_sdk/'

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
  const sdkModuleUrl = await installCloudbaseSdkProxy(context, options.siteUrl)
  const page = await context.newPage()
  await page.goto(`${options.siteUrl}/`)
  if (options.waitForPainter !== false)
    await waitForPainterReady(page)
  await signInWithCloudbasePassword(
    page,
    credentials,
    options.cloudbaseEnv,
    sdkModuleUrl,
  )
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
        const canvas = document.querySelector<HTMLCanvasElement>('.site-painter canvas')
        return Boolean(app?.renderer || (canvas && canvas.width > 0 && canvas.height > 0))
      }),
      { timeout: 30_000, message: 'site: Pixi app.renderer should exist before cloud room interaction' },
    )
    .toBe(true)
}

async function signInWithCloudbasePassword(
  page: Page,
  credentials: YunlefunTestCredentials,
  cloudbaseEnv: string,
  sdkModuleUrl: string,
): Promise<void> {
  const signedInUid = await page.evaluate(
    async ({ env, password, proxiedSdkModuleUrl, username }) => {
      function asBrowserRecord(value: unknown): Record<string, unknown> | undefined {
        return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
      }

      function stringifyBrowserError(error: unknown): string {
        return error instanceof Error ? error.message : String(error)
      }

      const moduleUrls = [
        proxiedSdkModuleUrl,
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
      proxiedSdkModuleUrl: sdkModuleUrl,
      username: credentials.username,
    },
  )

  expect(signedInUid, `CloudBase password sign-in should return a uid for ${credentials.username}`).toBeTruthy()
}

async function installCloudbaseSdkProxy(context: BrowserContext, siteUrl: string): Promise<string> {
  const origin = new URL(siteUrl).origin
  const sdkModuleUrl = `${origin}${SDK_PROXY_PATH}cloudbase-sdk.js`
  await context.route(`${origin}${SDK_PROXY_PATH}*`, async (route) => {
    const requestedName = basename(new URL(route.request().url()).pathname)
    const sourceName = requestedName === 'cloudbase-sdk.js' ? '@cloudbase_js-sdk.js' : requestedName
    if (!/^[@\w.-]+\.js$/u.test(sourceName)) {
      await route.abort('blockedbyclient')
      return
    }
    try {
      const body = await readFile(resolve(VITE_CLOUDBASE_DEPS_DIR, sourceName), 'utf8')
      await route.fulfill({ body, contentType: 'text/javascript; charset=utf-8', status: 200 })
    }
    catch {
      await route.fulfill({ body: 'Not found', contentType: 'text/plain', status: 404 })
    }
  })
  return sdkModuleUrl
}

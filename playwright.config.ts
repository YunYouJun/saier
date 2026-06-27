import { defineConfig, devices } from '@playwright/test'

// E2E smoke tests for the example app (separate from vitest unit tests).
// Specs use the `*.pw.ts` suffix so vitest ignores them.
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.pw.ts',
  timeout: 30_000,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5173',
    ...devices['Desktop Chrome'],
  },
  // Only the Vite example is auto-managed here (self-contained + fast).
  // The Nuxt site e2e (site-demo.pw.ts) is `test.fixme` for now — playwright's
  // webServer can't reliably detect Nuxt dev's host bind; run it manually:
  // `pnpm dev:site` then drop the `.fixme`.
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
})

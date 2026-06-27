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
  // Both example apps are auto-managed. Nuxt is forced onto 127.0.0.1 so
  // playwright's webServer URL check (IPv4) detects it — Nuxt dev otherwise
  // binds IPv6 [::1], which the check can't reach.
  webServer: [
    {
      command: 'pnpm dev',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'pnpm -C site exec nuxt dev --port 8080 --host 127.0.0.1',
      url: 'http://127.0.0.1:8080',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})

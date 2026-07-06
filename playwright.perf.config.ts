import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'performance-baseline.pw.ts',
  timeout: 180_000,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:51740',
    ...devices['Desktop Chrome'],
  },
})

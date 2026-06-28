import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const rootDir = dirname(fileURLToPath(import.meta.url))
const alias = {
  '@saier/core': resolve(rootDir, 'packages/core/src/index.ts'),
  '@saier/pixi': resolve(rootDir, 'packages/pixi/src/index.ts'),
}

export default defineConfig({
  optimizeDeps: {
    include: ['consola', 'hotkeys-js', 'mitt', 'pixi.js/advanced-blend-modes', 'pixi.js/math-extras'],
  },
  resolve: {
    alias,
  },
  test: {
    projects: [
      {
        resolve: {
          alias,
        },
        test: {
          name: 'node',
          environment: 'node',
          include: [
            'test/**/*.test.ts',
            'packages/**/test/**/*.spec.ts',
          ],
          exclude: [
            '**/*.browser.spec.ts',
            'node_modules/**',
          ],
        },
      },
      {
        resolve: {
          alias,
        },
        test: {
          name: 'browser',
          include: [
            'packages/pixi-painter/test/**/*.browser.spec.ts',
            'packages/pixi/test/**/*.browser.spec.ts',
          ],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [
              { browser: 'chromium' },
            ],
          },
        },
      },
    ],
  },
})

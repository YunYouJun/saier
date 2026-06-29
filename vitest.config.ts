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
            'packages/saier/test/**/*.browser.spec.ts',
            'packages/pixi/test/**/*.browser.spec.ts',
          ],
          // Browser specs drive real WebGL; running files in parallel exhausts
          // GPU / browser resources and makes heavy specs (e.g. 5000-dab) flake
          // under load. Run them sequentially with generous timeouts — slower but
          // deterministic. (The node project stays parallel.)
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 30_000,
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

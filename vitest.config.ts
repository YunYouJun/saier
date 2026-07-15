import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

const rootDir = dirname(fileURLToPath(import.meta.url))
const alias = {
  '@saier/core': resolve(rootDir, 'packages/core/src/index.ts'),
  '@saier/pixi': resolve(rootDir, 'packages/pixi/src/index.ts'),
  '@saier/vue': resolve(rootDir, 'packages/vue'),
  '~': resolve(rootDir, 'site/app'),
}

export default defineConfig({
  plugins: [vue()],
  optimizeDeps: {
    include: [
      'ag-psd',
      'consola',
      'hotkeys-js',
      'mitt',
      'pixi.js',
      'pixi.js/advanced-blend-modes',
      'pixi.js/math-extras',
      'reka-ui',
    ],
  },
  resolve: {
    alias,
  },
  test: {
    projects: [
      {
        plugins: [vue()],
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
        plugins: [vue()],
        resolve: {
          alias,
        },
        test: {
          name: 'browser',
          include: [
            'packages/vue/test/**/*.browser.spec.ts',
            'packages/saier/test/**/*.browser.spec.ts',
            'packages/pixi/test/**/*.browser.spec.ts',
            'site/app/**/*.browser.spec.ts',
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

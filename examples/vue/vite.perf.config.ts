import path from 'node:path'
import { defineConfig } from 'vite'

export default defineConfig({
  root: path.resolve(__dirname, '../../e2e/fixtures'),
  optimizeDeps: {
    entries: ['perf-baseline.html'],
  },
  server: {
    fs: {
      allow: [
        path.resolve(__dirname, '../..'),
      ],
    },
  },
  resolve: {
    alias: {
      '@saier/core': path.resolve(__dirname, '../../packages/core/src'),
      '@saier/pixi': path.resolve(__dirname, '../../packages/pixi/src'),
      'saier': path.resolve(__dirname, '../../packages/saier/src'),
    },
  },
})

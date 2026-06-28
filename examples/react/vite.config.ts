import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
// for windows
import { resolve } from 'pathe'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'vite'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    include: [
      'consola',
      'hotkeys-js',
      'mitt',
      'pixi.js',
      'pixi.js/math-extras',
    ],
  },

  resolve: {
    alias: {
      '@saier/core': resolve(__dirname, '../../packages/core/src/index.ts'),
      '@saier/pixi': resolve(__dirname, '../../packages/pixi/src/index.ts'),
      'saier': resolve(__dirname, '../../packages/saier/src/index.ts'),
    },
  },

  plugins: [
    react(),

    UnoCSS(),
  ],
})

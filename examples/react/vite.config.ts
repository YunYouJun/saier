import path from 'node:path'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react-swc'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'vite'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@saier/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
      '@saier/pixi': path.resolve(__dirname, '../../packages/pixi/src/index.ts'),
      'saier': path.resolve(__dirname, '../../packages/saier/src/index.ts'),
    },
  },

  plugins: [
    react(),

    UnoCSS(),
  ],
})

import path from 'node:path'
import react from '@vitejs/plugin-react-swc'
// for windows
import { resolve } from 'pathe'
import UnoCSS from 'unocss/vite'

import { defineConfig } from 'vite'

const __dirname = path.dirname(new URL(import.meta.url).pathname)

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      'pixi-painter': resolve(__dirname, '../../packages/pixi-painter/src/index.ts'),
    },
  },

  plugins: [
    react(),

    UnoCSS(),
  ],
})

import path from 'node:path'
import { componentsDir } from '@advjs/gui/node'
import vue from '@vitejs/plugin-vue'

import Unocss from 'unocss/vite'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'

import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    proxy: {
      '/api': {
        target: 'https://modal-labs--stable-diffusion-xl-turbo-model-inference.modal.run/',
        changeOrigin: true,
        rewrite: path => path.replace(/^\/api/, ''),
      },
    },
  },

  optimizeDeps: {
    include: [
      '@ctrl/tinycolor',
      'axios',
      'consola',
      'hotkeys-js',
      'mitt',
      'pixi.js/advanced-blend-modes',
      'pixi.js',
      'pixi.js/math-extras',
    ],
  },

  resolve: {
    alias: {
      '@saier/core': path.resolve(__dirname, '../../packages/core/src'),
      '@saier/pixi': path.resolve(__dirname, '../../packages/pixi/src'),
      '@saier/vue': path.resolve(__dirname, '../../packages/controls'),
      'pixi-painter': path.resolve(__dirname, '../../packages/pixi-painter/src'),
    },
  },

  build: {
    cssMinify: 'esbuild',
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/pixi.js/'))
            return 'pixi'
        },
      },
    },
  },

  plugins: [
    vue(),

    Unocss(),

    // https://github.com/antfu/unplugin-auto-import
    AutoImport({
      imports: [
        'vue',
        'vue-i18n',
        '@vueuse/head',
        '@vueuse/core',
        // VueRouterAutoImports,
        {
          // add any other imports you were relying on
          'vue-router/auto': ['useLink'],
        },
      ],
      dts: 'src/auto-imports.d.ts',
      dirs: [
        'src/composables',
        'src/stores',
      ],
      vueTemplate: true,
    }),

    // https://github.com/antfu/unplugin-vue-components
    Components({
      // allow auto load markdown components under `./src/components/`
      dirs: ['src/components', '../../packages/controls/components', componentsDir],
      extensions: ['vue', 'md'],
      // allow auto import and register components used in markdown
      include: [/\.vue$/, /\.vue\?vue/, /\.md$/],
      dts: false,
    }),
  ],
})

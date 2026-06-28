import path from 'node:path'
import { pwa } from './app/config/pwa'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-06-28',
  ssr: false,
  devtools: { enabled: false },

  modules: [
    // nuxt-security removed: v2.6.0 (latest) targets Nuxt 3 / h3 v1 and 500s on
    // every request under Nuxt 4 (h3 v2). Re-add when it ships Nuxt 4 support,
    // or apply security headers at the host (Cloudflare Pages).
    '@vueuse/nuxt',
    '@unocss/nuxt',
    '@pinia/nuxt',
    '@nuxtjs/color-mode',
    '@vite-pwa/nuxt',

    '@advjs/gui/nuxt',
  ],

  css: ['@unocss/reset/tailwind.css'],

  pwa,

  alias: {
    '@saier/core': '../packages/core/src/index.ts',
    '@saier/pixi': '../packages/pixi/src/index.ts',
    '@saier/vue': path.resolve(import.meta.dirname, '../packages/controls'),
    'pixi-painter': '../packages/pixi-painter/src/index.ts',
  },

  vite: {
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
        'reka-ui',
      ],
    },
  },

  components: {
    dirs: [
      '~/components',
      {
        path: path.resolve(import.meta.dirname, '../packages/controls/components'),
        prefix: '',
      },
    ],
  },
})

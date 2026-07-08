import path from 'node:path'
import process from 'node:process'
import { pwa } from './app/config/pwa'

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-06-28',
  srcDir: 'app',
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
  ],

  css: ['@unocss/reset/tailwind.css'],

  app: {
    head: {
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
        { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      ],
    },
  },

  runtimeConfig: {
    public: {
      saierCloudFileMaxBytes: Number(process.env.NUXT_PUBLIC_SAIER_CLOUD_FILE_MAX_BYTES || 200 * 1024 * 1024),
      saierCloudRoomApiFunctionName: process.env.NUXT_PUBLIC_SAIER_CLOUD_ROOM_API_FUNCTION_NAME || 'saier-room-api',
      yunlefunCloudbaseEnv: process.env.NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV || 'yunlefun-8g7ybcxc7345c490',
      yunlefunSsoOrigin: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_ORIGIN || 'https://www.yunle.fun',
    },
  },

  pwa,

  alias: {
    '@saier/core': '../packages/core/src/index.ts',
    '@saier/pixi': '../packages/pixi/src/index.ts',
    '@saier/vue': path.resolve(import.meta.dirname, '../packages/vue'),
    'saier': '../packages/saier/src/index.ts',
  },

  vite: {
    optimizeDeps: {
      include: [
        '@cloudbase/js-sdk',
        '@yunlefun/sso',
        'axios',
        'consola',
        'reka-ui',
      ],
    },
  },

  components: {
    dirs: [
      '~/components',
      {
        path: path.resolve(import.meta.dirname, '../packages/vue/components'),
        prefix: '',
      },
    ],
  },
})

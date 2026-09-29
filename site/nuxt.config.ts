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

  css: [
    '@unocss/reset/tailwind.css',
    '~/assets/theme.css',
  ],

  colorMode: {
    classSuffix: '',
    fallback: 'dark',
    preference: 'system',
    storageKey: 'saier:color-mode',
  },

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
      saierFeatures: {
        aiPictionary: process.env.NUXT_PUBLIC_SAIER_FEATURE_AI_PICTIONARY === 'true',
        pictionary: process.env.NUXT_PUBLIC_SAIER_FEATURE_PICTIONARY !== 'false',
        pictionaryPlayNative: process.env.NUXT_PUBLIC_SAIER_FEATURE_PICTIONARY_PLAY_NATIVE === 'true',
        realtimeCommittedEvents: process.env.NUXT_PUBLIC_SAIER_FEATURE_REALTIME_COMMITTED_EVENTS === 'true',
        realtimePreview: process.env.NUXT_PUBLIC_SAIER_FEATURE_REALTIME_PREVIEW === 'true',
        redisDeadlineAcceleration: process.env.NUXT_PUBLIC_SAIER_FEATURE_REDIS_DEADLINE_ACCELERATION === 'true',
      },
      saierPrivateAssetsEnabled: process.env.NUXT_PUBLIC_SAIER_PRIVATE_ASSETS_ENABLED === 'true',
      saierAssetsApiFunctionName: process.env.NUXT_PUBLIC_SAIER_ASSETS_API_FUNCTION_NAME || 'saier-assets-api',
      saierWatermarkRuntimeUrl: process.env.NUXT_PUBLIC_SAIER_WATERMARK_RUNTIME_URL || 'https://ai-runtime-193029-4-1325586649.sh.run.tcloudbase.com/ai/v2/apps/saier/watermark',
      saierRealtimeUrl: process.env.NUXT_PUBLIC_SAIER_REALTIME_URL || '',
      saierCloudFileMaxBytes: Number(process.env.NUXT_PUBLIC_SAIER_CLOUD_FILE_MAX_BYTES || 200 * 1024 * 1024),
      saierCloudRoomApiFunctionName: process.env.NUXT_PUBLIC_SAIER_CLOUD_ROOM_API_FUNCTION_NAME || 'saier-room-api',
      yunlefunCloudbaseEnv: process.env.NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV || 'yunlefun-8g7ybcxc7345c490',
      yunlefunSsoClientId: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_CLIENT_ID || 'saier-web',
      yunlefunSsoExchangeUrl: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_EXCHANGE_URL || 'https://api.yunle.fun/sso-ticket',
      yunlefunSsoOrigin: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_ORIGIN || 'https://www.yunle.fun',
      yunlefunSsoRedirectUri: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_REDIRECT_URI || 'https://saier.yunle.fun/',
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
    build: {
      rollupOptions: {
        output: {
          chunkFileNames(chunkInfo) {
            if (chunkInfo.name === 'PictionaryActivityPlugin')
              return '_nuxt/activity-pictionary.[hash].js'
            return '_nuxt/[hash].js'
          },
        },
      },
    },
    optimizeDeps: {
      include: [
        '@yunlefun/assets',
        '@cloudbase/js-sdk',
        '@yunlefun/sso',
        '@yunlefun/sso/browser',
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

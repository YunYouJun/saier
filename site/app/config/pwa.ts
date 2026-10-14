import type { ModuleOptions } from '@vite-pwa/nuxt'
import process from 'node:process'
import { appIcon, appIconCachePattern } from '../constants/brand'
import { appDescription, appName, appShortName } from '../constants/index'

const scope = '/'

export const pwa: ModuleOptions = {
  registerType: 'autoUpdate',
  scope,
  base: scope,
  manifest: {
    id: scope,
    scope,
    name: appName,
    short_name: appShortName,
    description: appDescription,
    lang: 'zh-CN',
    background_color: '#f8fafc',
    theme_color: '#f8fafc',
    icons: [...appIcon.pwaIcons],
  },
  workbox: {
    globIgnores: [
      '**/activity-*.*.js',
      '**/activity-*.*.css',
      '**/*ActivityPlugin.*.js',
      '**/*ActivityPlugin.*.css',
    ],
    globPatterns: ['**/*.{js,css,html,txt,png,ico,svg}'],
    navigateFallbackDenylist: [/^\/api\//],
    navigateFallback: '/',
    cleanupOutdatedCaches: true,
    runtimeCaching: [
      {
        urlPattern: appIconCachePattern,
        handler: 'CacheFirst',
        options: {
          cacheName: 'saier-app-icon-v1',
          expiration: {
            maxEntries: 5,
            maxAgeSeconds: 60 * 60 * 24 * 365,
          },
          cacheableResponse: { statuses: [0, 200] },
        },
      },
      {
        urlPattern: /^https:\/\/fonts.googleapis.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'google-fonts-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
      {
        urlPattern: /^https:\/\/fonts.gstatic.com\/.*/i,
        handler: 'CacheFirst',
        options: {
          cacheName: 'gstatic-fonts-cache',
          expiration: {
            maxEntries: 10,
            maxAgeSeconds: 60 * 60 * 24 * 365, // <== 365 days
          },
          cacheableResponse: {
            statuses: [0, 200],
          },
        },
      },
    ],
  },
  registerWebManifestInRouteRules: true,
  writePlugin: true,
  devOptions: {
    enabled: process.env.VITE_PLUGIN_PWA === 'true',
    navigateFallback: scope,
  },
}

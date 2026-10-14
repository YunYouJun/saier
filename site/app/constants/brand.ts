const mediaOrigin = 'https://yunlefun-cos-1253292018.cos.ap-shanghai.myqcloud.com'
const installIconBase = `${mediaOrigin}/saier/app-icons/v1`

/** Selected historical artwork; binary originals stay in COS and YunLeFun/icons. */
export const appIcon = {
  src: `${mediaOrigin}/desktop/app-icons/v1/pixi-painter.webp`,
  masterSrc: `${mediaOrigin}/desktop/app-icons/masters/v1/pixi-painter.png`,
  masterSha256: '49bb33e486d6326f19e57bf7e06c6d7df19a39fd954f06f1daf5724ba1e16e4d',
  legacySrc: '/logo.svg',
  /** Small browser-tab companion; installation icons retain the historical artwork. */
  faviconSvgSrc: '/favicon-brush-v1.svg',
  faviconSrc: `${installIconBase}/favicon-32x32.png`,
  appleTouchIconSrc: `${installIconBase}/apple-touch-icon.png`,
  pwaIcons: [
    { src: `${installIconBase}/pwa-192x192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: `${installIconBase}/pwa-512x512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
  ],
} as const

/** Only the immutable, explicitly selected app artwork is cached from COS. */
export const appIconCachePattern = /^https:\/\/yunlefun-cos-1253292018\.cos\.ap-shanghai\.myqcloud\.com\/(?:desktop\/app-icons\/v1\/pixi-painter\.webp|saier\/app-icons\/v1\/(?:favicon-32x32|apple-touch-icon|pwa-192x192|pwa-512x512)\.png)$/

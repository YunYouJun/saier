import type { DefaultTheme } from 'vitepress'
import { transformerTwoslash } from '@shikijs/vitepress-twoslash'
import { getVitepressConfig } from '@yunyoujun/docs'
import { defineConfig } from 'vitepress'
import { groupIconMdPlugin } from 'vitepress-plugin-group-icons'
import { version } from '../../../package.json'

const GUIDES: DefaultTheme.NavItemWithLink[] = [
  { text: 'What is pixi-painter?', link: '/guide/what-is' },
  { text: 'Getting Started', link: '/guide/getting-started' },
]

// Engineering / planning docs — the source of truth executing agents (codex)
// follow. Keep this list in sync with the `/design/` sidebar below.
const DESIGN: DefaultTheme.NavItemWithLink[] = [
  { text: 'Overview', link: '/design/' },
  { text: 'Roadmap (P0–P9)', link: '/design/roadmap' },
  { text: 'Core Interfaces', link: '/design/interfaces' },
  { text: 'Decisions (ADR)', link: '/design/decisions' },
  { text: 'Testing & Determinism', link: '/design/testing' },
]

// Per-phase task cards executing agents pick up one at a time.
const TASKS_P0: DefaultTheme.NavItemWithLink[] = [
  { text: 'Index', link: '/design/tasks/' },
  { text: 'P0-01 · Audit & pin Pixi', link: '/design/tasks/P0-01-audit-and-pin-pixi' },
  { text: 'P0-02 · Application bootstrap', link: '/design/tasks/P0-02-application-bootstrap-v8' },
  { text: 'P0-03 · Graphics: brush + eraser', link: '/design/tasks/P0-03-graphics-brush-eraser-v8' },
  { text: 'P0-04 · canvas + board + layers', link: '/design/tasks/P0-04-graphics-canvas-board-layers-v8' },
  { text: 'P0-05 · extract / export', link: '/design/tasks/P0-05-extract-export-v8' },
  { text: 'P0-06 · Test foundation', link: '/design/tasks/P0-06-test-foundation' },
  { text: 'P0-07 · Verify examples', link: '/design/tasks/P0-07-verify-examples-and-demos' },
]

const TASKS_P1: DefaultTheme.NavItemWithLink[] = [
  { text: 'P1-01 · Scaffold core + adapter', link: '/design/tasks/P1-01-scaffold-packages' },
  { text: 'P1-02 · Core contracts + geometry', link: '/design/tasks/P1-02-core-contracts-and-geometry' },
  { text: 'P1-03 · SimpleBrushEngine', link: '/design/tasks/P1-03-simple-brush-engine' },
  { text: 'P1-04 · Document / Undo', link: '/design/tasks/P1-04-document-rasterlayer-undo' },
  { text: 'P1-05 · RenderTextureBackend', link: '/design/tasks/P1-05-rendertexture-backend' },
  { text: 'P1-06 · Real eraser', link: '/design/tasks/P1-06-real-eraser' },
  { text: 'P1-07 · Headless controller', link: '/design/tasks/P1-07-headless-controller' },
  { text: 'P1-08 · Integrate pixi-painter', link: '/design/tasks/P1-08-integrate-pixi-painter' },
  { text: 'P1-09 · Verify (watershed)', link: '/design/tasks/P1-09-verify-watershed' },
]

const TASKS_P2: DefaultTheme.NavItemWithLink[] = [
  { text: 'P2-01 · TiledSurface', link: '/design/tasks/P2-01-tiled-surface' },
  { text: 'P2-02 · CPU dab rasterizer', link: '/design/tasks/P2-02-cpu-dab-rasterizer' },
  { text: 'P2-03 · Tile undo', link: '/design/tasks/P2-03-tile-undo' },
  { text: 'P2-04 · PixiTileTextureBackend', link: '/design/tasks/P2-04-pixi-tile-backend' },
  { text: 'P2-05 · Batched tile upload', link: '/design/tasks/P2-05-batched-tile-upload' },
  { text: 'P2-06 · Switch & verify', link: '/design/tasks/P2-06-switch-and-verify' },
]

const TASKS_P3: DefaultTheme.NavItemWithLink[] = [
  { text: 'P3-01 · PointerSampler', link: '/design/tasks/P3-01-pointer-sampler' },
  { text: 'P3-02 · Stabilizer', link: '/design/tasks/P3-02-stabilizer' },
  { text: 'P3-03 · Pressure dynamics', link: '/design/tasks/P3-03-pressure-dynamics' },
  { text: 'P3-04 · Harvest shodo', link: '/design/tasks/P3-04-harvest-shodo-calligraphy' },
  { text: 'P3-05 · Touch & gestures', link: '/design/tasks/P3-05-touch-gestures' },
  { text: 'P3-06 · Feel verification', link: '/design/tasks/P3-06-feel-verification' },
]

const TASKS_P4: DefaultTheme.NavItemWithLink[] = [
  { text: 'P4-01 · BrushPreset model', link: '/design/tasks/P4-01-brush-preset-model' },
  { text: 'P4-02 · Tip / stamp system', link: '/design/tasks/P4-02-tip-stamp-system' },
  { text: 'P4-03 · Pen / pencil / marker', link: '/design/tasks/P4-03-pen-pencil-marker' },
  { text: 'P4-04 · Airbrush', link: '/design/tasks/P4-04-airbrush' },
  { text: 'P4-05 · Brush UI', link: '/design/tasks/P4-05-brush-ui' },
  { text: 'P4-06 · Verify brush family', link: '/design/tasks/P4-06-verify-brush-family' },
]

const TASKS_P5: DefaultTheme.NavItemWithLink[] = [
  { text: 'P5-01 · Layer stack controller', link: '/design/tasks/P5-01-layer-stack-controller' },
  { text: 'P5-02 · Pixi layer display sync', link: '/design/tasks/P5-02-pixi-layer-display-sync' },
  { text: 'P5-03 · Layer panel UI', link: '/design/tasks/P5-03-layer-panel-ui' },
  { text: 'P5-04 · Shared usePainter()', link: '/design/tasks/P5-04-use-painter-composable' },
  { text: 'P5-05 · Verify layer stack', link: '/design/tasks/P5-05-verify-layer-stack' },
]

const TASKS_P6: DefaultTheme.NavItemWithLink[] = [
  { text: 'P6-01 · Layer attributes model', link: '/design/tasks/P6-01-layer-attributes-model' },
  { text: 'P6-02 · Lock alpha', link: '/design/tasks/P6-02-lock-alpha' },
  { text: 'P6-03 · Clipping layers', link: '/design/tasks/P6-03-clipping-layers' },
  { text: 'P6-04 · Layer mask', link: '/design/tasks/P6-04-layer-mask' },
  { text: 'P6-05 · Transformed-layer painting', link: '/design/tasks/P6-05-transformed-layer-painting' },
  { text: 'P6-06 · Layer panel UI', link: '/design/tasks/P6-06-layer-panel-ui' },
  { text: 'P6-07 · Verify layer features', link: '/design/tasks/P6-07-verify-layer-features' },
]

const vpConfig = getVitepressConfig({
  repo: 'https://github.com/YunYouJun/saier',
})

export default defineConfig({
  ...vpConfig,

  title: 'saier',
  description: 'saier — an elegant online painting runtime (PixiJS-powered)',
  lang: 'zh-CN',
  markdown: {
    codeTransformers: [
      transformerTwoslash(),
    ],
    languages: ['js', 'jsx', 'ts', 'tsx'],
    config: (md) => {
      md.use(groupIconMdPlugin)
    },
  },
  cleanUrls: true,

  themeConfig: {
    ...vpConfig.themeConfig,

    search: {
      provider: 'local',
    },

    nav: [
      {
        text: 'Guide',
        items: [{ items: GUIDES }],
      },
      {
        text: 'Design',
        items: [
          { items: DESIGN },
          { items: [{ text: 'Tasks', link: '/design/tasks/' }] },
        ],
      },
      {
        text: `v${version}`,
        items: [
          { text: 'Release Notes', link: 'https://github.com/YunYouJun/saier/releases' },
        ],
      },
    ],
    sidebar: {
      '/guide/': [
        { text: 'Guide', items: GUIDES },
      ],
      '/design/': [
        { text: 'Design', items: DESIGN },
        { text: 'Tasks · P0', collapsed: true, items: TASKS_P0 },
        { text: 'Tasks · P1', collapsed: false, items: TASKS_P1 },
        { text: 'Tasks · P2', collapsed: true, items: TASKS_P2 },
        { text: 'Tasks · P3', collapsed: true, items: TASKS_P3 },
        { text: 'Tasks · P4', collapsed: true, items: TASKS_P4 },
        { text: 'Tasks · P5', collapsed: true, items: TASKS_P5 },
        { text: 'Tasks · P6', collapsed: false, items: TASKS_P6 },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/YunYouJun/saier' },
    ],

    footer: {
      message: 'Released under the MPL-2.0 License.',
      copyright: 'Copyright © 2023-PRESENT YunYouJun.',
    },
  },

  head: [
    ['link', { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' }],
    ['meta', { name: 'author', content: 'YunYouJun' }],
    ['meta', { property: 'og:title', content: 'saier' }],
    ['meta', { property: 'og:description', content: 'saier — an elegant online painting runtime (PixiJS-powered)' }],
    ['meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0, viewport-fit=cover' }],
  ],
})

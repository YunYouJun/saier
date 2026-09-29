import type { Component } from 'vue'

/** Trusted, bundled extensions contribute panels to the existing editor shell. */
export interface EditorPluginManifest {
  id: string
  panelId: `plugin:${string}`
  icon: string
  labels: { zh: string, en: string }
  load: () => Promise<{ default: Component }>
}

export const editorPlugins: readonly EditorPluginManifest[] = [
  {
    id: 'watermark',
    panelId: 'plugin:watermark',
    icon: 'i-ph-stamp',
    labels: { zh: '水印', en: 'Watermark' },
    load: () => import('./watermark/WatermarkEditorPanel.vue'),
  },
]

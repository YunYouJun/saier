import type { SitePainterPanelId } from './painter-app'

export type SitePainterShellMode = 'desktop' | 'mobile'

export interface SitePainterPanelItem {
  id: SitePainterPanelId
  icon: string
}

export interface SitePainterPanelActionLabels {
  collapse: string
  detach: string
  expand: string
  hide: string
}

export interface SitePainterShellProps {
  appName: string
  availablePanels: SitePainterPanelId[]
  closePreviewLabel: string
  exportPreview?: string
  exportPreviewLabel: string
  languageLabel: string
  loadingLabel: string
  loading: boolean
  nextLocaleLabel: string
  panelActionLabels: SitePainterPanelActionLabels
  panelLabels: Record<SitePainterPanelId, string>
  panelVisibility: Readonly<Record<SitePainterPanelId, boolean>>
  statusLabel: string
  tagline: string
}

export interface SitePainterShellEmits {
  closePreview: []
  setPanelVisible: [panelId: SitePainterPanelId, visible: boolean]
  toggleLocale: []
}

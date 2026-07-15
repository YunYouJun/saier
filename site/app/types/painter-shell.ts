import type { SitePainterPanelId } from './painter-app'
import type { SiteLocale, SiteLocaleOption } from '~/composables/useSiteI18n'

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
  currentLocaleLabel: string
  locale: SiteLocale
  localeOptions: readonly SiteLocaleOption[]
  languageLabel: string
  loadingLabel: string
  loading: boolean
  panelActionLabels: SitePainterPanelActionLabels
  panelLabels: Record<SitePainterPanelId, string>
  panelVisibility: Readonly<Record<SitePainterPanelId, boolean>>
  statusLabel: string
  tagline: string
  workspaceKind: 'activity' | 'document'
}

export interface SitePainterShellEmits {
  closePreview: []
  setPanelVisible: [panelId: SitePainterPanelId, visible: boolean]
  setLocale: [locale: SiteLocale]
}

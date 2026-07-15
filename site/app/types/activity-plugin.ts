import type { Component } from 'vue'

export interface SiteActivityPluginLabels {
  close: string
  lobby: string
  menu: string
  room: string
  tab: string
}

export type SiteActivityTheme = 'dark' | 'inherit' | 'light'

export interface SiteActivityPluginManifest<Id extends string = string> {
  id: Id
  icon: string
  labels: {
    en: SiteActivityPluginLabels
    zh: SiteActivityPluginLabels
  }
  load: SiteActivityPluginLoader
  presentation: 'workspace-tab'
  theme: SiteActivityTheme
}

export type SiteActivityPluginLoader = () => Promise<{ default: Component }>

export interface SiteActivityMenuItem {
  icon: string
  id: string
  label: string
}

interface SiteWorkspaceTabBase {
  active: boolean
  closeLabel: string
  closeable: boolean
  dirty: boolean
  icon?: string
  id: string
  subtitle: string
  title: string
}

export interface SiteDocumentWorkspaceTab extends SiteWorkspaceTabBase {
  documentId: string
  kind: 'document'
}

export interface SiteActivityWorkspaceTab extends SiteWorkspaceTabBase {
  kind: 'activity'
  pluginId: string
}

export type SiteWorkspaceTab = SiteActivityWorkspaceTab | SiteDocumentWorkspaceTab

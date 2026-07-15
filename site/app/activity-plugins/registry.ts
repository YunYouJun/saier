import type { SiteLocale } from '~/composables/useSiteI18n'
import type { SiteActivityMenuItem, SiteActivityPluginLoader, SiteActivityPluginManifest } from '~/types/activity-plugin'
import { pictionaryActivityPluginManifest } from './pictionary/manifest'

const activityPluginManifests = Object.freeze({
  pictionary: pictionaryActivityPluginManifest,
} satisfies Record<string, SiteActivityPluginManifest>)

export type SiteActivityPluginType = keyof typeof activityPluginManifests

export function getSiteActivityPluginLoader(type: string): SiteActivityPluginLoader | undefined {
  return getSiteActivityPluginManifest(type)?.load
}

export function getSiteActivityPluginManifest(type: string): SiteActivityPluginManifest | undefined {
  return activityPluginManifests[type as SiteActivityPluginType]
}

export function isSiteActivityPluginType(type: string): type is SiteActivityPluginType {
  return Object.hasOwn(activityPluginManifests, type)
}

export function listSiteActivityMenuItems(locale: SiteLocale): SiteActivityMenuItem[] {
  return Object.values(activityPluginManifests).map(manifest => ({
    icon: manifest.icon,
    id: manifest.id,
    label: manifest.labels[locale].menu,
  }))
}

export type { SiteActivityPluginLoader, SiteActivityPluginManifest } from '~/types/activity-plugin'

import type { Component } from 'vue'

export type SiteActivityPluginLoader = () => Promise<{ default: Component }>

const activityPluginLoaders = Object.freeze({
  pictionary: () => import('./pictionary/PictionaryActivityPlugin.vue'),
} satisfies Record<string, SiteActivityPluginLoader>)

export function getSiteActivityPluginLoader(type: string): SiteActivityPluginLoader | undefined {
  return activityPluginLoaders[type as keyof typeof activityPluginLoaders]
}

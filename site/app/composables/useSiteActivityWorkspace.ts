import type { PainterDocumentState } from 'saier'
import type { ComputedRef, MaybeRefOrGetter, Ref } from 'vue'
import type { SiteLocale } from './useSiteI18n'
import type { SiteWorkspaceTab } from '~/types/activity-plugin'
import type { SiteActivityPluginRequest } from '~/utils/activityPluginRoutes'
import { computed, shallowRef, toValue, watch } from 'vue'
import {
  getSiteActivityPluginManifest,
  listSiteActivityMenuItems,
} from '~/activity-plugins/registry'

interface UseSiteActivityWorkspaceOptions {
  activityRequest: MaybeRefOrGetter<SiteActivityPluginRequest | null>
  closeDocumentLabel: MaybeRefOrGetter<string>
  documents: MaybeRefOrGetter<readonly PainterDocumentState[]>
  locale: MaybeRefOrGetter<SiteLocale>
}

interface UseSiteActivityWorkspaceResult {
  activityActive: Readonly<Ref<boolean>>
  activityMenuItems: ComputedRef<ReturnType<typeof listSiteActivityMenuItems>>
  activityMounted: ComputedRef<boolean>
  showActivity: () => void
  showDocument: () => void
  workspaceTabs: ComputedRef<SiteWorkspaceTab[]>
}

/** Coordinates one live first-party Activity workspace alongside normal painter documents. */
export function useSiteActivityWorkspace(options: UseSiteActivityWorkspaceOptions): UseSiteActivityWorkspaceResult {
  const activityActive = shallowRef(false)
  const activityKey = computed(() => requestKey(toValue(options.activityRequest)))
  const activityMounted = computed(() => Boolean(toValue(options.activityRequest)))
  const activityMenuItems = computed(() => listSiteActivityMenuItems(toValue(options.locale)))

  watch(
    activityKey,
    (key, previousKey) => {
      if (!key) {
        activityActive.value = false
        return
      }
      if (key !== previousKey)
        activityActive.value = true
    },
    { immediate: true },
  )

  const workspaceTabs = computed<SiteWorkspaceTab[]>(() => {
    const request = toValue(options.activityRequest)
    const documents = toValue(options.documents)
    const tabs: SiteWorkspaceTab[] = documents.map(document => ({
      active: document.active && !activityActive.value,
      closeLabel: toValue(options.closeDocumentLabel),
      closeable: documents.length > 1,
      dirty: document.dirty,
      documentId: document.id,
      id: `document:${document.id}`,
      kind: 'document',
      subtitle: `${document.width} x ${document.height}`,
      title: document.name,
    }))

    if (!request)
      return tabs

    const manifest = getSiteActivityPluginManifest(request.type)
    if (!manifest)
      return tabs
    const labels = manifest.labels[toValue(options.locale)]
    tabs.push({
      active: activityActive.value,
      closeLabel: labels.close,
      closeable: true,
      dirty: false,
      icon: manifest.icon,
      id: `activity:${manifest.id}`,
      kind: 'activity',
      pluginId: manifest.id,
      subtitle: request.roomId ? `${labels.room} ${request.roomId}` : labels.lobby,
      title: labels.tab,
    })
    return tabs
  })

  return {
    activityActive,
    activityMenuItems,
    activityMounted,
    showActivity: () => activityActive.value = activityMounted.value,
    showDocument: () => activityActive.value = false,
    workspaceTabs,
  }
}

function requestKey(request: SiteActivityPluginRequest | null): string {
  return request
    ? `${request.type}:${request.roomId ?? 'lobby'}:${request.inviteToken ?? ''}`
    : ''
}

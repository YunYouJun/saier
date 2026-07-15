<script setup lang="ts">
import type { Component } from 'vue'
import type { SiteActivityPluginLoader } from '~/activity-plugins/registry'
import type { SiteActivityTheme } from '~/types/activity-plugin'
import type { SiteActivityPluginRequest } from '~/utils/activityPluginRoutes'
import { computed, markRaw, shallowRef, watch } from 'vue'
import { getSiteActivityPluginLoader, getSiteActivityPluginManifest } from '~/activity-plugins/registry'
import { SiteActivityButton } from '~/components/activity'
import { useSiteI18n } from '~/composables/useSiteI18n'
import '~/assets/activity.css'

const props = defineProps<{
  loadPlugin?: (type: string) => SiteActivityPluginLoader | undefined
  request: SiteActivityPluginRequest
  resolveTheme?: (type: string) => SiteActivityTheme | undefined
}>()

const emit = defineEmits<{
  exit: []
}>()

const pluginComponent = shallowRef<Component>()
const loadError = shallowRef<'' | 'loadFailed' | 'unavailable'>('')
const { text } = useSiteI18n()
const loadErrorLabel = computed(() => loadError.value ? text.value.activities[loadError.value] : '')
const themePolicy = computed<SiteActivityTheme>(() =>
  (props.resolveTheme ?? (type => getSiteActivityPluginManifest(type)?.theme))(props.request.type) ?? 'inherit',
)
const themeAttribute = computed(() => themePolicy.value === 'inherit' ? undefined : themePolicy.value)

watch(
  () => props.request.type,
  async (_, __, onCleanup) => {
    let stale = false
    onCleanup(() => stale = true)
    pluginComponent.value = undefined
    loadError.value = ''

    const loader = (props.loadPlugin ?? getSiteActivityPluginLoader)(props.request.type)
    if (!loader) {
      loadError.value = 'unavailable'
      return
    }

    try {
      const module = await loader()
      if (!stale)
        pluginComponent.value = markRaw(module.default)
    }
    catch {
      if (!stale)
        loadError.value = 'loadFailed'
    }
  },
  { immediate: true },
)
</script>

<template>
  <div
    class="site-activity-plugin-host"
    :data-saier-theme="themeAttribute"
    :data-theme-policy="themePolicy"
  >
    <div v-if="loadError" class="activity-plugin-state site-activity-surface" role="alert">
      <span class="activity-plugin-state__icon i-ph-warning-circle" aria-hidden="true" />
      <strong>{{ loadErrorLabel }}</strong>
      <SiteActivityButton @click="emit('exit')">
        {{ text.activities.close }}
      </SiteActivityButton>
    </div>
    <div v-else-if="!pluginComponent" class="activity-plugin-state site-activity-surface" aria-live="polite">
      <span class="activity-plugin-state__spinner i-ph-spinner-gap" aria-hidden="true" />
      {{ text.activities.loading }}
    </div>
    <component
      :is="pluginComponent"
      v-else
      :room-id="request.roomId"
      :invite-token="request.inviteToken"
      @exit="emit('exit')"
    />
  </div>
</template>

<style scoped>
.site-activity-plugin-host {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.activity-plugin-state {
  display: grid;
  height: 100%;
  min-height: 0;
  place-content: center;
  gap: 16px;
  text-align: center;
}

.activity-plugin-state__icon {
  justify-self: center;
  color: var(--saier-color-danger-text);
  font-size: 28px;
}

.activity-plugin-state__spinner {
  justify-self: center;
  color: var(--saier-color-accent-text);
  font-size: 24px;
  animation: activity-spin 900ms linear infinite;
}

@keyframes activity-spin {
  to {
    transform: rotate(1turn);
  }
}

@media (prefers-reduced-motion: reduce) {
  .activity-plugin-state__spinner {
    animation: none;
  }
}
</style>

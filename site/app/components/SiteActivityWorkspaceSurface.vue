<script setup lang="ts">
import type { SiteActivityPluginLoader } from '~/activity-plugins/registry'
import type { SiteActivityPluginRequest } from '~/utils/activityPluginRoutes'
import { computed } from 'vue'
import SiteActivityPluginHost from './SiteActivityPluginHost.vue'

const props = defineProps<{
  active: boolean
  loadPlugin?: (type: string) => SiteActivityPluginLoader | undefined
  request: SiteActivityPluginRequest | null
}>()

const emit = defineEmits<{
  exit: []
}>()

defineSlots<{
  document: () => unknown
}>()

const activityKey = computed(() => props.request
  ? `${props.request.type}:${props.request.roomId ?? 'lobby'}`
  : '')
</script>

<template>
  <div class="site-workspace-surface">
    <div
      v-show="!active"
      class="site-workspace-surface__document"
      :aria-hidden="active"
    >
      <slot name="document" />
    </div>

    <div
      v-if="request"
      v-show="active"
      class="site-workspace-surface__activity"
      :aria-hidden="!active"
    >
      <SiteActivityPluginHost
        :key="activityKey"
        :load-plugin="loadPlugin"
        :request="request"
        @exit="emit('exit')"
      />
    </div>
  </div>
</template>

<style scoped>
.site-workspace-surface,
.site-workspace-surface__document,
.site-workspace-surface__activity {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
}

.site-workspace-surface {
  position: relative;
  overflow: hidden;
}

.site-workspace-surface__document,
.site-workspace-surface__activity {
  position: absolute;
  inset: 0;
}

.site-workspace-surface__document :deep(canvas) {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--saier-color-canvas-surround);
}

.site-workspace-surface__activity {
  overflow: hidden;
}
</style>

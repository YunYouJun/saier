<script setup lang="ts">
import type { Component } from 'vue'
import type { SiteActivityPluginLoader } from '~/activity-plugins/registry'
import type { SiteActivityPluginRequest } from '~/utils/activityPluginRoutes'
import { markRaw, shallowRef, watch } from 'vue'
import { getSiteActivityPluginLoader } from '~/activity-plugins/registry'

const props = defineProps<{
  loadPlugin?: (type: string) => SiteActivityPluginLoader | undefined
  request: SiteActivityPluginRequest
}>()

const emit = defineEmits<{
  exit: []
}>()

const pluginComponent = shallowRef<Component>()
const loadError = shallowRef('')

watch(
  () => props.request.type,
  async (_, __, onCleanup) => {
    let stale = false
    onCleanup(() => stale = true)
    pluginComponent.value = undefined
    loadError.value = ''

    const loader = (props.loadPlugin ?? getSiteActivityPluginLoader)(props.request.type)
    if (!loader) {
      loadError.value = '这个 Activity 插件不可用'
      return
    }

    try {
      const module = await loader()
      if (!stale)
        pluginComponent.value = markRaw(module.default)
    }
    catch {
      if (!stale)
        loadError.value = 'Activity 插件加载失败，请稍后重试'
    }
  },
  { immediate: true },
)
</script>

<template>
  <div v-if="loadError" class="activity-plugin-state" role="alert">
    <strong>{{ loadError }}</strong>
    <button type="button" @click="emit('exit')">
      返回 Saier
    </button>
  </div>
  <div v-else-if="!pluginComponent" class="activity-plugin-state" aria-live="polite">
    正在加载 Activity…
  </div>
  <component
    :is="pluginComponent"
    v-else
    :room-id="request.roomId"
    :invite-token="request.inviteToken"
    @exit="emit('exit')"
  />
</template>

<style scoped>
.activity-plugin-state {
  display: grid;
  min-height: 100dvh;
  place-content: center;
  gap: 16px;
  color: #292522;
  text-align: center;
  background: #f5f0e8;
}

.activity-plugin-state button {
  padding: 10px 16px;
  border: 1px solid #c8beb4;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
}
</style>

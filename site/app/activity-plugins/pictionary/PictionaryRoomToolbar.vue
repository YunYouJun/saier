<script setup lang="ts">
import { SiteActivityButton, SiteActivityToolbar } from '~/components/activity'
import { usePictionaryI18n } from './i18n'

defineProps<{
  transportLabel: string
}>()

const emit = defineEmits<{
  invite: []
}>()

const { text } = usePictionaryI18n()
</script>

<template>
  <SiteActivityToolbar
    class="pictionary-room-toolbar"
    icon="i-ph-game-controller"
    :title="text.room.title"
  >
    <template #status>
      <span class="pictionary-room-toolbar__live-dot" aria-hidden="true" />
      <span>{{ transportLabel }}</span>
    </template>
    <template #actions>
      <SiteActivityButton size="compact" @click="emit('invite')">
        <span class="i-ph-share-network" aria-hidden="true" />
        {{ text.room.invite }}
      </SiteActivityButton>
    </template>
  </SiteActivityToolbar>
</template>

<style scoped>
.pictionary-room-toolbar {
  position: sticky;
  z-index: 50;
  top: 0;
}

.pictionary-room-toolbar__live-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--saier-color-success);
  box-shadow: 0 0 0 3px var(--saier-color-success-soft);
}
</style>

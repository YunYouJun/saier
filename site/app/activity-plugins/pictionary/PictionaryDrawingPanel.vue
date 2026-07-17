<script setup lang="ts">
import type { PictionaryTool } from './i18n'
import PainterSlider from '@saier/vue/components/PainterSlider.vue'
import PainterToolSwitcher from '@saier/vue/components/PainterToolSwitcher.vue'
import { computed } from 'vue'
import { SiteActivityButton, SiteActivityPanel } from '~/components/activity'
import { usePictionaryI18n } from './i18n'

defineProps<{
  canTakeControl: boolean
}>()

const emit = defineEmits<{
  takeControl: []
}>()

const tool = defineModel<PictionaryTool>('tool', { required: true })
const color = defineModel<string>('color', { required: true })
const size = defineModel<number>('size', { required: true })
const { text } = usePictionaryI18n()

const toolOptions = computed(() => [
  { icon: 'i-ph-paint-brush', label: text.value.tools.pen, value: 'pen' },
  { icon: 'i-ph-highlighter-circle', label: text.value.tools.marker, value: 'marker' },
  { icon: 'i-ph-eraser', label: text.value.tools.eraser, value: 'eraser' },
])

function selectTool(value: string): void {
  if (value !== 'pen' && value !== 'marker' && value !== 'eraser')
    return
  tool.value = value
  size.value = value === 'marker' ? 22 : value === 'eraser' ? 20 : 8
}
</script>

<template>
  <SiteActivityPanel
    class="pictionary-drawing-panel"
    icon="i-ph-paint-brush"
    tag="aside"
    :title="text.room.drawingTools"
  >
    <PainterToolSwitcher
      :label="text.room.drawingTools"
      :model-value="tool"
      show-labels
      :tools="toolOptions"
      @update:model-value="selectTool"
    />

    <label v-if="tool !== 'eraser'" class="pictionary-drawing-panel__color">
      <span>{{ text.room.brushColor }}</span>
      <input v-model="color" type="color" :aria-label="text.room.brushColor">
    </label>

    <PainterSlider
      v-model="size"
      :label="text.room.brushSize"
      :max="128"
      :min="1"
      :step="1"
      unit=" px"
    />

    <SiteActivityButton v-if="canTakeControl" size="compact" @click="emit('takeControl')">
      <span class="i-ph-cursor-click" aria-hidden="true" />
      {{ text.room.takeControl }}
    </SiteActivityButton>
  </SiteActivityPanel>
</template>

<style scoped>
.pictionary-drawing-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
}

.pictionary-drawing-panel__color {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 36px;
  align-items: center;
  gap: 8px;
  color: var(--saier-color-text-muted);
  font-size: 11px;
}

.pictionary-drawing-panel__color input {
  box-sizing: border-box;
  width: 36px;
  height: 32px;
  padding: 3px;
  border: 1px solid var(--saier-color-border);
  border-radius: 7px;
  background: var(--saier-color-field);
}

.pictionary-drawing-panel__color input:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

.pictionary-drawing-panel .site-activity-button {
  align-self: flex-start;
}
</style>

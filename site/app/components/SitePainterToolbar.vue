<script setup lang="ts">
import type { SitePainterMenuCommand, SitePainterTool } from '~/types/painter-app'
import PainterSlider from '@saier/vue/components/PainterSlider.vue'
import {
  ToolbarButton,
  ToolbarRoot,
  ToolbarSeparator,
  ToolbarToggleGroup,
  ToolbarToggleItem,
} from 'reka-ui'
import { computed } from 'vue'

interface SitePainterToolbarLabels {
  newCanvas: string
  openProject: string
  saveProject: string
  cloudSync: string
  importImage: string
  exportPreview: string
  download: string
  undo: string
  redo: string
  zoomIn: string
  zoomOut: string
  tools: string
  brush: string
  eraser: string
  pan: string
  image: string
  selection: string
  stabilizer: string
}

const props = defineProps<{
  activeTool: SitePainterTool
  canRedo: boolean
  canUndo: boolean
  disabled: boolean
  labels: SitePainterToolbarLabels
  stabilizerStrength: number
}>()

const emit = defineEmits<{
  'command': [command: SitePainterMenuCommand]
  'update:stabilizerStrength': [strength: number]
}>()

const STABILIZER_MIN = 0
const STABILIZER_MAX = 15

const stabilizerStrengthModel = computed({
  get(): number {
    return normalizeStabilizerStrength(props.stabilizerStrength)
  },
  set(strength: number): void {
    emit('update:stabilizerStrength', normalizeStabilizerStrength(strength))
  },
})

const fileActions: { command: SitePainterMenuCommand, labelKey: 'newCanvas' | 'openProject' | 'saveProject' | 'cloudSync' | 'importImage', icon: string }[] = [
  { command: 'file:new', labelKey: 'newCanvas', icon: 'i-ph-file-plus' },
  { command: 'file:open-project', labelKey: 'openProject', icon: 'i-ph-folder-open' },
  { command: 'file:save-project', labelKey: 'saveProject', icon: 'i-ph-floppy-disk' },
  { command: 'file:cloud-sync', labelKey: 'cloudSync', icon: 'i-ph-cloud-arrow-up' },
  { command: 'file:import-image', labelKey: 'importImage', icon: 'i-ph-image' },
]

const viewActions: { command: SitePainterMenuCommand, labelKey: 'zoomOut' | 'zoomIn', icon: string }[] = [
  { command: 'view:zoom-out', labelKey: 'zoomOut', icon: 'i-ph-magnifying-glass-minus' },
  { command: 'view:zoom-in', labelKey: 'zoomIn', icon: 'i-ph-magnifying-glass-plus' },
]

const exportActions: { command: SitePainterMenuCommand, labelKey: 'exportPreview' | 'download', icon: string }[] = [
  { command: 'file:export-preview', labelKey: 'exportPreview', icon: 'i-ph-export' },
  { command: 'file:download', labelKey: 'download', icon: 'i-ph-download' },
]

const toolItems: { value: SitePainterTool, labelKey: 'brush' | 'eraser' | 'pan' | 'image' | 'selection', icon: string }[] = [
  { value: 'brush', labelKey: 'brush', icon: 'i-ph-paint-brush' },
  { value: 'eraser', labelKey: 'eraser', icon: 'i-ph-eraser' },
  { value: 'drag', labelKey: 'pan', icon: 'i-ph-hand' },
  { value: 'image', labelKey: 'image', icon: 'i-ph-image' },
  { value: 'selection', labelKey: 'selection', icon: 'i-ph-selection' },
]

function onToolChange(value: unknown): void {
  if (isSitePainterTool(value))
    emit('command', `tool:${value}`)
}

function isSitePainterTool(value: unknown): value is SitePainterTool {
  return value === 'brush'
    || value === 'drag'
    || value === 'eraser'
    || value === 'image'
    || value === 'selection'
}

function normalizeStabilizerStrength(strength: number): number {
  return Number.isFinite(strength)
    ? Math.max(STABILIZER_MIN, Math.min(STABILIZER_MAX, Math.round(strength)))
    : STABILIZER_MIN
}
</script>

<template>
  <ToolbarRoot class="site-toolbar" :aria-label="labels.tools" loop>
    <ToolbarButton
      v-for="action in fileActions"
      :key="action.command"
      class="site-toolbar__button"
      :disabled="disabled"
      :title="labels[action.labelKey]"
      @click="emit('command', action.command)"
    >
      <span :class="action.icon" />
    </ToolbarButton>

    <ToolbarSeparator class="site-toolbar__separator" />

    <ToolbarButton
      class="site-toolbar__button"
      :disabled="disabled || !canUndo"
      :title="labels.undo"
      @click="emit('command', 'edit:undo')"
    >
      <span class="i-ph-arrow-arc-left" />
    </ToolbarButton>
    <ToolbarButton
      class="site-toolbar__button"
      :disabled="disabled || !canRedo"
      :title="labels.redo"
      @click="emit('command', 'edit:redo')"
    >
      <span class="i-ph-arrow-arc-right" />
    </ToolbarButton>

    <ToolbarSeparator class="site-toolbar__separator" />

    <ToolbarButton
      v-for="action in viewActions"
      :key="action.command"
      class="site-toolbar__button"
      :disabled="disabled"
      :title="labels[action.labelKey]"
      @click="emit('command', action.command)"
    >
      <span :class="action.icon" />
    </ToolbarButton>

    <ToolbarSeparator class="site-toolbar__separator" />

    <ToolbarToggleGroup
      class="site-toolbar__tools"
      type="single"
      :disabled="disabled"
      :model-value="activeTool"
      @update:model-value="onToolChange"
    >
      <ToolbarToggleItem
        v-for="tool in toolItems"
        :key="tool.value"
        class="site-toolbar__button site-toolbar__tool"
        :title="labels[tool.labelKey]"
        :value="tool.value"
      >
        <span :class="tool.icon" />
      </ToolbarToggleItem>
    </ToolbarToggleGroup>

    <ToolbarSeparator class="site-toolbar__separator" />

    <PainterSlider
      v-model="stabilizerStrengthModel"
      class="site-toolbar__stabilizer"
      :disabled="disabled"
      icon="i-ph-wave-sine"
      :label="labels.stabilizer"
      :max="STABILIZER_MAX"
      :min="STABILIZER_MIN"
      :step="1"
      :title="labels.stabilizer"
      variant="compact"
    />

    <ToolbarSeparator class="site-toolbar__separator" />

    <ToolbarButton
      v-for="action in exportActions"
      :key="action.command"
      class="site-toolbar__button"
      :disabled="disabled"
      :title="labels[action.labelKey]"
      @click="emit('command', action.command)"
    >
      <span :class="action.icon" />
    </ToolbarButton>
  </ToolbarRoot>
</template>

<style scoped>
.site-toolbar {
  display: inline-flex;
  max-width: 100%;
  height: 36px;
  align-items: center;
  gap: 3px;
  overflow-x: auto;
  padding: 3px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
  background: rgb(255 255 255 / 5%);
  scrollbar-width: none;
}

.site-toolbar::-webkit-scrollbar {
  display: none;
}

.site-toolbar__tools {
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

:global(.site-toolbar__button) {
  display: inline-grid;
  width: 30px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: rgb(255 255 255 / 80%);
  font-size: 17px;
  outline: none;
}

:global(.site-toolbar__button:hover) {
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 10%);
  color: white;
}

:global(.site-toolbar__button:focus-visible) {
  border-color: rgb(96 165 250 / 78%);
  box-shadow: 0 0 0 2px rgb(96 165 250 / 18%);
}

:global(.site-toolbar__button[data-state='on']),
:global(.site-toolbar__tool[data-state='on']) {
  border-color: rgb(96 165 250 / 55%);
  background: rgb(96 165 250 / 18%);
  color: white;
}

:global(.site-toolbar__button:disabled),
:global(.site-toolbar__button[data-disabled]) {
  color: rgb(255 255 255 / 25%);
  pointer-events: none;
}

.site-toolbar__separator {
  width: 1px;
  height: 22px;
  margin: 0 3px;
  background: rgb(255 255 255 / 12%);
}

.site-toolbar__stabilizer {
  flex: 0 0 auto;
  --painter-slider-compact-track-size: 88px;
  --painter-slider-compact-track-size-mobile: 74px;
}
</style>

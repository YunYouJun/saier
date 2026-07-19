<script setup lang="ts">
import type { SitePainterMenuCommand, SitePainterTool } from '~/types/painter-app'
import PainterSlider from '@saier/vue/components/PainterSlider.vue'
import PainterToolSwitcher from '@saier/vue/components/PainterToolSwitcher.vue'
import {
  ToolbarButton,
  ToolbarRoot,
  ToolbarSeparator,
} from 'reka-ui'
import { computed } from 'vue'

interface SitePainterToolbarLabels {
  newCanvas: string
  openProject: string
  saveProject: string
  cloudSync: string
  cloudRoom: string
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
  recordingStart: string
  recordingStop: string
  recordingReplay: string
  recordingClear: string
}

const props = defineProps<{
  activeTool: SitePainterTool
  canRedo: boolean
  canReplayRecording: boolean
  canUndo: boolean
  disabled: boolean
  labels: SitePainterToolbarLabels
  recordingCount: number
  recordingEnabled: boolean
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

const fileActions: { command: SitePainterMenuCommand, labelKey: 'cloudRoom' | 'cloudSync' | 'importImage' | 'newCanvas' | 'openProject' | 'saveProject', icon: string }[] = [
  { command: 'file:new', labelKey: 'newCanvas', icon: 'i-ph-file-plus' },
  { command: 'file:open-project', labelKey: 'openProject', icon: 'i-ph-folder-open' },
  { command: 'file:save-project', labelKey: 'saveProject', icon: 'i-ph-floppy-disk' },
  { command: 'file:cloud-sync', labelKey: 'cloudSync', icon: 'i-ph-cloud-arrow-up' },
  { command: 'file:cloud-room', labelKey: 'cloudRoom', icon: 'i-ph-broadcast' },
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

const recordingActions: { command: SitePainterMenuCommand, labelKey: 'recordingReplay' | 'recordingClear', icon: string, disabled: () => boolean }[] = [
  { command: 'recording:replay-last', labelKey: 'recordingReplay', icon: 'i-ph-play', disabled: () => !props.canReplayRecording },
  { command: 'recording:clear', labelKey: 'recordingClear', icon: 'i-ph-trash', disabled: () => props.recordingCount <= 0 },
]

const toolItems: { value: SitePainterTool, labelKey: 'brush' | 'eraser' | 'pan' | 'image' | 'selection', icon: string }[] = [
  { value: 'brush', labelKey: 'brush', icon: 'i-ph-paint-brush' },
  { value: 'eraser', labelKey: 'eraser', icon: 'i-ph-eraser' },
  { value: 'drag', labelKey: 'pan', icon: 'i-ph-hand' },
  { value: 'image', labelKey: 'image', icon: 'i-ph-image' },
  { value: 'selection', labelKey: 'selection', icon: 'i-ph-selection' },
]

const toolOptions = computed(() => toolItems.map(tool => ({
  icon: tool.icon,
  label: props.labels[tool.labelKey],
  value: tool.value,
})))

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

    <PainterToolSwitcher
      :disabled="disabled"
      :label="labels.tools"
      :model-value="activeTool"
      :tools="toolOptions"
      @update:model-value="onToolChange"
    />

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
      class="site-toolbar__button"
      :aria-pressed="recordingEnabled ? 'true' : 'false'"
      :data-state="recordingEnabled ? 'on' : undefined"
      :disabled="disabled"
      :title="recordingEnabled ? labels.recordingStop : labels.recordingStart"
      @click="emit('command', 'recording:toggle')"
    >
      <span class="i-ph-record" />
    </ToolbarButton>
    <ToolbarButton
      v-for="action in recordingActions"
      :key="action.command"
      class="site-toolbar__button"
      :disabled="disabled || action.disabled()"
      :title="labels[action.labelKey]"
      @click="emit('command', action.command)"
    >
      <span :class="action.icon" />
    </ToolbarButton>

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
  max-width: none;
  height: 36px;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  padding: 3px;
  border: 1px solid var(--saier-color-border);
  border-radius: 7px;
  background: var(--saier-color-surface);
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
  color: var(--saier-color-text-muted);
  font-size: 17px;
  outline: none;
}

:global(.site-toolbar__button:hover) {
  border-color: var(--saier-color-border);
  background: var(--saier-color-surface-hover);
  color: var(--saier-color-text);
}

:global(.site-toolbar__button:focus-visible) {
  border-color: var(--saier-color-accent-border);
  box-shadow: 0 0 0 2px var(--saier-color-accent-soft);
}

:global(.site-toolbar__button[data-state='on']) {
  border-color: var(--saier-color-accent-border);
  background: var(--saier-color-accent-soft);
  color: var(--saier-color-text);
}

:global(.site-toolbar__button:disabled),
:global(.site-toolbar__button[data-disabled]) {
  color: var(--saier-color-text-disabled);
  pointer-events: none;
}

.site-toolbar__separator {
  width: 1px;
  height: 22px;
  margin: 0 3px;
  background: var(--saier-color-surface-hover);
}

.site-toolbar__stabilizer {
  flex: 0 0 auto;
  --painter-slider-compact-track-size: 88px;
  --painter-slider-compact-track-size-mobile: 74px;
}
</style>

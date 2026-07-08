<script setup lang="ts">
import PainterSlider from '@saier/vue/components/PainterSlider.vue'
import { ToolbarButton, ToolbarRoot, ToolbarSeparator } from 'reka-ui'
import { computed } from 'vue'

type SiteStrokeReplayCommand
  = | 'recording:export-log'
    | 'recording:import-log'
    | 'recording:pause'
    | 'recording:play'
    | 'recording:seek-start'
    | 'recording:step-forward'

interface SiteStrokeReplayLabels {
  exportLog: string
  importLog: string
  pause: string
  play: string
  position: string
  reset: string
  speed: string
  step: string
}

const props = defineProps<{
  count: number
  disabled: boolean
  labels: SiteStrokeReplayLabels
  playing: boolean
  position: number
  speed: number
}>()

const emit = defineEmits<{
  'command': [command: SiteStrokeReplayCommand]
  'seek': [position: number]
  'update:speed': [speed: number]
}>()

const normalizedCount = computed(() => Math.max(0, Math.floor(props.count)))
const normalizedPosition = computed(() => clampInteger(props.position, 0, normalizedCount.value))
const canStepForward = computed(() => !props.disabled && normalizedPosition.value < normalizedCount.value)

const positionModel = computed({
  get(): number {
    return normalizedPosition.value
  },
  set(position: number): void {
    emit('seek', clampInteger(position, 0, normalizedCount.value))
  },
})

const speedModel = computed({
  get(): number {
    return clampSpeed(props.speed)
  },
  set(speed: number): void {
    emit('update:speed', clampSpeed(speed))
  },
})

function playPause(): void {
  emit('command', props.playing ? 'recording:pause' : 'recording:play')
}

function formatPosition(position: number): string {
  return `${Math.round(position)} / ${normalizedCount.value}`
}

function formatSpeed(speed: number): string {
  return `${speed.toFixed(2)}x`
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  return Math.max(min, Math.min(max, Math.round(value)))
}

function clampSpeed(value: number): number {
  if (!Number.isFinite(value))
    return 1
  return Math.max(0.25, Math.min(4, Math.round(value * 4) / 4))
}
</script>

<template>
  <ToolbarRoot class="site-stroke-replay" :aria-label="labels.position" loop>
    <ToolbarButton
      class="site-stroke-replay__button"
      :disabled="disabled"
      :title="labels.importLog"
      @click="emit('command', 'recording:import-log')"
    >
      <span class="i-ph-upload-simple" />
    </ToolbarButton>
    <ToolbarButton
      class="site-stroke-replay__button"
      :disabled="disabled || normalizedCount <= 0"
      :title="labels.exportLog"
      @click="emit('command', 'recording:export-log')"
    >
      <span class="i-ph-download-simple" />
    </ToolbarButton>

    <ToolbarSeparator class="site-stroke-replay__separator" />

    <ToolbarButton
      class="site-stroke-replay__button"
      :disabled="disabled || normalizedPosition <= 0"
      :title="labels.reset"
      @click="emit('command', 'recording:seek-start')"
    >
      <span class="i-ph-skip-back" />
    </ToolbarButton>
    <ToolbarButton
      class="site-stroke-replay__button"
      :disabled="disabled || (!playing && !canStepForward)"
      :title="playing ? labels.pause : labels.play"
      @click="playPause"
    >
      <span :class="playing ? 'i-ph-pause' : 'i-ph-play'" />
    </ToolbarButton>
    <ToolbarButton
      class="site-stroke-replay__button"
      :disabled="!canStepForward"
      :title="labels.step"
      @click="emit('command', 'recording:step-forward')"
    >
      <span class="i-ph-skip-forward" />
    </ToolbarButton>

    <ToolbarSeparator class="site-stroke-replay__separator" />

    <PainterSlider
      v-model="positionModel"
      class="site-stroke-replay__position"
      :disabled="disabled || normalizedCount <= 0"
      :format-value="formatPosition"
      icon="i-ph-timeline"
      :label="labels.position"
      :max="normalizedCount"
      :min="0"
      :step="1"
      variant="compact"
    />
    <PainterSlider
      v-model="speedModel"
      class="site-stroke-replay__speed"
      :disabled="disabled"
      :format-value="formatSpeed"
      icon="i-ph-gauge"
      :label="labels.speed"
      :max="4"
      :min="0.25"
      :step="0.25"
      variant="compact"
    />
  </ToolbarRoot>
</template>

<style scoped>
.site-stroke-replay {
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

.site-stroke-replay::-webkit-scrollbar {
  display: none;
}

:global(.site-stroke-replay__button) {
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

:global(.site-stroke-replay__button:hover) {
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 10%);
  color: white;
}

:global(.site-stroke-replay__button:focus-visible) {
  border-color: rgb(96 165 250 / 78%);
  box-shadow: 0 0 0 2px rgb(96 165 250 / 18%);
}

:global(.site-stroke-replay__button:disabled),
:global(.site-stroke-replay__button[data-disabled]) {
  color: rgb(255 255 255 / 25%);
  pointer-events: none;
}

.site-stroke-replay__separator {
  width: 1px;
  height: 22px;
  margin: 0 3px;
  background: rgb(255 255 255 / 12%);
}

.site-stroke-replay__position {
  flex: 0 0 auto;
  --painter-slider-compact-track-size: 132px;
  --painter-slider-compact-track-size-mobile: 92px;
}

.site-stroke-replay__speed {
  flex: 0 0 auto;
  --painter-slider-compact-track-size: 76px;
  --painter-slider-compact-track-size-mobile: 62px;
}
</style>

<script lang="ts" setup>
import type { BrushPresetId, PainterBrushState } from '@saier/core'
import type { Painter } from '../../pixi-painter/src'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import BrushPresetPicker from './BrushPresetPicker.vue'
import '@advjs/gui/dist/icons.css'

interface PainterOptionsBarLabels {
  pressure: string
  size: string
  opacity: string
  spacing: string
  hardness: string
  flow: string
}

const props = defineProps<{
  painter: Painter
  labels?: Partial<PainterOptionsBarLabels>
}>()

const DEFAULT_LABELS: PainterOptionsBarLabels = {
  pressure: 'Pressure',
  size: 'Size',
  opacity: 'Opacity',
  spacing: 'Spacing',
  hardness: 'Hard',
  flow: 'Flow',
}

const text = computed(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
}))

const initialBrush = props.painter.controller.getState().brush
const presetId = ref<BrushPresetId>(initialBrush.presetId)
const presets = ref(initialBrush.presets)
const size = ref(initialBrush.size)
const opacity = ref(initialBrush.opacity)
const spacing = ref(initialBrush.spacing)
const hardness = ref(initialBrush.hardness)
const flow = ref(initialBrush.flow)
const enablePressure = ref(true)

function handleBrushChange(brush: PainterBrushState) {
  presetId.value = brush.presetId
  presets.value = brush.presets
  size.value = brush.size
  opacity.value = brush.opacity
  spacing.value = brush.spacing
  hardness.value = brush.hardness
  flow.value = brush.flow
}

props.painter.controller.on('brush:change', handleBrushChange)

onBeforeUnmount(() => {
  props.painter.controller.off('brush:change', handleBrushChange)
})

watch(presetId, (value) => {
  if (value !== props.painter.controller.getState().brush.presetId)
    props.painter.brush.setPreset(value)
})

watch(size, (value) => {
  if (value !== props.painter.controller.getState().brush.size)
    props.painter.brush.setSize(value)
})

watch(opacity, (value) => {
  if (value !== props.painter.controller.getState().brush.opacity)
    props.painter.brush.setOpacity(value)
})

watch(spacing, (value) => {
  if (value !== props.painter.controller.getState().brush.spacing)
    props.painter.brush.setSpacing(value)
})

watch(hardness, (value) => {
  if (value !== props.painter.controller.getState().brush.hardness)
    props.painter.brush.setHardness(value)
})

watch(flow, (value) => {
  if (value !== props.painter.controller.getState().brush.flow)
    props.painter.brush.setFlow(value)
})

watch(enablePressure, (value) => {
  props.painter.brush.setPressureEnabled(value)
  props.painter.eraser.setPressureEnabled(value)
})
</script>

<template>
  <div bg="dark-100" flex="~ col" gap="2" p="2" rounded-lg text-white>
    <BrushPresetPicker
      :presets="presets"
      :active-preset-id="presetId"
      @select="presetId = $event"
    />

    <div class="painter-options__params">
      <AGUICheckbox v-model:checked="enablePressure" class="painter-options__pressure" :label="text.pressure" />
      <label class="painter-param">
        <span>{{ text.size }}</span>
        <AGUISlider v-model="size" class="painter-param__slider" :min="1" :max="100" :step="1" />
      </label>
      <label class="painter-param">
        <span>{{ text.opacity }}</span>
        <AGUISlider v-model="opacity" class="painter-param__slider" :min="0" :max="1" :step="0.01" />
      </label>
      <label class="painter-param">
        <span>{{ text.spacing }}</span>
        <AGUISlider v-model="spacing" class="painter-param__slider" :min="0.05" :max="1" :step="0.01" />
      </label>
      <label class="painter-param">
        <span>{{ text.hardness }}</span>
        <AGUISlider v-model="hardness" class="painter-param__slider" :min="0" :max="1" :step="0.01" />
      </label>
      <label class="painter-param">
        <span>{{ text.flow }}</span>
        <AGUISlider v-model="flow" class="painter-param__slider" :min="1" :max="80" :step="1" />
      </label>
    </div>
  </div>
</template>

<style lang="scss">
.painter-options__params {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 8px 10px;
  align-items: end;
}

.painter-options__pressure {
  min-height: 34px;
  align-self: end;
}

.painter-param {
  display: grid;
  min-width: 0;
  gap: 4px;
  font-size: 12px;
  white-space: nowrap;
}

.painter-param span {
  overflow: hidden;
  text-overflow: ellipsis;
}

.painter-param__slider {
  width: 100%;
  min-width: 0;
}

.painter-param__slider > div,
.painter-param__slider input[type='range'] {
  width: 100%;
  min-width: 0;
}

input[type='checkbox'] {
  background: none;

  &::before {
    content: none !important;
  }
}
</style>

<script lang="ts" setup>
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from 'reka-ui'
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{
  disabled?: boolean
  formatValue?: (value: number) => string
  label: string
  max?: number
  min?: number
  precision?: number
  step?: number
  unit?: string
}>(), {
  disabled: false,
  max: 100,
  min: 0,
  step: 1,
  unit: '',
})

const model = defineModel<number>({ required: true })

const labelId = useId()

const sliderValue = computed({
  get(): number[] {
    return [model.value]
  },
  set(value: number[] | undefined): void {
    const next = value?.[0]
    if (typeof next === 'number')
      model.value = next
  },
})

const displayValue = computed(() => {
  return props.formatValue?.(model.value) ?? formatNumber(model.value)
})

function formatNumber(value: number): string {
  const precision = props.precision ?? precisionFromStep(props.step)
  const formatted = precision > 0
    ? value.toFixed(precision)
    : String(Math.round(value))

  return props.unit ? `${formatted}${props.unit}` : formatted
}

function precisionFromStep(step: number): number {
  const [, fraction = ''] = String(step).split('.')
  return Math.min(fraction.length, 3)
}
</script>

<template>
  <div class="painter-slider" :data-disabled="disabled ? '' : undefined">
    <div class="painter-slider__header">
      <span :id="labelId" class="painter-slider__label">{{ label }}</span>
      <output class="painter-slider__value">{{ displayValue }}</output>
    </div>

    <SliderRoot
      v-model="sliderValue"
      class="painter-slider__root"
      :aria-label="label"
      :aria-labelledby="labelId"
      :aria-valuetext="displayValue"
      :disabled="disabled"
      :max="max"
      :min="min"
      orientation="horizontal"
      :step="step"
      thumb-alignment="contain"
    >
      <SliderTrack class="painter-slider__track">
        <SliderRange class="painter-slider__range" />
      </SliderTrack>
      <SliderThumb class="painter-slider__thumb" />
    </SliderRoot>
  </div>
</template>

<style scoped>
.painter-slider {
  display: grid;
  min-width: 0;
  gap: 5px;
  color: rgb(255 255 255 / 84%);
  font-size: 12px;
}

.painter-slider__header {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 8px;
}

.painter-slider__label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.painter-slider__value {
  min-width: 44px;
  color: rgb(255 255 255 / 58%);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.painter-slider__root {
  position: relative;
  display: flex;
  height: 18px;
  min-width: 0;
  align-items: center;
  touch-action: none;
  user-select: none;
}

.painter-slider__track {
  position: relative;
  width: 100%;
  height: 6px;
  flex: 1;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 999px;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 8%) 1px, transparent 1px) 0 0 / 10px 100%,
    rgb(0 0 0 / 30%);
}

.painter-slider__range {
  position: absolute;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #60a5fa, #34d399);
}

.painter-slider__thumb {
  display: block;
  width: 12px;
  height: 18px;
  border: 1px solid rgb(255 255 255 / 72%);
  border-radius: 4px;
  background: rgb(31 35 42);
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 40%),
    0 4px 12px rgb(0 0 0 / 38%);
  outline: none;
}

.painter-slider__thumb:focus-visible {
  border-color: rgb(147 197 253);
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 40%),
    0 0 0 3px rgb(96 165 250 / 26%);
}

.painter-slider[data-disabled] {
  opacity: 0.45;
}
</style>

<script lang="ts" setup>
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from 'reka-ui'
import { computed, useId } from 'vue'
import '../styles/tokens.css'

type PainterSliderVariant = 'compact' | 'panel' | 'row'

const props = withDefaults(defineProps<{
  disabled?: boolean
  formatValue?: (value: number) => string
  icon?: string
  label: string
  max?: number
  min?: number
  precision?: number
  step?: number
  unit?: string
  variant?: PainterSliderVariant
}>(), {
  disabled: false,
  max: 100,
  min: 0,
  step: 1,
  unit: '',
  variant: 'panel',
})

const model = defineModel<number>({ required: true })

const labelId = useId()

const rootClass = computed(() => [
  'painter-slider',
  `painter-slider--${props.variant}`,
])

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
  <div :class="rootClass" :data-disabled="disabled ? '' : undefined">
    <div v-if="variant === 'panel'" class="painter-slider__header">
      <span :id="labelId" class="painter-slider__label">{{ label }}</span>
      <output class="painter-slider__value">{{ displayValue }}</output>
    </div>

    <template v-else>
      <span v-if="icon" class="painter-slider__icon" :class="icon" aria-hidden="true" />
      <span :id="labelId" class="painter-slider__label">{{ label }}</span>
    </template>

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
      <SliderThumb class="painter-slider__thumb" :aria-label="label" :aria-valuetext="displayValue" />
    </SliderRoot>

    <output v-if="variant !== 'panel'" class="painter-slider__value">{{ displayValue }}</output>
  </div>
</template>

<style scoped>
.painter-slider {
  display: grid;
  min-width: 0;
  gap: var(--saier-space-1);
  color: var(--saier-color-text, white);
  font-size: var(--saier-font-size-control);
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
  text-align: left;
}

.painter-slider__icon {
  flex: 0 0 auto;
  color: currentColor;
}

.painter-slider__value {
  min-width: 44px;
  color: var(--saier-color-text-subtle, rgb(255 255 255 / 54%));
  font-size: var(--saier-font-size-caption);
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.painter-slider__root {
  position: relative;
  display: flex;
  height: var(--saier-control-size);
  min-width: 0;
  align-items: center;
  touch-action: none;
  user-select: none;
}

.painter-slider__track {
  position: relative;
  width: 100%;
  height: var(--saier-slider-track-height);
  flex: 1;
  overflow: hidden;
  border-radius: 999px;
  background: var(--saier-color-control-track, rgb(0 0 0 / 30%));
}

.painter-slider__range {
  position: absolute;
  height: 100%;
  border-radius: inherit;
  background: var(--saier-color-accent, #60a5fa);
}

.painter-slider__thumb {
  display: block;
  width: var(--saier-slider-thumb-size);
  height: var(--saier-slider-thumb-size);
  border-radius: 50%;
  background: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
  outline: none;
}

.painter-slider__thumb:focus-visible {
  outline: var(--saier-focus-width) solid var(--saier-color-focus, #93c5fd);
  outline-offset: 2px;
}

.painter-slider--row {
  grid-template-columns: 64px minmax(0, 1fr) 44px;
  min-height: var(--saier-control-size);
  align-items: center;
  gap: var(--saier-space-2);
}

.painter-slider[data-disabled] {
  opacity: 0.45;
}

.painter-slider--compact {
  display: inline-flex;
  height: var(--saier-control-size);
  align-items: center;
  gap: var(--saier-space-2);
  padding-inline: var(--saier-space-2);
  color: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
}

.painter-slider--compact .painter-slider__icon {
  font-size: 16px;
}

.painter-slider--compact .painter-slider__label {
  max-width: 78px;
}

.painter-slider--compact .painter-slider__root {
  width: var(--painter-slider-compact-track-size, 88px);
  flex: 0 0 var(--painter-slider-compact-track-size, 88px);
}

.painter-slider--compact .painter-slider__value {
  min-width: 2ch;
}

@media (max-width: 640px) {
  .painter-slider--compact .painter-slider__label {
    display: none;
  }

  .painter-slider--compact .painter-slider__root {
    width: var(--painter-slider-compact-track-size-mobile, 74px);
    flex-basis: var(--painter-slider-compact-track-size-mobile, 74px);
  }
}
</style>

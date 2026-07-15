<script lang="ts" setup>
import {
  SliderRange,
  SliderRoot,
  SliderThumb,
  SliderTrack,
} from 'reka-ui'
import { computed, useId } from 'vue'

type PainterSliderVariant = 'compact' | 'panel'

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
  gap: 5px;
  color: var(--saier-color-text, white);
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

.painter-slider__icon {
  flex: 0 0 auto;
  color: currentColor;
}

.painter-slider__value {
  min-width: 44px;
  color: var(--saier-color-text-subtle, rgb(255 255 255 / 54%));
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
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 999px;
  background:
    linear-gradient(90deg, var(--saier-color-border, rgb(255 255 255 / 8%)) 1px, transparent 1px) 0 0 / 10px 100%,
    var(--saier-color-control-track, rgb(0 0 0 / 30%));
}

.painter-slider__range {
  position: absolute;
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, var(--saier-color-accent, #60a5fa), var(--saier-color-success, #34d399));
}

.painter-slider__thumb {
  display: block;
  width: 12px;
  height: 18px;
  border: 1px solid var(--saier-color-border-strong, rgb(255 255 255 / 72%));
  border-radius: 4px;
  background: var(--saier-color-control-thumb, rgb(31 35 42));
  box-shadow:
    0 0 0 1px var(--saier-color-swatch-inset, rgb(0 0 0 / 40%)),
    var(--saier-shadow-control, 0 4px 12px rgb(0 0 0 / 38%));
  outline: none;
}

.painter-slider__thumb:focus-visible {
  border-color: var(--saier-color-focus, rgb(147 197 253));
  box-shadow:
    0 0 0 1px var(--saier-color-swatch-inset, rgb(0 0 0 / 40%)),
    0 0 0 3px var(--saier-color-accent-soft, rgb(96 165 250 / 26%));
}

.painter-slider[data-disabled] {
  opacity: 0.45;
}

.painter-slider--compact {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 6px;
  padding: 0 7px;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 5px;
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

.painter-slider--compact .painter-slider__track {
  height: 5px;
}

.painter-slider--compact .painter-slider__thumb {
  width: 10px;
  height: 16px;
  border-radius: 3px;
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

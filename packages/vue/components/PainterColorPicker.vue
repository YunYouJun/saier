<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, shallowRef, useId, useTemplateRef, watch } from 'vue'
import ColorWheelPicker from './ColorWheelPicker.vue'

interface PainterColorPickerLabels {
  blue: string
  current: string
  green: string
  hex: string
  hue: string
  palette: string
  red: string
  saturation: string
  value: string
}

type ColorPickerSectionId = 'palette' | 'rgbSliders' | 'wheel'

type ColorPickerVisibleSections = Partial<Record<ColorPickerSectionId, boolean>>

const props = defineProps<{
  label?: string
  labels?: Partial<PainterColorPickerLabels>
  modelValue: number | string
  visibleSections?: ColorPickerVisibleSections
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const root = useTemplateRef<HTMLElement>('root')
const isOpen = shallowRef(false)
const color = shallowRef(toHex(props.modelValue))

const panelId = useId()
const swatches = [
  '#000000',
  '#ffffff',
  '#ef4444',
  '#f97316',
  '#facc15',
  '#22c55e',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#7c2d12',
  '#525252',
]

const buttonStyle = computed(() => ({
  backgroundColor: color.value,
}))

watch(() => props.modelValue, (value) => {
  color.value = toHex(value)
})

onMounted(() => {
  document.addEventListener('pointerdown', closeOnOutsidePointer)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeOnOutsidePointer)
})

function closeOnOutsidePointer(event: PointerEvent): void {
  if (!isOpen.value || root.value?.contains(event.target as Node))
    return

  isOpen.value = false
}

function closeOnEscape(event: KeyboardEvent): void {
  if (event.key === 'Escape')
    isOpen.value = false
}

function onColorChange(value: string | number): void {
  const next = toHex(value)
  color.value = next
  emit('update:modelValue', next)
}

function toHex(value: string | number): string {
  if (typeof value === 'number')
    return `#${Math.round(value).toString(16).padStart(6, '0').slice(-6)}`

  const trimmed = value.trim()
  if (!/^#?(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed))
    return '#000000'

  let hex = trimmed.replace(/^#/, '')
  if (hex.length === 3 || hex.length === 4)
    hex = hex.split('').map(char => char + char).join('')
  return `#${hex.slice(0, 6).toLowerCase()}`
}
</script>

<template>
  <div ref="root" class="painter-color-picker" @keydown="closeOnEscape">
    <button
      class="painter-color-picker__button"
      type="button"
      :aria-controls="panelId"
      :aria-expanded="isOpen"
      :aria-label="label"
      :style="buttonStyle"
      @click="isOpen = !isOpen"
    />

    <div v-if="isOpen" :id="panelId" class="painter-color-picker__panel">
      <ColorWheelPicker
        :model-value="color"
        :labels="labels"
        :swatches="swatches"
        :visible-sections="visibleSections"
        @update:model-value="onColorChange"
      />
    </div>
  </div>
</template>

<style scoped>
.painter-color-picker {
  position: relative;
}

.painter-color-picker__button {
  width: 36px;
  height: 36px;
  border: 2px solid var(--saier-color-swatch-outline, rgb(255 255 255 / 86%));
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px var(--saier-color-swatch-inset, rgb(0 0 0 / 46%));
}

.painter-color-picker__button:focus-visible {
  outline: 2px solid var(--saier-color-focus, rgb(96 165 250 / 78%));
  outline-offset: 3px;
}

.painter-color-picker__panel {
  position: absolute;
  z-index: 40;
  top: 0;
  left: calc(100% + 10px);
  width: 306px;
  padding: 12px;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 8px;
  background: var(--saier-color-panel-raised, rgb(30 30 32 / 96%));
  box-shadow: var(--saier-shadow-menu, 0 18px 50px rgb(0 0 0 / 38%));
}

@media (max-width: 640px) {
  .painter-color-picker__panel {
    width: min(306px, calc(100vw - 82px));
  }
}
</style>

<script setup lang="ts">
import { computed, onBeforeUnmount, shallowRef, useId, watch } from 'vue'
import PainterSlider from './PainterSlider.vue'

interface HsvColor {
  h: number
  s: number
  v: number
}

interface RgbColor {
  r: number
  g: number
  b: number
}

interface ColorWheelPickerLabels {
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

type ColorWheelPickerDensity = 'comfortable' | 'compact'

const props = withDefaults(defineProps<{
  density?: ColorWheelPickerDensity
  labels?: Partial<ColorWheelPickerLabels>
  size?: number
  swatches?: string[]
  visibleSections?: ColorPickerVisibleSections
}>(), {
  density: 'comfortable',
  size: 148,
  swatches: () => [
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
  ],
})

const model = defineModel<string | number>({ required: true })
const hueId = useId()
const svId = useId()

const DEFAULT_LABELS: ColorWheelPickerLabels = {
  blue: 'Blue',
  current: 'Current color',
  green: 'Green',
  hex: 'Hex',
  hue: 'Hue',
  palette: 'Palette',
  red: 'Red',
  saturation: 'Saturation',
  value: 'Value',
}

const text = computed(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
}))

const hsv = shallowRef<HsvColor>(hexToHsv(toHex(model.value)))
const hexValue = shallowRef(toHex(model.value))
let activeDrag: 'hue' | 'sv' | null = null
let activeDragTarget: HTMLElement | null = null

const pickerClass = computed(() => ({
  'color-wheel-picker--compact': props.density === 'compact',
}))

const wheelStyle = computed(() => ({
  width: `${props.size}px`,
  height: `${props.size}px`,
}))

const hueThumbStyle = computed(() => {
  const radius = props.size / 2 - 9
  const angle = (hsv.value.h - 90) * Math.PI / 180
  return {
    left: `${props.size / 2 + Math.cos(angle) * radius}px`,
    top: `${props.size / 2 + Math.sin(angle) * radius}px`,
  }
})

const svStyle = computed(() => ({
  backgroundColor: `hsl(${hsv.value.h} 100% 50%)`,
  height: `${props.size}px`,
}))

const svThumbStyle = computed(() => ({
  left: `${hsv.value.s * 100}%`,
  top: `${(1 - hsv.value.v) * 100}%`,
}))

const normalizedSwatches = computed(() => props.swatches.map(toHex))
const visible = computed<Required<Record<ColorPickerSectionId, boolean>>>(() => ({
  palette: props.visibleSections?.palette ?? true,
  rgbSliders: props.visibleSections?.rgbSliders ?? true,
  wheel: props.visibleSections?.wheel ?? true,
}))

const rgb = computed(() => hexToRgb(hexValue.value))

const red = computed({
  get: () => rgb.value.r,
  set: value => setRgbChannel('r', value),
})

const green = computed({
  get: () => rgb.value.g,
  set: value => setRgbChannel('g', value),
})

const blue = computed({
  get: () => rgb.value.b,
  set: value => setRgbChannel('b', value),
})

watch(() => model.value, (value) => {
  const next = toHex(value)
  if (next === hexValue.value)
    return

  hexValue.value = next
  hsv.value = hexToHsv(next)
})

onBeforeUnmount(() => {
  removeDragListeners()
})

function beginHueDrag(event: PointerEvent): void {
  if (!(event.currentTarget instanceof HTMLElement))
    return

  activeDrag = 'hue'
  activeDragTarget = event.currentTarget
  updateHueFromEvent(event, activeDragTarget)
  addDragListeners()
}

function beginSvDrag(event: PointerEvent): void {
  if (!(event.currentTarget instanceof HTMLElement))
    return

  activeDrag = 'sv'
  activeDragTarget = event.currentTarget
  updateSvFromEvent(event, activeDragTarget)
  addDragListeners()
}

function addDragListeners(): void {
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', endDrag)
  window.addEventListener('pointercancel', endDrag)
}

function removeDragListeners(): void {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', endDrag)
  window.removeEventListener('pointercancel', endDrag)
}

function handlePointerMove(event: PointerEvent): void {
  if (!activeDragTarget)
    return

  if (activeDrag === 'hue')
    updateHueFromEvent(event, activeDragTarget)
  else if (activeDrag === 'sv')
    updateSvFromEvent(event, activeDragTarget)
}

function endDrag(): void {
  activeDrag = null
  activeDragTarget = null
  removeDragListeners()
}

function updateHueFromEvent(event: PointerEvent, target: HTMLElement): void {
  const rect = target.getBoundingClientRect()
  const x = event.clientX - rect.left - rect.width / 2
  const y = event.clientY - rect.top - rect.height / 2
  const angle = Math.atan2(y, x) * 180 / Math.PI + 90
  setHsv({ ...hsv.value, h: normalizeHue(angle) })
}

function updateSvFromEvent(event: PointerEvent, target: HTMLElement): void {
  const rect = target.getBoundingClientRect()
  const s = clamp01((event.clientX - rect.left) / rect.width)
  const v = clamp01(1 - (event.clientY - rect.top) / rect.height)
  setHsv({ ...hsv.value, s, v })
}

function onHueKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 10 : 1
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') {
    event.preventDefault()
    setHsv({ ...hsv.value, h: normalizeHue(hsv.value.h + step) })
  }
  else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') {
    event.preventDefault()
    setHsv({ ...hsv.value, h: normalizeHue(hsv.value.h - step) })
  }
  else if (event.key === 'Home') {
    event.preventDefault()
    setHsv({ ...hsv.value, h: 0 })
  }
  else if (event.key === 'End') {
    event.preventDefault()
    setHsv({ ...hsv.value, h: 359 })
  }
}

function onSvKeydown(event: KeyboardEvent): void {
  const step = event.shiftKey ? 0.1 : 0.02
  if (event.key === 'ArrowRight') {
    event.preventDefault()
    setHsv({ ...hsv.value, s: clamp01(hsv.value.s + step) })
  }
  else if (event.key === 'ArrowLeft') {
    event.preventDefault()
    setHsv({ ...hsv.value, s: clamp01(hsv.value.s - step) })
  }
  else if (event.key === 'ArrowUp') {
    event.preventDefault()
    setHsv({ ...hsv.value, v: clamp01(hsv.value.v + step) })
  }
  else if (event.key === 'ArrowDown') {
    event.preventDefault()
    setHsv({ ...hsv.value, v: clamp01(hsv.value.v - step) })
  }
}

function onHexInput(event: Event): void {
  const input = event.target as HTMLInputElement
  hexValue.value = input.value
  if (!isHexColor(input.value))
    return

  const next = toHex(input.value)
  hsv.value = hexToHsv(next)
  model.value = next
}

function selectSwatch(color: string): void {
  setHsv(hexToHsv(color))
}

function setRgbChannel(channel: keyof RgbColor, value: number): void {
  const nextRgb = { ...hexToRgb(hexValue.value), [channel]: clampByte(value) }
  const next = rgbToHex(nextRgb)
  hexValue.value = next
  hsv.value = hexToHsv(next)
  model.value = next
}

function setHsv(next: HsvColor): void {
  hsv.value = {
    h: normalizeHue(next.h),
    s: clamp01(next.s),
    v: clamp01(next.v),
  }
  const nextHex = hsvToHex(hsv.value)
  hexValue.value = nextHex
  model.value = nextHex
}

function toHex(value: string | number): string {
  if (typeof value === 'number')
    return `#${Math.round(value).toString(16).padStart(6, '0').slice(-6)}`

  const trimmed = value.trim()
  if (!isHexColor(trimmed))
    return '#000000'

  let hex = trimmed.replace(/^#/, '')
  if (hex.length === 3 || hex.length === 4)
    hex = hex.split('').map(char => char + char).join('')

  return `#${hex.slice(0, 6).toLowerCase()}`
}

function isHexColor(value: string): boolean {
  return /^#?(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim())
}

function hexToHsv(hex: string): HsvColor {
  const value = Number.parseInt(hex.replace(/^#/, ''), 16)
  const r = ((value >> 16) & 0xFF) / 255
  const g = ((value >> 8) & 0xFF) / 255
  const b = (value & 0xFF) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    if (max === r)
      h = 60 * (((g - b) / delta) % 6)
    else if (max === g)
      h = 60 * ((b - r) / delta + 2)
    else
      h = 60 * ((r - g) / delta + 4)
  }

  return {
    h: normalizeHue(h),
    s: max === 0 ? 0 : delta / max,
    v: max,
  }
}

function hexToRgb(hex: string): RgbColor {
  const value = Number.parseInt(toHex(hex).replace(/^#/, ''), 16)
  return {
    r: (value >> 16) & 0xFF,
    g: (value >> 8) & 0xFF,
    b: value & 0xFF,
  }
}

function hsvToHex(color: HsvColor): string {
  const h = normalizeHue(color.h)
  const s = clamp01(color.s)
  const v = clamp01(color.v)
  const c = v * s
  const x = c * (1 - Math.abs((h / 60) % 2 - 1))
  const m = v - c

  let r = 0
  let g = 0
  let b = 0
  if (h < 60)
    [r, g, b] = [c, x, 0]
  else if (h < 120)
    [r, g, b] = [x, c, 0]
  else if (h < 180)
    [r, g, b] = [0, c, x]
  else if (h < 240)
    [r, g, b] = [0, x, c]
  else if (h < 300)
    [r, g, b] = [x, 0, c]
  else
    [r, g, b] = [c, 0, x]

  return `#${toHexByte(r + m)}${toHexByte(g + m)}${toHexByte(b + m)}`
}

function rgbToHex(color: RgbColor): string {
  return `#${toHexByte(color.r / 255)}${toHexByte(color.g / 255)}${toHexByte(color.b / 255)}`
}

function clampByte(value: number): number {
  return Number.isFinite(value)
    ? Math.max(0, Math.min(255, Math.round(value)))
    : 0
}

function formatRgbValue(value: number): string {
  return String(clampByte(value))
}

function toHexByte(value: number): string {
  return Math.round(clamp01(value) * 255).toString(16).padStart(2, '0')
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

function normalizeHue(value: number): number {
  return ((value % 360) + 360) % 360
}
</script>

<template>
  <div class="color-wheel-picker" :class="pickerClass">
    <div v-if="visible.wheel" class="color-wheel-picker__pickers">
      <div
        :id="hueId"
        class="color-wheel-picker__wheel"
        role="slider"
        tabindex="0"
        :aria-label="text.hue"
        :aria-valuemin="0"
        :aria-valuemax="359"
        :aria-valuenow="Math.round(hsv.h)"
        :style="wheelStyle"
        @keydown="onHueKeydown"
        @pointerdown.prevent="beginHueDrag"
      >
        <span class="color-wheel-picker__wheel-hole" />
        <span class="color-wheel-picker__wheel-thumb" :style="hueThumbStyle" />
      </div>

      <div
        :id="svId"
        class="color-wheel-picker__sv"
        role="group"
        tabindex="0"
        :aria-label="`${text.saturation} / ${text.value}`"
        :style="svStyle"
        @keydown="onSvKeydown"
        @pointerdown.prevent="beginSvDrag"
      >
        <span class="color-wheel-picker__sv-saturation" />
        <span class="color-wheel-picker__sv-value" />
        <span class="color-wheel-picker__sv-thumb" :style="svThumbStyle" />
      </div>
    </div>

    <div class="color-wheel-picker__fields">
      <span
        class="color-wheel-picker__preview"
        :aria-label="text.current"
        :style="{ backgroundColor: hexValue }"
      />
      <label class="color-wheel-picker__hex">
        <span>{{ text.hex }}</span>
        <input :value="hexValue" spellcheck="false" @input="onHexInput">
      </label>
    </div>

    <div v-if="visible.rgbSliders" class="color-wheel-picker__rgb">
      <PainterSlider
        v-model="red"
        :label="text.red"
        :max="255"
        :min="0"
        :step="1"
        :format-value="formatRgbValue"
      />
      <PainterSlider
        v-model="green"
        :label="text.green"
        :max="255"
        :min="0"
        :step="1"
        :format-value="formatRgbValue"
      />
      <PainterSlider
        v-model="blue"
        :label="text.blue"
        :max="255"
        :min="0"
        :step="1"
        :format-value="formatRgbValue"
      />
    </div>

    <div v-if="visible.palette" class="color-wheel-picker__palette" :aria-label="text.palette">
      <button
        v-for="swatch in normalizedSwatches"
        :key="swatch"
        class="color-wheel-picker__swatch"
        type="button"
        :aria-label="swatch"
        :class="{ 'is-active': swatch === toHex(model) }"
        :style="{ backgroundColor: swatch }"
        @click="selectSwatch(swatch)"
      />
    </div>
  </div>
</template>

<style scoped>
.color-wheel-picker {
  width: 100%;
  color: white;
  user-select: none;
}

.color-wheel-picker__pickers {
  display: grid;
  grid-template-columns: auto minmax(92px, 1fr);
  gap: 12px;
  align-items: center;
}

.color-wheel-picker__wheel {
  position: relative;
  border-radius: 50%;
  background: conic-gradient(from 0deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00);
  touch-action: none;
}

.color-wheel-picker__wheel-hole {
  position: absolute;
  inset: 18px;
  border-radius: 50%;
  background: rgb(30 30 32);
  box-shadow: inset 0 0 0 1px rgb(255 255 255 / 10%);
}

.color-wheel-picker__wheel-thumb,
.color-wheel-picker__sv-thumb {
  position: absolute;
  width: 14px;
  height: 14px;
  border: 2px solid white;
  border-radius: 999px;
  box-shadow: 0 1px 6px rgb(0 0 0 / 62%);
  transform: translate(-50%, -50%);
}

.color-wheel-picker__wheel:focus-visible,
.color-wheel-picker__sv:focus-visible,
.color-wheel-picker__hex input:focus-visible,
.color-wheel-picker__swatch:focus-visible {
  outline: 2px solid rgb(96 165 250 / 78%);
  outline-offset: 2px;
}

.color-wheel-picker__sv {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  touch-action: none;
}

.color-wheel-picker__sv-saturation,
.color-wheel-picker__sv-value {
  position: absolute;
  inset: 0;
}

.color-wheel-picker__sv-saturation {
  background: linear-gradient(to right, #fff, transparent);
}

.color-wheel-picker__sv-value {
  background: linear-gradient(to top, #000, transparent);
}

.color-wheel-picker__fields {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  gap: 10px;
  align-items: end;
  margin-top: 12px;
}

.color-wheel-picker__fields:first-child {
  margin-top: 0;
}

.color-wheel-picker__preview {
  width: 34px;
  height: 34px;
  border: 2px solid rgb(255 255 255 / 82%);
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 40%);
}

.color-wheel-picker__hex {
  display: grid;
  min-width: 0;
  gap: 4px;
  color: rgb(255 255 255 / 62%);
  font-size: 11px;
}

.color-wheel-picker__hex input {
  width: 100%;
  min-width: 0;
  height: 30px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(0 0 0 / 22%);
  color: white;
  font: inherit;
  padding-inline: 8px;
  text-transform: lowercase;
}

.color-wheel-picker__palette {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 6px;
  margin-top: 12px;
}

.color-wheel-picker__rgb {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}

.color-wheel-picker__swatch {
  aspect-ratio: 1;
  min-width: 0;
  border: 1px solid rgb(255 255 255 / 16%);
  border-radius: 6px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 22%);
}

.color-wheel-picker__swatch.is-active {
  border-color: rgb(255 255 255 / 82%);
  box-shadow:
    inset 0 0 0 1px rgb(0 0 0 / 32%),
    0 0 0 2px rgb(96 165 250 / 70%);
}

.color-wheel-picker--compact .color-wheel-picker__pickers {
  grid-template-columns: auto minmax(86px, 1fr);
  gap: 8px;
}

.color-wheel-picker--compact .color-wheel-picker__wheel-hole {
  inset: 14px;
}

.color-wheel-picker--compact .color-wheel-picker__wheel-thumb,
.color-wheel-picker--compact .color-wheel-picker__sv-thumb {
  width: 12px;
  height: 12px;
}

.color-wheel-picker--compact .color-wheel-picker__fields {
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 8px;
  margin-top: 8px;
}

.color-wheel-picker--compact .color-wheel-picker__preview {
  width: 28px;
  height: 28px;
}

.color-wheel-picker--compact .color-wheel-picker__hex {
  gap: 3px;
}

.color-wheel-picker--compact .color-wheel-picker__hex input {
  height: 26px;
  padding-inline: 7px;
}

.color-wheel-picker--compact .color-wheel-picker__rgb {
  gap: 6px;
  margin-top: 8px;
}

.color-wheel-picker--compact .color-wheel-picker__palette {
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 5px;
  margin-top: 8px;
}

.color-wheel-picker--compact .color-wheel-picker__swatch {
  border-radius: 5px;
}
</style>

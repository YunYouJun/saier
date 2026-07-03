<script setup lang="ts">
import type { SiteNewCanvasRequest } from '~/types/painter-app'
import { computed, shallowRef, watch } from 'vue'

interface SiteNewCanvasDialogLabels {
  title: string
  name: string
  width: string
  height: string
  preset: string
  custom: string
  preview: string
  aspectRatio: string
  create: string
  cancel: string
  invalidSize: string
  defaultName: string
  presets: {
    square512: string
    square1024: string
    hd: string
    portrait: string
    a4: string
    large4096: string
  }
}

interface CanvasPreset {
  id: keyof SiteNewCanvasDialogLabels['presets']
  width: number
  height: number
}

const props = defineProps<{
  open: boolean
  nextIndex: number
  labels: SiteNewCanvasDialogLabels
}>()

const emit = defineEmits<{
  close: []
  create: [request: SiteNewCanvasRequest]
}>()

const presets: CanvasPreset[] = [
  { id: 'square512', width: 512, height: 512 },
  { id: 'square1024', width: 1024, height: 1024 },
  { id: 'hd', width: 1920, height: 1080 },
  { id: 'portrait', width: 1080, height: 1920 },
  { id: 'a4', width: 2480, height: 3508 },
  { id: 'large4096', width: 4096, height: 4096 },
]

const selectedPresetId = shallowRef<CanvasPreset['id']>('square1024')
const name = shallowRef('')
const width = shallowRef(1024)
const height = shallowRef(1024)

const canvasPreview = computed(() => {
  const previewWidth = positiveDimension(width.value)
  const previewHeight = positiveDimension(height.value)
  const frameMaxWidth = 140
  const frameMaxHeight = 104

  if (!previewWidth || !previewHeight) {
    return {
      frameHeight: frameMaxHeight,
      frameWidth: frameMaxWidth,
      ratio: '-',
      size: '-',
    }
  }

  const scale = Math.min(frameMaxWidth / previewWidth, frameMaxHeight / previewHeight)
  const frameWidth = Math.max(18, Math.round(previewWidth * scale))
  const frameHeight = Math.max(18, Math.round(previewHeight * scale))

  return {
    frameHeight,
    frameWidth,
    ratio: aspectRatioLabel(previewWidth, previewHeight),
    size: `${Math.round(previewWidth)} x ${Math.round(previewHeight)} px`,
  }
})

const canvasPreviewStyle = computed(() => ({
  height: `${canvasPreview.value.frameHeight}px`,
  width: `${canvasPreview.value.frameWidth}px`,
}))

const isValidSize = computed(() =>
  isValidDimension(width.value) && isValidDimension(height.value),
)

watch(
  () => props.open,
  (open) => {
    if (open)
      resetForm()
  },
  { immediate: true },
)

function resetForm(): void {
  const preset = presets.find(item => item.id === selectedPresetId.value) ?? presets[1]!
  name.value = `${props.labels.defaultName} ${props.nextIndex}`
  width.value = preset.width
  height.value = preset.height
}

function selectPreset(preset: CanvasPreset): void {
  selectedPresetId.value = preset.id
  width.value = preset.width
  height.value = preset.height
}

function submit(): void {
  if (!isValidSize.value)
    return

  emit('create', {
    name: name.value.trim() || `${props.labels.defaultName} ${props.nextIndex}`,
    width: Math.round(width.value),
    height: Math.round(height.value),
  })
}

function isValidDimension(value: number): boolean {
  return Number.isInteger(value) && value >= 64 && value <= 8192
}

function positiveDimension(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined
}

function aspectRatioLabel(width: number, height: number): string {
  const roundedWidth = Math.round(width)
  const roundedHeight = Math.round(height)
  const divisor = greatestCommonDivisor(roundedWidth, roundedHeight)
  return `${roundedWidth / divisor}:${roundedHeight / divisor}`
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(a)
  let right = Math.abs(b)

  while (right !== 0) {
    const next = left % right
    left = right
    right = next
  }

  return left || 1
}
</script>

<template>
  <div v-if="open" class="site-new-canvas" role="dialog" aria-modal="true" :aria-label="labels.title">
    <form class="site-new-canvas__panel" @submit.prevent="submit">
      <header class="site-new-canvas__header">
        <h2 class="site-new-canvas__title">
          {{ labels.title }}
        </h2>
        <button type="button" class="site-new-canvas__icon" :title="labels.cancel" @click="emit('close')">
          <span class="i-ph-x" />
        </button>
      </header>

      <label class="site-new-canvas__field">
        <span>{{ labels.name }}</span>
        <input v-model="name" class="site-new-canvas__input" type="text" autocomplete="off">
      </label>

      <section class="site-new-canvas__presets" :aria-label="labels.preset">
        <button
          v-for="preset in presets"
          :key="preset.id"
          type="button"
          class="site-new-canvas__preset"
          :class="{ 'is-active': selectedPresetId === preset.id }"
          @click="selectPreset(preset)"
        >
          <span>{{ labels.presets[preset.id] }}</span>
          <small>{{ preset.width }} x {{ preset.height }}</small>
        </button>
      </section>

      <div class="site-new-canvas__size">
        <label class="site-new-canvas__field">
          <span>{{ labels.width }}</span>
          <input v-model.number="width" class="site-new-canvas__input" type="number" min="64" max="8192" step="1">
        </label>
        <label class="site-new-canvas__field">
          <span>{{ labels.height }}</span>
          <input v-model.number="height" class="site-new-canvas__input" type="number" min="64" max="8192" step="1">
        </label>
      </div>

      <section class="site-new-canvas__preview" :aria-label="labels.preview">
        <div class="site-new-canvas__preview-stage">
          <div
            class="site-new-canvas__preview-frame"
            :class="{ 'is-invalid': !isValidSize }"
            :style="canvasPreviewStyle"
          />
        </div>
        <div class="site-new-canvas__preview-meta">
          <span>{{ labels.preview }}</span>
          <strong>{{ canvasPreview.size }}</strong>
          <small>{{ labels.aspectRatio }} {{ canvasPreview.ratio }}</small>
        </div>
      </section>

      <p v-if="!isValidSize" class="site-new-canvas__error">
        {{ labels.invalidSize }}
      </p>

      <footer class="site-new-canvas__footer">
        <button type="button" class="site-new-canvas__button" @click="emit('close')">
          {{ labels.cancel }}
        </button>
        <button type="submit" class="site-new-canvas__button site-new-canvas__button--primary" :disabled="!isValidSize">
          {{ labels.create }}
        </button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.site-new-canvas {
  box-sizing: border-box;
  position: absolute;
  z-index: 40;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 14px;
  background: rgb(0 0 0 / 42%);
}

.site-new-canvas__panel {
  box-sizing: border-box;
  width: min(420px, calc(100vw - 28px));
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 8px;
  background: rgb(20 20 22 / 96%);
  box-shadow: 0 24px 70px rgb(0 0 0 / 42%);
  color: white;
  padding: 12px;
}

.site-new-canvas__header,
.site-new-canvas__footer,
.site-new-canvas__size {
  display: flex;
  align-items: center;
  gap: 10px;
}

.site-new-canvas__header {
  justify-content: space-between;
  margin-bottom: 12px;
}

.site-new-canvas__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.site-new-canvas__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 7%);
  color: white;
}

.site-new-canvas__field {
  display: grid;
  min-width: 0;
  gap: 5px;
  color: rgb(255 255 255 / 60%);
  font-size: 12px;
}

.site-new-canvas__input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 34px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: white;
  font-size: 13px;
  outline: none;
  padding: 0 9px;
}

.site-new-canvas__input:focus {
  border-color: rgb(96 165 250 / 70%);
  box-shadow: 0 0 0 2px rgb(96 165 250 / 16%);
}

.site-new-canvas__presets {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 12px 0;
}

.site-new-canvas__preset {
  box-sizing: border-box;
  display: grid;
  min-width: 0;
  gap: 2px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
  background: rgb(255 255 255 / 6%);
  color: white;
  font-size: 12px;
  padding: 8px;
  text-align: left;
}

.site-new-canvas__preset small {
  color: rgb(255 255 255 / 46%);
  font-size: 10px;
}

.site-new-canvas__preset.is-active {
  border-color: rgb(96 165 250 / 58%);
  background: rgb(96 165 250 / 18%);
}

.site-new-canvas__size > * {
  flex: 1 1 0;
}

.site-new-canvas__preview {
  display: grid;
  grid-template-columns: 156px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  margin-top: 12px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
  background: rgb(255 255 255 / 5%);
  padding: 8px;
}

.site-new-canvas__preview-stage {
  display: grid;
  height: 112px;
  min-width: 0;
  place-items: center;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background:
    linear-gradient(45deg, rgb(255 255 255 / 5%) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(255 255 255 / 5%) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(255 255 255 / 5%) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(255 255 255 / 5%) 75%);
  background-position:
    0 0,
    0 8px,
    8px -8px,
    -8px 0;
  background-size: 16px 16px;
}

.site-new-canvas__preview-frame {
  border: 1px solid rgb(96 165 250 / 72%);
  border-radius: 3px;
  background: #fff;
  box-shadow: 0 10px 24px rgb(0 0 0 / 28%);
}

.site-new-canvas__preview-frame.is-invalid {
  border-color: rgb(252 165 165 / 70%);
  background: rgb(255 255 255 / 52%);
}

.site-new-canvas__preview-meta {
  display: grid;
  min-width: 0;
  gap: 3px;
  color: rgb(255 255 255 / 54%);
  font-size: 11px;
}

.site-new-canvas__preview-meta strong {
  overflow: hidden;
  color: white;
  font-size: 13px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-new-canvas__preview-meta small {
  color: rgb(255 255 255 / 46%);
  font-size: 11px;
}

.site-new-canvas__error {
  margin: 8px 0 0;
  color: #fca5a5;
  font-size: 12px;
}

.site-new-canvas__footer {
  justify-content: flex-end;
  margin-top: 14px;
}

.site-new-canvas__button {
  height: 34px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 7%);
  color: white;
  font-size: 13px;
  padding: 0 12px;
}

.site-new-canvas__button--primary {
  border-color: rgb(96 165 250 / 58%);
  background: rgb(96 165 250 / 24%);
}

.site-new-canvas__button:disabled {
  color: rgb(255 255 255 / 28%);
  pointer-events: none;
}

@media (max-width: 420px) {
  .site-new-canvas__preview {
    grid-template-columns: 1fr;
  }
}
</style>

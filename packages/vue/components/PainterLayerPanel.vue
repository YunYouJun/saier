<script lang="ts" setup>
import type { BlendMode, PainterLayerState } from '@saier/core'
import { computed } from 'vue'

interface PainterLayerPanelLabels {
  title: string
  addLayer: string
  hideLayer: string
  showLayer: string
  moveUp: string
  moveDown: string
  removeLayer: string
  lockAlpha: string
  clip: string
  blendModes: Record<BlendMode, string>
}

const props = defineProps<{
  activeLayerId: string | null
  layers: PainterLayerState[]
  thumbnails?: Record<string, string>
  labels?: Partial<Omit<PainterLayerPanelLabels, 'blendModes'>> & {
    blendModes?: Partial<Record<BlendMode, string>>
  }
}>()

const emit = defineEmits<{
  'add': []
  'remove': [id: string]
  'select': [id: string]
  'move': [id: string, toIndex: number]
  'update:visible': [id: string, visible: boolean]
  'update:opacity': [id: string, opacity: number]
  'update:blendMode': [id: string, blendMode: BlendMode]
  'update:label': [id: string, label: string]
  'update:lockAlpha': [id: string, lockAlpha: boolean]
  'update:clip': [id: string, clip: boolean]
}>()

const DEFAULT_LABELS: PainterLayerPanelLabels = {
  title: 'Layers',
  addLayer: 'Add layer',
  hideLayer: 'Hide layer',
  showLayer: 'Show layer',
  moveUp: 'Move up',
  moveDown: 'Move down',
  removeLayer: 'Remove layer',
  lockAlpha: 'Lock transparency',
  clip: 'Clip to layer below',
  blendModes: {
    normal: 'Normal',
    multiply: 'Multiply',
    screen: 'Screen',
    overlay: 'Overlay',
    darken: 'Darken',
    lighten: 'Lighten',
    add: 'Add',
  },
}

const text = computed<PainterLayerPanelLabels>(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
  blendModes: {
    ...DEFAULT_LABELS.blendModes,
    ...props.labels?.blendModes,
  },
}))

const blendModes = computed(() =>
  (Object.keys(DEFAULT_LABELS.blendModes) as BlendMode[]).map(value => ({
    label: text.value.blendModes[value],
    value,
  })),
)

const displayLayers = computed(() =>
  props.layers.map((layer, index) => ({ index, layer })).reverse(),
)

function opacityFromEvent(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function valueFromEvent(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function blendModeFromEvent(event: Event): BlendMode {
  return valueFromEvent(event) as BlendMode
}
</script>

<template>
  <section class="painter-layer-panel">
    <header class="painter-layer-panel__header">
      <span class="painter-layer-panel__title">{{ text.title }}</span>
      <button type="button" class="painter-layer-panel__icon" :title="text.addLayer" @click="emit('add')">
        <span class="i-ph-plus" />
      </button>
    </header>

    <div class="painter-layer-panel__list">
      <article
        v-for="{ layer, index } in displayLayers"
        :key="layer.id"
        class="painter-layer-row"
        :class="{ 'is-active': layer.id === activeLayerId }"
        @click="emit('select', layer.id)"
      >
        <button
          type="button"
          class="painter-layer-panel__icon"
          :title="layer.visible ? text.hideLayer : text.showLayer"
          @click.stop="emit('update:visible', layer.id, !layer.visible)"
        >
          <span :class="layer.visible ? 'i-ph-eye' : 'i-ph-eye-slash'" />
        </button>

        <div class="painter-layer-row__thumb">
          <img v-if="thumbnails?.[layer.id]" :src="thumbnails[layer.id]" alt="">
        </div>

        <input
          class="painter-layer-row__name"
          :value="layer.label"
          @change="emit('update:label', layer.id, valueFromEvent($event))"
          @click.stop
        >

        <div class="painter-layer-row__controls" @click.stop>
          <select
            class="painter-layer-row__blend"
            :value="layer.blendMode"
            @change="emit('update:blendMode', layer.id, blendModeFromEvent($event))"
          >
            <option v-for="mode in blendModes" :key="mode.value" :value="mode.value">
              {{ mode.label }}
            </option>
          </select>

          <input
            class="painter-layer-row__opacity"
            type="range"
            min="0"
            max="1"
            step="0.01"
            :value="layer.opacity"
            @input="emit('update:opacity', layer.id, opacityFromEvent($event))"
          >
        </div>

        <div class="painter-layer-row__actions" @click.stop>
          <button
            type="button"
            class="painter-layer-panel__icon"
            :class="{ 'is-on': layer.lockAlpha }"
            :title="text.lockAlpha"
            :aria-pressed="layer.lockAlpha"
            @click="emit('update:lockAlpha', layer.id, !layer.lockAlpha)"
          >
            <span :class="layer.lockAlpha ? 'i-ph-lock' : 'i-ph-lock-open'" />
          </button>
          <button
            type="button"
            class="painter-layer-panel__icon"
            :class="{ 'is-on': layer.clip }"
            :title="text.clip"
            :aria-pressed="layer.clip"
            :disabled="index <= 0"
            @click="emit('update:clip', layer.id, !layer.clip)"
          >
            <span class="i-ph-arrow-elbow-down-left" />
          </button>
          <button
            type="button"
            class="painter-layer-panel__icon"
            :title="text.moveUp"
            :disabled="index >= layers.length - 1"
            @click="emit('move', layer.id, index + 1)"
          >
            <span class="i-ph-arrow-up" />
          </button>
          <button
            type="button"
            class="painter-layer-panel__icon"
            :title="text.moveDown"
            :disabled="index <= 0"
            @click="emit('move', layer.id, index - 1)"
          >
            <span class="i-ph-arrow-down" />
          </button>
          <button
            type="button"
            class="painter-layer-panel__icon"
            :title="text.removeLayer"
            :disabled="layers.length <= 1"
            @click="emit('remove', layer.id)"
          >
            <span class="i-ph-trash" />
          </button>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.painter-layer-panel {
  width: min(320px, calc(100vw - 16px));
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(18 18 22 / 92%);
  color: white;
  font-size: 12px;
}

.painter-layer-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
}

.painter-layer-panel__title {
  font-weight: 600;
}

.painter-layer-panel__icon {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: white;
}

.painter-layer-panel__icon:disabled {
  cursor: not-allowed;
  opacity: 0.36;
}

.painter-layer-panel__icon.is-on {
  border-color: rgb(120 170 255 / 80%);
  background: rgb(80 120 190 / 40%);
}

.painter-layer-panel__list {
  display: grid;
  max-height: min(440px, calc(100vh - 160px));
  overflow: auto;
  padding: 6px;
  gap: 6px;
}

.painter-layer-row {
  display: grid;
  grid-template-columns: 28px 40px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 6%);
}

.painter-layer-row.is-active {
  border-color: rgb(120 170 255 / 80%);
  background: rgb(80 120 190 / 26%);
}

.painter-layer-row__thumb {
  width: 40px;
  height: 40px;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background:
    linear-gradient(45deg, rgb(255 255 255 / 18%) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(255 255 255 / 18%) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(255 255 255 / 18%) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(255 255 255 / 18%) 75%);
  background-color: rgb(30 30 36);
  background-position:
    0 0,
    0 4px,
    4px -4px,
    -4px 0;
  background-size: 8px 8px;
}

.painter-layer-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.painter-layer-row__name {
  min-width: 0;
  border: 0;
  background: transparent;
  color: white;
  font: inherit;
  outline: 0;
}

.painter-layer-row__controls {
  display: grid;
  width: 112px;
  gap: 4px;
}

.painter-layer-row__blend,
.painter-layer-row__opacity {
  min-width: 0;
  width: 100%;
}

.painter-layer-row__blend {
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: white;
}

.painter-layer-row__actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 4px;
}
</style>

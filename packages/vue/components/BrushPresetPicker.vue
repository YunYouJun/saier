<script lang="ts" setup>
import type { BrushPresetId, BrushPresetSummary } from '@saier/core'

const props = withDefaults(defineProps<{
  presetLabels?: Partial<Record<BrushPresetId, string>>
  presets: BrushPresetSummary[]
  activePresetId: BrushPresetId
}>(), {
  presetLabels: () => ({}),
})

const emit = defineEmits<{
  select: [id: BrushPresetId]
}>()

function presetLabel(preset: BrushPresetSummary): string {
  return props.presetLabels[preset.id] ?? preset.name
}
</script>

<template>
  <div class="brush-preset-picker">
    <button
      v-for="preset in props.presets"
      :key="preset.id"
      type="button"
      class="brush-preset-button"
      :class="{ 'is-active': preset.id === props.activePresetId }"
      :aria-label="presetLabel(preset)"
      :aria-pressed="preset.id === props.activePresetId"
      :title="presetLabel(preset)"
      @click="emit('select', preset.id)"
    >
      <span class="brush-preset-swatch" :data-tip="preset.tipId" />
      <span class="brush-preset-name">{{ presetLabel(preset) }}</span>
    </button>
  </div>
</template>

<style scoped>
.brush-preset-picker {
  display: flex;
  min-width: 0;
  gap: 3px;
  overflow-x: auto;
  padding: 3px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(0 0 0 / 18%);
  scrollbar-width: thin;
}

.brush-preset-button {
  display: flex;
  width: 112px;
  min-width: 0;
  height: 38px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-start;
  gap: 7px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 5px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 82%);
  font-size: 12px;
  line-height: 1.1;
  padding: 0 8px;
}

.brush-preset-button.is-active {
  border-color: rgb(96 165 250 / 74%);
  background: rgb(96 165 250 / 17%);
  color: white;
  box-shadow: inset 2px 0 0 rgb(96 165 250);
}

.brush-preset-button:hover {
  background: rgb(255 255 255 / 10%);
}

.brush-preset-swatch {
  position: relative;
  width: 34px;
  height: 16px;
  flex: 0 0 auto;
}

.brush-preset-swatch::before {
  position: absolute;
  top: 7px;
  left: 2px;
  width: 30px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
  content: '';
}

.brush-preset-swatch[data-tip='pencil-grain']::before {
  opacity: 0.58;
  box-shadow:
    4px -3px 0 -1px currentColor,
    13px 2px 0 -1px currentColor;
}

.brush-preset-swatch[data-tip='marker-chisel']::before {
  height: 7px;
  border-radius: 2px;
  transform: rotate(-12deg);
}

.brush-preset-swatch[data-tip='airbrush-soft']::before {
  top: 2px;
  left: 9px;
  width: 16px;
  height: 16px;
  opacity: 0.55;
  filter: blur(2px);
}

.brush-preset-name {
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .brush-preset-button {
    width: 94px;
  }
}
</style>

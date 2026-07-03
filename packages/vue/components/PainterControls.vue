<script lang="ts" setup>
import type { PainterBrushState } from '@saier/core'
import type { Painter } from 'saier'
import { computed, onBeforeUnmount, shallowRef } from 'vue'
import ColorWheelPicker from './ColorWheelPicker.vue'

interface PainterControlsLabels {
  backgroundColor: string
  blue: string
  brush: string
  colorPicker: string
  eraser: string
  foregroundColor: string
  green: string
  hex: string
  hue: string
  image: string
  palette: string
  red: string
  selection: string
  saturation: string
  value: string
  clear: string
  zoomIn: string
  zoomOut: string
  extract: string
  download: string
  undo: string
  redo: string
}

type ColorPickerSectionId = 'palette' | 'rgbSliders' | 'wheel'

type ColorPickerVisibleSections = Partial<Record<ColorPickerSectionId, boolean>>

const props = defineProps<{
  colorPanelMode?: 'inline' | 'popover'
  colorSections?: ColorPickerVisibleSections
  painter: Painter
  labels?: Partial<PainterControlsLabels>
  mode?: 'full' | 'palette'
}>()

const emit = defineEmits<{
  extract: [dataUrl: string]
}>()

const backgroundColor = shallowRef<string | number>(Number(props.painter.background.color) || 0xFFFFFF)
const controllerState = props.painter.controller.getState()
const activeTool = shallowRef(controllerState.tool)
const activeColorTarget = shallowRef<'background' | 'brush'>('brush')
const brushColor = shallowRef<string | number>(rgbaToHex(controllerState.brush.color))

const DEFAULT_LABELS: PainterControlsLabels = {
  backgroundColor: 'Background color',
  blue: 'Blue',
  brush: 'Brush',
  colorPicker: 'Color picker',
  eraser: 'Eraser',
  foregroundColor: 'Brush color',
  green: 'Green',
  hex: 'Hex',
  hue: 'Hue',
  image: 'Import image',
  palette: 'Palette',
  red: 'Red',
  selection: 'Selection',
  saturation: 'Saturation',
  value: 'Value',
  clear: 'Clear',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  extract: 'Preview export',
  download: 'Download',
  undo: 'Undo',
  redo: 'Redo',
}

const text = computed(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
}))

const colorPickerLabels = computed(() => ({
  blue: text.value.blue,
  current: text.value.colorPicker,
  green: text.value.green,
  hex: text.value.hex,
  hue: text.value.hue,
  palette: text.value.palette,
  red: text.value.red,
  saturation: text.value.saturation,
  value: text.value.value,
}))

const activeColor = computed({
  get: () => activeColorTarget.value === 'brush' ? brushColor.value : backgroundColor.value,
  set: (color: string | number) => {
    if (activeColorTarget.value === 'brush')
      onBrushColorChange(color)
    else
      onBackgroundColorChange(color)
  },
})

function onBackgroundColorChange(color: number | string) {
  const background = props.painter.background
  backgroundColor.value = color
  if (background)
    background.color = color
}

function onBrushColorChange(color: number | string) {
  brushColor.value = color
  props.painter.brush.setColor(color)
}

const tools = computed(() => [
  {
    id: 'brush',
    icon: 'i-ph-paint-brush',
    title: text.value.brush,
    onClick: () => props.painter.useTool('brush'),
  },
  {
    id: 'eraser',
    icon: 'i-ph-eraser',
    title: text.value.eraser,
    onClick: () => props.painter.useTool('eraser'),
  },
  {
    id: 'image',
    icon: 'i-ph-image',
    title: text.value.image,
    onClick: () => props.painter.useTool('image'),
  },
  {
    id: 'selection',
    icon: 'i-ph-selection',
    title: text.value.selection,
    onClick: () => props.painter.useTool('selection'),
  },
  {
    id: 'clear',
    icon: 'i-ph-trash',
    title: text.value.clear,
    onClick: () => props.painter.clearCanvas(),
  },
  {
    id: 'scale-up',
    icon: 'i-ph-magnifying-glass-plus',
    title: text.value.zoomIn,
    onClick: () => props.painter.canvas.scaleUp(),
  },
  {
    id: 'scale-down',
    icon: 'i-ph-magnifying-glass-minus',
    title: text.value.zoomOut,
    onClick: () => props.painter.canvas.scaleDown(),
  },
  {
    id: 'extract',
    icon: 'i-ph-export',
    title: text.value.extract,
    onClick: async () => {
      const dataUrl = await props.painter.extractCanvas('base64')
      emit('extract', dataUrl as string)
    },
  },
  {
    id: 'download',
    icon: 'i-ph-download',
    title: text.value.download,
    onClick: async () => {
      const dataUrl = await props.painter.extractCanvas('base64')

      const a = document.createElement('a')
      a.href = dataUrl as string
      a.download = 'saier-img.png'
      a.click()
    },
  },
  {
    id: 'undo',
    icon: 'i-ph-arrow-arc-left',
    title: text.value.undo,
    onClick: () => props.painter.history.undo(),
  },
  {
    id: 'redo',
    icon: 'i-ph-arrow-arc-right',
    title: text.value.redo,
    onClick: () => props.painter.history.redo(),
  },
])

function handleToolChange(tool: string) {
  activeTool.value = tool
}

function handleBrushChange(brush: PainterBrushState) {
  brushColor.value = rgbaToHex(brush.color)
}

props.painter.controller.on('tool:change', handleToolChange)
props.painter.controller.on('brush:change', handleBrushChange)

onBeforeUnmount(() => {
  props.painter.controller.off('tool:change', handleToolChange)
  props.painter.controller.off('brush:change', handleBrushChange)
})

function rgbaToHex(color: PainterBrushState['color']): string {
  return `#${toHexByte(color.r)}${toHexByte(color.g)}${toHexByte(color.b)}`
}

function toColorStyle(color: number | string): string {
  if (typeof color === 'number')
    return `#${Math.round(color).toString(16).padStart(6, '0').slice(-6)}`

  return color
}

function toHexByte(value: number): string {
  return Math.round(Math.max(0, Math.min(1, value)) * 255)
    .toString(16)
    .padStart(2, '0')
}
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <div
    class="painter-controls"
    :class="{ 'painter-controls--inline-color': colorPanelMode === 'inline' }"
    rounded-lg
    bg="dark-100"
    flex="~ col"
    gap="1"
    p="1"
    text-white
  >
    <template v-if="mode !== 'palette'">
      <PainterIconButton
        v-for="tool in tools"
        :key="tool.icon"
        :icon="tool.icon"
        :title="tool.title"
        :active="tool.id === activeTool"
        @click="tool.onClick"
      />
    </template>

    <section v-if="colorPanelMode === 'inline'" class="painter-controls__color-panel">
      <div class="painter-controls__color-targets">
        <button
          type="button"
          class="painter-controls__color-target"
          :class="{ 'is-active': activeColorTarget === 'brush' }"
          :title="text.foregroundColor"
          @click="activeColorTarget = 'brush'"
        >
          <span class="i-ph-paint-brush" aria-hidden="true" />
          <span class="painter-controls__color-chip" :style="{ backgroundColor: toColorStyle(brushColor) }" />
        </button>

        <button
          v-if="painter.background"
          type="button"
          class="painter-controls__color-target"
          :class="{ 'is-active': activeColorTarget === 'background' }"
          :title="text.backgroundColor"
          @click="activeColorTarget = 'background'"
        >
          <span class="i-ph-fill" aria-hidden="true" />
          <span class="painter-controls__color-chip" :style="{ backgroundColor: toColorStyle(backgroundColor) }" />
        </button>
      </div>

      <ColorWheelPicker
        v-model="activeColor"
        density="compact"
        :labels="colorPickerLabels"
        :size="116"
        :visible-sections="colorSections"
      />
    </section>

    <template v-else>
      <div my-1>
        <PainterColorPicker
          :model-value="brushColor"
          :label="text.foregroundColor"
          :labels="colorPickerLabels"
          :visible-sections="colorSections"
          @update:model-value="onBrushColorChange"
        />
      </div>

      <div v-if="painter.background" my-1>
        <PainterColorPicker
          :model-value="backgroundColor"
          :label="text.backgroundColor"
          :labels="colorPickerLabels"
          :visible-sections="colorSections"
          @update:model-value="onBackgroundColorChange"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.painter-controls--inline-color {
  width: 276px;
  padding: 6px;
}

.painter-controls__color-panel {
  display: grid;
  min-width: 0;
  gap: 8px;
}

.painter-controls__color-targets {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.painter-controls__color-target {
  display: inline-flex;
  height: 28px;
  align-items: center;
  gap: 6px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 78%);
  padding-inline: 7px;
}

.painter-controls__color-target:hover,
.painter-controls__color-target.is-active {
  border-color: rgb(96 165 250 / 58%);
  background: rgb(96 165 250 / 18%);
  color: white;
}

.painter-controls__color-chip {
  width: 14px;
  height: 14px;
  border: 1px solid rgb(255 255 255 / 64%);
  border-radius: 999px;
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 34%);
}
</style>

<script lang="ts" setup>
import type { Painter } from '../../pixi-painter/src'
import { ref } from 'vue'
import { PainterBrush } from '../../pixi-painter/src'

const props = defineProps<{
  painter: Painter
}>()

const emit = defineEmits(['extract'])

const backgroundColor = ref<string | number>(Number(props.painter.background.color) || 0xFFFFFF)
function onBackgroundColorChange(color: number) {
  const background = props.painter.background
  if (background)
    background.color = color
}

const activeTool = ref('brush')
const tools = [
  {
    id: 'brush',
    icon: 'i-ph-paint-brush',
    onClick: () => props.painter.useTool('brush'),
  },
  {
    id: 'eraser',
    icon: 'i-ph-eraser',
    onClick: () => props.painter.useTool('eraser'),
  },
  {
    id: 'image',
    icon: 'i-ph-image',
    onClick: () => props.painter.useTool('image'),
  },
  {
    id: 'selection',
    icon: 'i-ph-selection',
    onClick: () => props.painter.useTool('selection'),
  },
  {
    id: 'clear',
    icon: 'i-ph-trash',
    onClick: () => props.painter.clearCanvas(),
  },
  {
    id: 'scale-up',
    icon: 'i-ph-magnifying-glass-plus',
    onClick: () => props.painter.canvas.scaleUp(),
  },
  {
    id: 'scale-down',
    icon: 'i-ph-magnifying-glass-minus',
    onClick: () => props.painter.canvas.scaleDown(),
  },
  {
    id: 'extract',
    icon: 'i-ph-export',
    onClick: async () => {
      const dataUrl = await props.painter.extractCanvas('base64')
      emit('extract', dataUrl)
    },
  },
  {
    id: 'download',
    icon: 'i-ph-download',
    onClick: async () => {
      const dataUrl = await props.painter.extractCanvas('base64')

      const a = document.createElement('a')
      a.href = dataUrl as string
      a.download = 'pixi-painter-img.png'
      a.click()
    },
  },
  {
    id: 'undo',
    icon: 'i-ph-arrow-arc-left',
    onClick: () => props.painter.history.undo(),
  },
  {
    id: 'redo',
    icon: 'i-ph-arrow-arc-right',
    onClick: () => props.painter.history.redo(),
  },
]

props.painter.emitter.on('tool:change', (tool) => {
  activeTool.value = tool
})
</script>

<template>
  <!-- eslint-disable vue/no-mutating-props -->
  <div rounded-lg bg="dark-100" flex="~ col" gap="1" p="1" text-white>
    <PainterIconButton
      v-for="tool in tools"
      :key="tool.icon"
      :icon="tool.icon"
      :active="tool.id === activeTool"
      @click="tool.onClick"
    />

    <div my-1>
      <PainterColorPicker v-model="PainterBrush.color" />
    </div>

    <div v-if="painter.background" my-1>
      <PainterColorPicker
        :model-value="backgroundColor"
        @update:model-value="onBackgroundColorChange"
      />
    </div>
  </div>
</template>

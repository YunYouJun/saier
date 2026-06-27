<script lang="ts" setup>
import type { Painter } from '../../pixi-painter/src'
import { ref, watch } from 'vue'
import { PainterBrush } from '../../pixi-painter/src'
import { PainterEraser } from '../../pixi-painter/src/eraser'
import '@advjs/gui/dist/icons.css'

const props = defineProps<{
  painter: Painter
}>()

const size = ref(PainterBrush.size)
watch(size, (value) => {
  props.painter.brush.setSize(value)
})

const enablePressure = ref(true)
watch(enablePressure, (value) => {
  PainterBrush.enablePressure = value
  PainterEraser.enablePressure = value
})
</script>

<template>
  <div bg="dark-100" flex="~" gap="1" p="1" rounded-lg text-white>
    <AGUICheckbox v-model:checked="enablePressure" label="Enable Pressure" />
    <AGUISlider v-model="size" class="ml-2 w-30" :min="1" :max="100" :step="1" />
  </div>
</template>

<style lang="scss">
input[type='checkbox'] {
  background: none;

  &::before {
    content: none !important;
  }
}
</style>

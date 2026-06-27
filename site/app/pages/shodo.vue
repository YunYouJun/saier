<script setup lang="ts">
// shodo
import { createShodo } from '../../../packages/shodo/src'

const shodoCanvas = ref<HTMLCanvasElement>()

onMounted(() => {
  createShodo({ canvas: shodoCanvas.value })
})
</script>

<template>
  <div class="size-full">
    <canvas ref="shodoCanvas" />
  </div>
</template>

<script lang="ts" setup>
defineProps<{
  modelValue?: number
}>()
</script>

<template>
  <div class="flex items-center space-x-2">
    <!-- Slider Label -->
    <label for="blender-slider" class="text-sm text-gray-700">Blender Slider:</label>

    <!-- Slider Container -->
    <div class="relative h-2 w-64 rounded-full bg-gray-300">
      <!-- Slider Thumb -->
      <input
        id="blender-slider"
        type="range"
        class="pointer-events-none absolute h-2 w-full appearance-none bg-transparent"
        style="outline: none; -webkit-appearance: none; background: transparent; z-index: 1;"
      >
      <div class="slider-thumb pointer-events-auto absolute left-0 top-0 h-4 w-4 rounded-full bg-gray-700 shadow-md" style="transform: translate(-50%, -50%);" />
    </div>
  </div>
</template>

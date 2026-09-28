<script setup lang="ts">
import { ToolbarButton } from 'reka-ui'
import PainterIconButton from './PainterIconButton.vue'

defineProps<{
  icon?: string
  title?: string
}>()
</script>

<template>
  <ToolbarButton as-child>
    <PainterIconButton :icon="icon" :title="title" size="md">
      <slot />
    </PainterIconButton>
  </ToolbarButton>
</template>

<script setup lang="ts">
import type { VNode } from 'vue'

defineProps<{
  hint?: string
  label?: string
}>()

defineSlots<{
  default(): VNode[]
  hint?(): VNode[]
  label?(): VNode[]
}>()
</script>

<template>
  <label class="site-activity-field">
    <span v-if="label || $slots.label || hint || $slots.hint">
      <slot name="label">{{ label }}</slot>
      <small v-if="hint || $slots.hint" class="site-activity-field__hint">
        <slot name="hint">{{ hint }}</slot>
      </small>
    </span>
    <slot />
  </label>
</template>

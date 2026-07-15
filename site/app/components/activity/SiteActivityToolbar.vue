<script setup lang="ts">
import type { VNode } from 'vue'

defineProps<{
  icon?: string
  status?: string
  title: string
}>()

defineSlots<{
  actions?(): VNode[]
  status?(): VNode[]
  title?(): VNode[]
}>()
</script>

<template>
  <header class="site-activity-toolbar">
    <div class="site-activity-toolbar__title">
      <span v-if="icon" class="site-activity-toolbar__icon" :class="icon" aria-hidden="true" />
      <strong><slot name="title">{{ title }}</slot></strong>
    </div>
    <div v-if="status || $slots.status" class="site-activity-toolbar__status">
      <slot name="status">{{ status }}</slot>
    </div>
    <div v-if="$slots.actions" class="site-activity-toolbar__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

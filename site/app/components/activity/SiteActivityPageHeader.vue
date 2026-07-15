<script setup lang="ts">
import type { VNode } from 'vue'

defineProps<{
  description?: string
  icon?: string
  kicker?: string
  title: string
}>()

defineSlots<{
  actions?(): VNode[]
}>()
</script>

<template>
  <header class="site-activity-page-header">
    <span v-if="icon" class="site-activity-page-header__icon" :class="icon" aria-hidden="true" />
    <div class="site-activity-page-header__copy">
      <span v-if="kicker" class="site-activity-kicker">{{ kicker }}</span>
      <h1 class="site-activity-page-header__title">
        {{ title }}
      </h1>
      <p v-if="description" class="site-activity-page-header__description">
        {{ description }}
      </p>
      <div v-if="$slots.actions" class="site-activity-page-header__actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import type { VNode } from 'vue'
import { computed, useId, useSlots } from 'vue'

const props = withDefaults(defineProps<{
  description?: string
  icon?: string
  tag?: 'aside' | 'div' | 'form' | 'section'
  title?: string
}>(), {
  tag: 'section',
})

const slots = useSlots()
const headingId = useId()
const hasTitle = computed(() => Boolean(props.title || slots.title))
const hasHeader = computed(() => Boolean(
  props.description
  || props.icon
  || props.title
  || slots.actions
  || slots.description
  || slots.icon
  || slots.title,
))

defineSlots<{
  actions?(): VNode[]
  default(): VNode[]
  description?(): VNode[]
  icon?(): VNode[]
  title?(): VNode[]
}>()
</script>

<template>
  <component
    :is="props.tag"
    class="site-activity-panel"
    :aria-labelledby="hasTitle ? headingId : undefined"
  >
    <header v-if="hasHeader" class="site-activity-panel__header">
      <span v-if="props.icon || $slots.icon" class="site-activity-panel__icon" :class="props.icon" aria-hidden="true">
        <slot name="icon" />
      </span>
      <div class="site-activity-panel__copy">
        <h2 v-if="hasTitle" :id="headingId" class="site-activity-panel__title">
          <slot name="title">{{ props.title }}</slot>
        </h2>
        <p v-if="props.description || $slots.description" class="site-activity-panel__description">
          <slot name="description">{{ props.description }}</slot>
        </p>
      </div>
      <div v-if="$slots.actions" class="site-activity-panel__actions">
        <slot name="actions" />
      </div>
    </header>
    <slot />
  </component>
</template>

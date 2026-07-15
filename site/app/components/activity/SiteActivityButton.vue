<script setup lang="ts">
import type { VNode } from 'vue'
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  active?: boolean
  selectable?: boolean
  size?: 'compact' | 'default'
  type?: 'button' | 'reset' | 'submit'
  variant?: 'default' | 'primary'
}>(), {
  active: false,
  selectable: false,
  size: 'default',
  type: 'button',
  variant: 'default',
})

defineSlots<{
  default(): VNode[]
  leading?(): VNode[]
}>()

const buttonClasses = computed(() => ({
  'is-active': props.active,
  'is-compact': props.size === 'compact',
  'is-primary': props.variant === 'primary',
}))
</script>

<template>
  <button
    class="site-activity-button"
    :class="buttonClasses"
    :type="props.type"
    :aria-pressed="props.selectable ? props.active : undefined"
  >
    <slot name="leading" />
    <slot />
  </button>
</template>

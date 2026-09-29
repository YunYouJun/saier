<script lang="ts" setup>
import '../styles/tokens.css'

withDefaults(defineProps<{
  active?: boolean
  icon?: string
  size?: 'sm' | 'md' | 'lg'
  title?: string
}>(), { size: 'lg' })
</script>

<template>
  <button
    type="button"
    class="pp-icon-button"
    :class="[`pp-icon-button--${size}`, { 'is-active': active }]"
    :title="title"
    :aria-label="title"
  >
    <span v-if="icon" :class="icon" aria-hidden="true" />
    <slot />
  </button>
</template>

<style scoped>
.pp-icon-button {
  box-sizing: border-box;
  display: inline-flex;
  width: var(--saier-control-size-lg);
  height: var(--saier-control-size-lg);
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: var(--saier-space-1);
  padding: 0;
  border: 1px solid transparent;
  border-radius: var(--saier-radius-control);
  background: transparent;
  color: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
  font-size: var(--saier-icon-size);
  cursor: pointer;
}

.pp-icon-button--sm {
  width: var(--saier-control-size-sm);
  height: var(--saier-control-size-sm);
}

.pp-icon-button--md {
  width: var(--saier-control-size);
  height: var(--saier-control-size);
}

.pp-icon-button:hover:not(:disabled) {
  background: var(--saier-color-surface-hover, rgb(255 255 255 / 10%));
  color: var(--saier-color-text, white);
}

.pp-icon-button.is-active,
.pp-icon-button[data-state='on'],
.pp-icon-button[aria-pressed='true'] {
  background: var(--saier-color-accent-soft, rgb(96 165 250 / 15%));
  color: var(--saier-color-accent-text, #bfdbfe);
  border-color: var(--saier-color-accent-border, rgb(96 165 250 / 55%));
}

.pp-icon-button:focus-visible {
  outline: var(--saier-focus-width) solid var(--saier-color-focus, rgb(147 197 253 / 72%));
  outline-offset: -2px;
}

.pp-icon-button:disabled,
.pp-icon-button[data-disabled] {
  color: var(--saier-color-text-disabled, rgb(255 255 255 / 28%));
  cursor: default;
  pointer-events: none;
}
</style>

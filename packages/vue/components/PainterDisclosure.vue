<script setup lang="ts">
import '../styles/tokens.css'

defineProps<{ label: string }>()
</script>

<template>
  <details class="painter-disclosure">
    <summary class="painter-disclosure__summary">
      <span class="painter-disclosure__chevron i-ph-caret-right" aria-hidden="true" />
      {{ label }}
    </summary>
    <div class="painter-disclosure__body">
      <slot />
    </div>
  </details>
</template>

<style scoped>
.painter-disclosure {
  min-width: 0;
  border-top: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
}

.painter-disclosure__summary {
  display: flex;
  min-height: var(--saier-control-size);
  align-items: center;
  gap: var(--saier-space-1);
  border-radius: var(--saier-radius-control);
  color: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
  font-size: var(--saier-font-size-control);
  cursor: pointer;
  list-style: none;
}

.painter-disclosure__summary::-webkit-details-marker {
  display: none;
}

.painter-disclosure__summary:hover {
  color: var(--saier-color-text, white);
}

.painter-disclosure__summary:focus-visible {
  outline: var(--saier-focus-width) solid var(--saier-color-focus, #93c5fd);
  outline-offset: -2px;
}

.painter-disclosure[open] > .painter-disclosure__summary .painter-disclosure__chevron {
  transform: rotate(90deg);
}

.painter-disclosure__body {
  display: grid;
  gap: var(--saier-space-2);
  padding-bottom: var(--saier-space-2);
}
</style>

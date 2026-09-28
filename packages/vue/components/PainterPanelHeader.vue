<script setup lang="ts">
import '../styles/tokens.css'

defineProps<{ title?: string }>()
</script>

<template>
  <header class="painter-panel-header">
    <div class="painter-panel-header__title">
      <slot>{{ title }}</slot>
    </div>
    <div v-if="$slots.actions" class="painter-panel-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.painter-panel-header {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  min-height: var(--saier-panel-header-height);
  align-items: center;
  justify-content: space-between;
  gap: var(--saier-space-1);
  padding: 0 var(--saier-space-2);
  border-bottom: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  color: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
  font-size: var(--saier-font-size-control);
  font-weight: var(--saier-font-weight-label);
  text-align: left;
}

.painter-panel-header__title {
  min-width: 0;
  flex: 1;
}

.painter-panel-header__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
}
</style>

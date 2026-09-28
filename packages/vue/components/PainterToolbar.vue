<script setup lang="ts">
import { ToolbarRoot } from 'reka-ui'
import '../styles/tokens.css'

defineProps<{ label: string }>()
</script>

<template>
  <ToolbarRoot class="painter-toolbar" :aria-label="label" loop>
    <slot />
  </ToolbarRoot>
</template>

<style scoped>
.painter-toolbar {
  box-sizing: border-box;
  display: inline-flex;
  height: var(--saier-toolbar-height);
  flex: 0 0 auto;
  align-items: center;
  gap: var(--saier-space-1);
  padding-inline: var(--saier-space-1);
}

.painter-toolbar :deep(.painter-toolbar__separator) {
  width: 1px;
  height: var(--saier-space-4);
  margin-inline: var(--saier-space-1);
  background: var(--saier-color-border, rgb(255 255 255 / 12%));
}
</style>

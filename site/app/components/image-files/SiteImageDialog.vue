<script setup lang="ts">
import { DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogRoot, DialogTitle } from 'reka-ui'

defineProps<{ open: boolean, title: string, description: string }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <DialogRoot :open="open" @update:open="!$event && emit('close')">
    <DialogPortal>
      <DialogOverlay class="image-dialog-overlay" />
      <DialogContent class="image-dialog" @interact-outside.prevent @keydown.stop @keydown.esc.prevent="emit('close')" @keyup.stop>
        <DialogTitle class="image-dialog-title">
          {{ title }}
        </DialogTitle>
        <DialogDescription class="image-dialog-description">
          {{ description }}
        </DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>

<style scoped>
.image-dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: var(--saier-color-scrim);
}

.image-dialog {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  z-index: 81;
  box-sizing: border-box;
  width: min(420px, calc(100vw - 28px));
  max-height: calc(100dvh - 28px);
  overflow: auto;
  padding: 20px;
  border: 1px solid var(--saier-color-border);
  border-radius: 12px;
  background: var(--saier-color-panel-raised);
  color: var(--saier-color-text);
  box-shadow: var(--saier-shadow-dialog);
}

.image-dialog-title {
  margin: 0;
  font-size: 17px;
}

.image-dialog-description {
  margin: 8px 0 20px;
  color: var(--saier-color-text-muted);
  font-size: 13px;
  line-height: 1.6;
}

.image-dialog :deep(.image-field) {
  display: grid;
  gap: 6px;
  margin: 14px 0;
  font-size: 13px;
}

.image-dialog :deep(.image-input) {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text);
}

.image-dialog :deep(.image-actions) {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.image-dialog :deep(.image-button) {
  padding: 9px 12px;
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text);
  cursor: pointer;
}

.image-dialog :deep(.image-button--primary) {
  border-color: var(--saier-color-accent-border);
  background: var(--saier-color-accent-strong);
}

.image-dialog :deep(.image-button:disabled) {
  opacity: 0.5;
  cursor: wait;
}

.image-dialog :deep(.image-meta) {
  overflow-wrap: anywhere;
  color: var(--saier-color-text-muted);
  font-size: 13px;
}
</style>

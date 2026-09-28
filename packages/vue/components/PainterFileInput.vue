<script setup lang="ts">
import '../styles/editor-form.css'

defineProps<{ label: string, accept?: string, disabled?: boolean }>()
const emit = defineEmits<{ pick: [file: File] }>()

function pick(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file)
    emit('pick', file)
}
</script>

<template>
  <label class="painter-file-input" :class="{ 'is-disabled': disabled }">
    <span class="i-ph-folder-open" aria-hidden="true" />
    <span>{{ label }}</span>
    <span class="i-ph-plus painter-file-input__action" aria-hidden="true" />
    <input type="file" :aria-label="label" :accept="accept" :disabled="disabled" @change="pick">
  </label>
</template>

<style scoped>
.painter-file-input {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: var(--saier-control-size);
  align-items: center;
  gap: 6px;
  padding: 0 8px;
  border: 1px solid var(--saier-color-border);
  border-radius: var(--saier-radius-control);
  background: var(--saier-color-field);
  color: var(--saier-color-text);
  font-size: var(--saier-font-size-control);
  cursor: pointer;
}
.painter-file-input:hover:not(.is-disabled) {
  background: var(--saier-color-surface-hover);
}
.painter-file-input:focus-within {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}
.painter-file-input__action {
  margin-left: auto;
  color: var(--saier-color-text-subtle);
}
.painter-file-input input {
  position: absolute;
  inset: -1px;
  width: calc(100% + 2px);
  height: calc(100% + 2px);
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
  cursor: inherit;
}
.is-disabled {
  opacity: 0.5;
  cursor: default;
}
</style>

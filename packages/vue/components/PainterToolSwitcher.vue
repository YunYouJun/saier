<script setup lang="ts">
import {
  ToggleGroupItem,
  ToggleGroupRoot,
} from 'reka-ui'

interface PainterToolSwitcherOption {
  icon: string
  label: string
  value: string
}

withDefaults(defineProps<{
  disabled?: boolean
  label: string
  modelValue: string
  showLabels?: boolean
  tools: readonly PainterToolSwitcherOption[]
}>(), {
  disabled: false,
  showLabels: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

function updateSelection(value: unknown): void {
  if (typeof value === 'string' && value)
    emit('update:modelValue', value)
}
</script>

<template>
  <ToggleGroupRoot
    class="painter-tool-switcher"
    :class="{ 'painter-tool-switcher--labeled': showLabels }"
    type="single"
    :aria-label="label"
    :disabled="disabled"
    :model-value="modelValue"
    @update:model-value="updateSelection"
  >
    <ToggleGroupItem
      v-for="tool in tools"
      :key="tool.value"
      class="painter-tool-switcher__item"
      :title="tool.label"
      :value="tool.value"
    >
      <span :class="tool.icon" aria-hidden="true" />
      <span v-if="showLabels" class="painter-tool-switcher__label">{{ tool.label }}</span>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>

<style scoped>
.painter-tool-switcher {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 3px;
}

.painter-tool-switcher__item {
  display: inline-grid;
  width: 30px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
  font-size: 17px;
  outline: none;
}

.painter-tool-switcher__item:hover {
  border-color: var(--saier-color-border, rgb(255 255 255 / 12%));
  background: var(--saier-color-surface-hover, rgb(255 255 255 / 8%));
  color: var(--saier-color-text, white);
}

.painter-tool-switcher__item:focus-visible {
  border-color: var(--saier-color-accent-border, rgb(96 165 250 / 70%));
  box-shadow: 0 0 0 2px var(--saier-color-accent-soft, rgb(96 165 250 / 26%));
}

.painter-tool-switcher__item[data-state='on'] {
  border-color: var(--saier-color-accent-border, rgb(96 165 250 / 70%));
  background: var(--saier-color-accent-soft, rgb(96 165 250 / 26%));
  color: var(--saier-color-text, white);
}

.painter-tool-switcher__item:disabled,
.painter-tool-switcher__item[data-disabled] {
  color: var(--saier-color-text-disabled, rgb(255 255 255 / 30%));
  pointer-events: none;
}

.painter-tool-switcher--labeled {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.painter-tool-switcher--labeled .painter-tool-switcher__item {
  display: inline-flex;
  width: auto;
  min-width: 0;
  height: 32px;
  justify-content: center;
  gap: 6px;
  padding-inline: 8px;
  font-size: 15px;
}

.painter-tool-switcher__label {
  overflow: hidden;
  font-size: 11px;
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

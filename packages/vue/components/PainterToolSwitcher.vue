<script setup lang="ts">
import {
  ToggleGroupItem,
  ToggleGroupRoot,
} from 'reka-ui'
import PainterIconButton from './PainterIconButton.vue'

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
      as-child
      :value="tool.value"
    >
      <PainterIconButton class="painter-tool-switcher__item" size="md" :title="tool.label" :icon="tool.icon">
        <span v-if="showLabels" class="painter-tool-switcher__label">{{ tool.label }}</span>
      </PainterIconButton>
    </ToggleGroupItem>
  </ToggleGroupRoot>
</template>

<style scoped>
.painter-tool-switcher {
  display: inline-flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: var(--saier-space-1);
}

.painter-tool-switcher--labeled {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.painter-tool-switcher--labeled .painter-tool-switcher__item {
  display: inline-flex;
  width: auto;
  min-width: 0;
  height: var(--saier-control-size);
  justify-content: center;
  gap: var(--saier-space-1);
  padding-inline: var(--saier-space-2);
  font-size: 15px;
}

.painter-tool-switcher__label {
  overflow: hidden;
  font-size: 11px;
  font-weight: var(--saier-font-weight-label);
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

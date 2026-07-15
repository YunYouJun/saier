<script setup lang="ts">
import { computed, useId } from 'vue'

withDefaults(defineProps<{
  disabled?: boolean
  label: string
}>(), {
  disabled: false,
})

const model = defineModel<boolean>({ required: true })
const inputId = useId()

const indicatorClass = computed(() => ({
  'is-checked': model.value,
}))
</script>

<template>
  <label class="painter-checkbox" :data-disabled="disabled ? '' : undefined" :for="inputId">
    <input
      :id="inputId"
      v-model="model"
      class="painter-checkbox__input"
      :disabled="disabled"
      type="checkbox"
    >
    <span class="painter-checkbox__indicator" :class="indicatorClass">
      <span class="i-ph-check-bold painter-checkbox__check" />
    </span>
    <span class="painter-checkbox__label">{{ label }}</span>
  </label>
</template>

<style scoped>
.painter-checkbox {
  display: inline-grid;
  min-width: 0;
  min-height: 34px;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 7px;
  color: var(--saier-color-text, white);
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}

.painter-checkbox__input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
}

.painter-checkbox__indicator {
  display: inline-grid;
  width: 18px;
  height: 18px;
  place-items: center;
  border: 1px solid var(--saier-color-border-strong, rgb(255 255 255 / 22%));
  border-radius: 5px;
  background: var(--saier-color-control-track, rgb(0 0 0 / 30%));
  color: var(--saier-color-text, white);
  box-shadow: inset 0 0 0 1px var(--saier-color-swatch-inset, rgb(0 0 0 / 22%));
}

.painter-checkbox__indicator.is-checked {
  border-color: var(--saier-color-accent-border, rgb(96 165 250 / 70%));
  background: linear-gradient(135deg, var(--saier-color-accent-hover, #60a5fa), var(--saier-color-accent, #2563eb));
}

.painter-checkbox__check {
  font-size: 12px;
  opacity: 0;
  transform: scale(0.72);
  transition:
    opacity 120ms ease,
    transform 120ms ease;
}

.painter-checkbox__indicator.is-checked .painter-checkbox__check {
  opacity: 1;
  transform: scale(1);
}

.painter-checkbox__label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.painter-checkbox__input:focus-visible + .painter-checkbox__indicator {
  border-color: var(--saier-color-focus, rgb(147 197 253));
  box-shadow:
    inset 0 0 0 1px var(--saier-color-swatch-inset, rgb(0 0 0 / 22%)),
    0 0 0 3px var(--saier-color-accent-soft, rgb(96 165 250 / 26%));
}

.painter-checkbox[data-disabled] {
  cursor: default;
  opacity: 0.45;
}
</style>

<script setup lang="ts">
import type { Painter, PainterTransformSnapshot, SetPainterTransformValues } from 'saier'
import { computed, onBeforeUnmount, shallowRef } from 'vue'

interface PainterTransformBarLabels {
  title: string
  positionX: string
  positionY: string
  width: string
  height: string
  rotation: string
  lockAspect: string
  unlockAspect: string
  flipHorizontal: string
  flipVertical: string
  cancel: string
  confirm: string
  remove: string
}

const props = defineProps<{
  painter: Painter
  labels?: Partial<PainterTransformBarLabels>
}>()

const DEFAULT_LABELS: PainterTransformBarLabels = {
  title: 'Transform',
  positionX: 'X position',
  positionY: 'Y position',
  width: 'Width',
  height: 'Height',
  rotation: 'Rotation',
  lockAspect: 'Lock aspect ratio',
  unlockAspect: 'Unlock aspect ratio',
  flipHorizontal: 'Flip horizontal',
  flipVertical: 'Flip vertical',
  cancel: 'Cancel transform',
  confirm: 'Apply transform',
  remove: 'Delete layer',
}

const text = computed(() => ({ ...DEFAULT_LABELS, ...props.labels }))
const selection = shallowRef<PainterTransformSnapshot | null>(props.painter.getTransformSelection())

function handleTransformChange(snapshot: PainterTransformSnapshot | null): void {
  selection.value = snapshot
}

props.painter.emitter.on('transform:change', handleTransformChange)

onBeforeUnmount(() => {
  props.painter.emitter.off('transform:change', handleTransformChange)
})

function setNumber(key: keyof SetPainterTransformValues, event: Event): void {
  const value = Number((event.currentTarget as HTMLInputElement).value)
  if (Number.isFinite(value))
    props.painter.setTransformSelectionValues({ [key]: value })
}

function displayNumber(value: number): string {
  return Number(value.toFixed(2)).toString()
}
</script>

<template>
  <section v-if="selection" class="painter-transform" aria-live="polite">
    <header class="painter-transform__header">
      <span class="painter-transform__title">{{ text.title }}</span>
      <div class="painter-transform__header-actions">
        <button
          type="button"
          class="painter-transform__icon"
          :aria-label="text.flipHorizontal"
          :title="text.flipHorizontal"
          @click="painter.flipTransformSelection('horizontal')"
        >
          <span class="i-ph-flip-horizontal" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="painter-transform__icon"
          :aria-label="text.flipVertical"
          :title="text.flipVertical"
          @click="painter.flipTransformSelection('vertical')"
        >
          <span class="i-ph-flip-vertical" aria-hidden="true" />
        </button>
        <button
          type="button"
          class="painter-transform__icon painter-transform__icon--danger"
          :aria-label="text.remove"
          :title="text.remove"
          @click="painter.removeSelectedTransformLayer()"
        >
          <span class="i-ph-trash" aria-hidden="true" />
        </button>
      </div>
    </header>

    <div class="painter-transform__fields">
      <label class="painter-transform__field">
        <span>X</span>
        <input
          type="number"
          step="1"
          :aria-label="text.positionX"
          :value="displayNumber(selection.x)"
          @change="setNumber('x', $event)"
        >
      </label>
      <label class="painter-transform__field">
        <span>Y</span>
        <input
          type="number"
          step="1"
          :aria-label="text.positionY"
          :value="displayNumber(selection.y)"
          @change="setNumber('y', $event)"
        >
      </label>
      <label class="painter-transform__field">
        <span>W</span>
        <input
          type="number"
          min="1"
          step="1"
          :aria-label="text.width"
          :value="displayNumber(selection.width)"
          @change="setNumber('width', $event)"
        >
      </label>
      <label class="painter-transform__field">
        <span>H</span>
        <input
          type="number"
          min="1"
          step="1"
          :aria-label="text.height"
          :value="displayNumber(selection.height)"
          @change="setNumber('height', $event)"
        >
      </label>
      <label class="painter-transform__field painter-transform__field--rotation">
        <span>°</span>
        <input
          type="number"
          step="1"
          :aria-label="text.rotation"
          :value="displayNumber(selection.rotation)"
          @change="setNumber('rotation', $event)"
        >
      </label>
      <button
        type="button"
        class="painter-transform__lock"
        :class="{ 'is-active': selection.aspectRatioLocked }"
        :aria-label="selection.aspectRatioLocked ? text.unlockAspect : text.lockAspect"
        :aria-pressed="selection.aspectRatioLocked"
        :title="selection.aspectRatioLocked ? text.unlockAspect : text.lockAspect"
        @click="painter.setTransformAspectRatioLocked(!selection.aspectRatioLocked)"
      >
        <span :class="selection.aspectRatioLocked ? 'i-ph-link' : 'i-ph-link-break'" aria-hidden="true" />
      </button>
    </div>

    <footer class="painter-transform__footer">
      <button type="button" class="painter-transform__button" @click="painter.cancelSelection()">
        {{ text.cancel }}
      </button>
      <button type="button" class="painter-transform__button painter-transform__button--primary" @click="painter.confirmTransform()">
        {{ text.confirm }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.painter-transform {
  width: min(344px, calc(100vw - 16px));
  overflow: hidden;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 10px;
  background: var(--saier-color-panel, rgb(18 18 22 / 94%));
  box-shadow: var(--saier-shadow-panel, 0 10px 30px rgb(0 0 0 / 28%));
  color: var(--saier-color-text, white);
  font-size: 12px;
}

.painter-transform__header,
.painter-transform__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px;
}

.painter-transform__header {
  border-bottom: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
}

.painter-transform__title {
  font-weight: 650;
}

.painter-transform__header-actions {
  display: flex;
  gap: 4px;
}

.painter-transform__icon,
.painter-transform__lock {
  display: inline-grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
  cursor: pointer;
}

.painter-transform__icon:hover,
.painter-transform__lock:hover,
.painter-transform__lock.is-active {
  background: var(--saier-color-surface-hover, rgb(255 255 255 / 10%));
  color: var(--saier-color-text, white);
}

.painter-transform__icon--danger:hover {
  background: var(--saier-color-danger-soft, rgb(239 68 68 / 18%));
  color: var(--saier-color-danger-text, rgb(252 165 165));
}

.painter-transform__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr)) 32px;
  gap: 8px;
  padding: 10px 8px;
}

.painter-transform__field {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  min-width: 0;
  height: 32px;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 7px;
  background: var(--saier-color-surface, rgb(255 255 255 / 6%));
  color: var(--saier-color-text-subtle, rgb(255 255 255 / 54%));
}

.painter-transform__field input {
  min-width: 0;
  height: 100%;
  border: 0;
  outline: 0;
  background: transparent;
  color: var(--saier-color-text, white);
  font: inherit;
  font-variant-numeric: tabular-nums;
}

.painter-transform__field:focus-within {
  border-color: var(--saier-color-accent-border, #6f8de3);
  box-shadow: 0 0 0 2px var(--saier-color-accent-soft, rgb(111 141 227 / 22%));
}

.painter-transform__field > span {
  text-align: center;
}

.painter-transform__field--rotation {
  grid-column: span 2;
}

.painter-transform__footer {
  justify-content: flex-end;
  border-top: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
}

.painter-transform__button {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 7px;
  background: var(--saier-color-surface, rgb(255 255 255 / 6%));
  color: var(--saier-color-text, white);
  cursor: pointer;
}

.painter-transform__button--primary {
  border-color: var(--saier-color-accent-border, #5877ca);
  background: var(--saier-color-accent, #3d5caa);
}

@media (pointer: coarse) {
  .painter-transform__icon,
  .painter-transform__lock,
  .painter-transform__button {
    min-width: 44px;
    min-height: 44px;
  }
}
</style>

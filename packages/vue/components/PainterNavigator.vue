<script setup lang="ts">
import type { PainterViewportSnapshot } from 'saier'
import type { CSSProperties } from 'vue'
import { computed, onBeforeUnmount, shallowRef, useTemplateRef } from 'vue'

interface PainterNavigatorLabels {
  empty: string
  panCanvas: string
  refresh: string
  resetView: string
  title: string
}

const props = defineProps<{
  thumbnail?: string
  viewport?: PainterViewportSnapshot
  labels?: Partial<PainterNavigatorLabels>
}>()

const emit = defineEmits<{
  center: [point: { x: number, y: number }]
  refresh: []
  reset: []
}>()

const DEFAULT_LABELS: PainterNavigatorLabels = {
  empty: 'No preview',
  panCanvas: 'Pan canvas',
  refresh: 'Refresh preview',
  resetView: 'Reset view',
  title: 'Navigator',
}
const NAVIGATOR_PREVIEW_MAX_HEIGHT = 190

const surfaceRef = useTemplateRef<HTMLButtonElement>('surface')
const dragging = shallowRef(false)
let pendingCenter: { x: number, y: number } | undefined
let centerRaf = 0

const text = computed<PainterNavigatorLabels>(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
}))

const hasDocument = computed(() => {
  const viewport = props.viewport
  return Boolean(viewport && viewport.documentWidth > 0 && viewport.documentHeight > 0)
})

const surfaceStyle = computed<CSSProperties>(() => {
  const viewport = props.viewport
  if (!viewport || viewport.documentWidth <= 0 || viewport.documentHeight <= 0) {
    return {
      aspectRatio: '1 / 1',
      maxWidth: `${NAVIGATOR_PREVIEW_MAX_HEIGHT}px`,
    }
  }

  const aspectRatio = viewport.documentWidth / viewport.documentHeight
  return {
    aspectRatio: `${viewport.documentWidth} / ${viewport.documentHeight}`,
    maxWidth: `${NAVIGATOR_PREVIEW_MAX_HEIGHT * aspectRatio}px`,
  }
})

const viewportStyle = computed<CSSProperties>(() => {
  const viewport = props.viewport
  if (!viewport || viewport.visibleRect.width <= 0 || viewport.visibleRect.height <= 0)
    return { display: 'none' }

  const { documentWidth, documentHeight, visibleRect } = viewport
  return {
    left: `${(visibleRect.x / documentWidth) * 100}%`,
    top: `${(visibleRect.y / documentHeight) * 100}%`,
    width: `${(visibleRect.width / documentWidth) * 100}%`,
    height: `${(visibleRect.height / documentHeight) * 100}%`,
  }
})

const documentSizeLabel = computed(() => {
  const viewport = props.viewport
  if (!viewport)
    return ''
  return `${Math.round(viewport.documentWidth)} x ${Math.round(viewport.documentHeight)}`
})

const zoomLabel = computed(() => {
  const scale = props.viewport?.scale ?? 1
  return `${Math.round(scale * 100)}%`
})

onBeforeUnmount(() => {
  if (centerRaf)
    cancelAnimationFrame(centerRaf)
})

function beginPan(event: PointerEvent): void {
  if (event.button !== 0 || !hasDocument.value)
    return

  dragging.value = true
  event.preventDefault()
  event.stopPropagation()
  if (event.currentTarget instanceof HTMLElement)
    safelySetPointerCapture(event.currentTarget, event.pointerId)
  queueCenter(event)
}

function movePan(event: PointerEvent): void {
  if (!dragging.value)
    return

  event.preventDefault()
  queueCenter(event)
}

function endPan(event: PointerEvent): void {
  if (!dragging.value)
    return

  dragging.value = false
  if (event.currentTarget instanceof HTMLElement)
    safelyReleasePointerCapture(event.currentTarget, event.pointerId)
}

function queueCenter(event: PointerEvent): void {
  const point = documentPointFromEvent(event)
  if (!point)
    return

  pendingCenter = point
  if (centerRaf)
    return

  centerRaf = requestAnimationFrame(() => {
    centerRaf = 0
    if (!pendingCenter)
      return
    emit('center', pendingCenter)
    pendingCenter = undefined
  })
}

function documentPointFromEvent(event: PointerEvent): { x: number, y: number } | undefined {
  const surface = surfaceRef.value
  const viewport = props.viewport
  if (!surface || !viewport)
    return undefined

  const rect = surface.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0)
    return undefined

  return {
    x: clamp01((event.clientX - rect.left) / rect.width) * viewport.documentWidth,
    y: clamp01((event.clientY - rect.top) / rect.height) * viewport.documentHeight,
  }
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}

function safelySetPointerCapture(target: HTMLElement, pointerId: number): void {
  try {
    target.setPointerCapture?.(pointerId)
  }
  catch {
    // Synthetic pointer events in tests may not have an active browser pointer.
  }
}

function safelyReleasePointerCapture(target: HTMLElement, pointerId: number): void {
  try {
    if (!target.hasPointerCapture?.(pointerId))
      return
    target.releasePointerCapture?.(pointerId)
  }
  catch {
    // Ignore missing capture for the same reason as setPointerCapture.
  }
}
</script>

<template>
  <section class="painter-navigator" :class="{ 'is-dragging': dragging }">
    <header class="painter-navigator__header">
      <span class="painter-navigator__title">{{ text.title }}</span>
      <div class="painter-navigator__actions">
        <button type="button" class="painter-navigator__icon" :title="text.refresh" :aria-label="text.refresh" @click="emit('refresh')">
          <span class="i-ph-arrows-clockwise" aria-hidden="true" />
        </button>
        <button type="button" class="painter-navigator__icon" :title="text.resetView" :aria-label="text.resetView" @click="emit('reset')">
          <span class="i-ph-crosshair" aria-hidden="true" />
        </button>
      </div>
    </header>

    <button
      ref="surface"
      type="button"
      class="painter-navigator__surface"
      :disabled="!hasDocument"
      :style="surfaceStyle"
      :title="text.panCanvas"
      :aria-label="text.panCanvas"
      @pointerdown="beginPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointercancel="endPan"
      @lostpointercapture="endPan"
    >
      <img v-if="thumbnail" class="painter-navigator__image" :src="thumbnail" alt="" draggable="false">
      <span v-else class="painter-navigator__empty">
        <span class="i-ph-image-square" aria-hidden="true" />
        <span>{{ text.empty }}</span>
      </span>
      <span class="painter-navigator__viewport" :style="viewportStyle" aria-hidden="true" />
    </button>

    <footer class="painter-navigator__meta">
      <span>{{ documentSizeLabel }}</span>
      <span>{{ zoomLabel }}</span>
    </footer>
  </section>
</template>

<style scoped>
.painter-navigator {
  width: min(100%, 260px);
  min-width: 180px;
  overflow: hidden;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 8px;
  background: var(--saier-color-panel, rgb(20 21 24 / 92%));
  color: var(--saier-color-text, white);
  box-shadow: var(--saier-shadow-panel, 0 16px 44px rgb(0 0 0 / 28%));
}

.painter-navigator__header,
.painter-navigator__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.painter-navigator__header {
  padding: 8px 9px 7px;
  border-bottom: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
}

.painter-navigator__title {
  overflow: hidden;
  min-width: 0;
  font-size: 12px;
  font-weight: 650;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.painter-navigator__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
}

.painter-navigator__icon {
  display: inline-grid;
  width: 24px;
  height: 24px;
  place-items: center;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 5px;
  background: var(--saier-color-surface, rgb(255 255 255 / 6%));
  color: var(--saier-color-text-muted, rgb(255 255 255 / 76%));
}

.painter-navigator__icon:hover {
  background: var(--saier-color-surface-hover, rgb(255 255 255 / 10%));
  color: var(--saier-color-text, white);
}

.painter-navigator__surface {
  position: relative;
  display: block;
  width: calc(100% - 16px);
  max-height: 190px;
  margin: 8px auto;
  overflow: hidden;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 5px;
  background:
    linear-gradient(45deg, var(--saier-color-checker-light, rgb(255 255 255 / 10%)) 25%, transparent 25%),
    linear-gradient(-45deg, var(--saier-color-checker-light, rgb(255 255 255 / 10%)) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--saier-color-checker-light, rgb(255 255 255 / 10%)) 75%),
    linear-gradient(-45deg, transparent 75%, var(--saier-color-checker-light, rgb(255 255 255 / 10%)) 75%),
    var(--saier-color-checker-dark, rgb(31 33 37));
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
  background-size: 16px 16px;
  cursor: crosshair;
  touch-action: none;
}

.painter-navigator__surface:disabled {
  cursor: default;
}

.painter-navigator__surface:focus-visible,
.painter-navigator__icon:focus-visible {
  outline: 2px solid var(--saier-color-focus, rgb(147 197 253 / 72%));
  outline-offset: 1px;
}

.painter-navigator__image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  user-select: none;
  -webkit-user-drag: none;
}

.painter-navigator__empty {
  display: grid;
  min-height: 112px;
  place-items: center;
  color: var(--saier-color-text-subtle, rgb(255 255 255 / 54%));
  font-size: 12px;
  line-height: 1.2;
}

.painter-navigator__empty span {
  display: block;
}

.painter-navigator__empty span:first-child {
  margin-bottom: 4px;
  font-size: 24px;
}

.painter-navigator__viewport {
  position: absolute;
  min-width: 10px;
  min-height: 10px;
  border: 2px solid var(--saier-color-info, rgb(92 213 255 / 96%));
  border-radius: 3px;
  background: transparent;
  box-shadow:
    0 0 0 1px var(--saier-color-swatch-inset, rgb(0 0 0 / 52%)),
    0 0 18px var(--saier-color-info-border, rgb(92 213 255 / 28%));
  pointer-events: none;
}

.painter-navigator.is-dragging .painter-navigator__viewport {
  border-color: var(--saier-color-swatch-outline, rgb(255 255 255 / 96%));
}

.painter-navigator__meta {
  padding: 0 9px 8px;
  color: var(--saier-color-text-subtle, rgb(255 255 255 / 54%));
  font-size: 11px;
  line-height: 1.2;
}
</style>

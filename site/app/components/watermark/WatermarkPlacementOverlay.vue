<script setup lang="ts">
import type { LoadedPreset } from '~/features/watermark/preset'
import type { PresetPlacement } from '~/features/watermark/preset-contract'
import { computed, ref, useTemplateRef, watch } from 'vue'
import { fitPlacement, isMovableAsset, WATERMARK_ROLE_NAMES } from '~/features/watermark/editing'

const props = defineProps<{
  preset: LoadedPreset
  placements: PresetPlacement[]
  image: { width: number, height: number }
  selected: number
  disabled: boolean
}>()
const emit = defineEmits<{
  select: [index: number]
  update: [index: number, patch: Partial<PresetPlacement>]
  remove: [index: number]
  undo: []
  redo: []
}>()
const surface = useTemplateRef('surface')
const draft = ref<PresetPlacement>()
let gesture: { index: number, pointerId: number, x: number, y: number, mode: 'move' | 'scale', start: PresetPlacement, rect: DOMRect } | undefined
const items = computed(() => props.placements.map((placement, index) => ({
  index,
  placement: index === gesture?.index && draft.value ? draft.value : placement,
  asset: props.preset.assets.find(a => a.id === placement.assetId)!,
})).filter(item => isMovableAsset(item.asset)))

function style(p: PresetPlacement, ratio: number) {
  return { left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.width * 100}%`, height: `${p.width * ratio * 100}%`, transform: `rotate(${p.rotation}deg)` }
}

function begin(event: PointerEvent, index: number, mode: 'move' | 'scale'): void {
  if (props.disabled || event.button !== 0 || gesture || !surface.value)
    return
  emit('select', index)
  gesture = { index, pointerId: event.pointerId, mode, x: event.clientX, y: event.clientY, start: { ...props.placements[index]! }, rect: surface.value.getBoundingClientRect() }
  draft.value = { ...gesture.start }
  surface.value.setPointerCapture(event.pointerId)
  ;(event.currentTarget as HTMLElement).focus()
}

function move(event: PointerEvent): void {
  if (!gesture || event.pointerId !== gesture.pointerId)
    return
  const { start, index, rect } = gesture
  const asset = props.preset.assets.find(a => a.id === start.assetId)!
  const dx = (event.clientX - gesture.x) / rect.width
  const dy = (event.clientY - gesture.y) / rect.height
  if (gesture.mode === 'move') {
    draft.value = fitPlacement(start, asset, props.image, { x: start.x + dx, y: start.y + dy })
  }
  else {
    const ratio = asset.height / asset.width
    const radians = start.rotation * Math.PI / 180
    const localX = dx * Math.cos(radians) + dy * props.image.height / props.image.width * Math.sin(radians)
    const localY = -dx * Math.sin(radians) + dy * props.image.height / props.image.width * Math.cos(radians)
    const width = Math.max(0.005, Math.min(1, start.width + 2 * (localX + ratio * localY) / (1 + ratio * ratio)))
    draft.value = fitPlacement(start, asset, props.image, { width })
  }
  emit('select', index)
}

function finish(event?: PointerEvent): void {
  if (!gesture || (event && event.pointerId !== gesture.pointerId))
    return
  const active = gesture
  const next = draft.value
  gesture = undefined
  draft.value = undefined
  if (surface.value?.hasPointerCapture(active.pointerId))
    surface.value.releasePointerCapture(active.pointerId)
  if (event?.type === 'pointerup' && next && !props.disabled)
    emit('update', active.index, next)
}

function keydown(event: KeyboardEvent, index: number): void {
  if (props.disabled)
    return
  if (event.key === 'Escape') {
    event.preventDefault()
    finish()
    return
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey)
      emit('redo')
    else
      emit('undo')
    return
  }
  if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    emit('remove', index)
    return
  }
  const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key]
  if (!direction || gesture)
    return
  event.preventDefault()
  const p = props.placements[index]!
  const step = event.shiftKey ? 10 : 1
  emit('update', index, { x: p.x + direction[0]! * step / props.image.width, y: p.y + direction[1]! * step / props.image.height })
}

watch(() => [props.placements, props.disabled, props.image], () => finish())
</script>

<template>
  <div ref="surface" class="placement-overlay" @pointermove="move" @pointerup="finish" @pointercancel="finish" @lostpointercapture="finish">
    <div
      v-for="item in items" :key="item.index" class="placement-box" :class="{ selected: selected === item.index }"
      :style="style(item.placement, image.width * item.asset.height / item.asset.width / image.height)"
    >
      <button
        type="button" class="placement-target" :aria-label="`选择水印 ${item.index + 1} · ${WATERMARK_ROLE_NAMES[item.asset.role]}`" :aria-pressed="selected === item.index" :disabled="disabled"
        @pointerdown.stop.prevent="begin($event, item.index, 'move')" @click="emit('select', item.index)" @focus="emit('select', item.index)" @keydown="keydown($event, item.index)"
      />
      <button
        v-if="selected === item.index" type="button" class="scale-handle" aria-label="等比缩放选中水印" :disabled="disabled"
        @pointerdown.stop.prevent="begin($event, item.index, 'scale')" @keydown="keydown($event, item.index)"
      />
    </div>
  </div>
</template>

<style scoped>
.placement-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.placement-box {
  position: absolute;
  box-sizing: border-box;
  border: 1px solid transparent;
  transform-origin: center;
}
.placement-box.selected,
.placement-box:focus-within,
.placement-box:hover {
  border-color: var(--saier-color-accent);
}
.placement-target,
.scale-handle {
  position: absolute;
  pointer-events: auto;
  touch-action: none;
  border: 0;
  padding: 0;
  border-radius: 0;
}
.placement-target {
  inset: 0;
  width: 100%;
  height: 100%;
  background: transparent;
  cursor: move;
}
.scale-handle {
  right: -6px;
  bottom: -6px;
  width: 12px;
  height: 12px;
  background: var(--saier-color-accent);
  border: 1px solid var(--saier-color-panel);
  cursor: nwse-resize;
}
.placement-target:focus-visible,
.scale-handle:focus-visible {
  outline: 2px solid var(--saier-color-accent);
  outline-offset: 2px;
}
</style>

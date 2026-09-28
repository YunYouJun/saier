<script setup lang="ts">
import type { PresetPlacement } from '~/features/watermark/preset-contract'
import type { WatermarkWorkspaceState } from '~/features/watermark/workspace'
import '@saier/vue/styles/editor-form.css'

defineProps<{ layer?: WatermarkWorkspaceState['layers'][number] }>()
const emit = defineEmits<{ update: [patch: Partial<PresetPlacement>] }>()
function number(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="inspector saier-editor-form" aria-label="选中水印属性">
    <template v-if="layer">
      <header class="selection-heading">
        <img :src="layer.source" alt="" width="32" height="32">
        <div><strong :title="layer.name">{{ layer.name }}</strong><span>{{ layer.frame ? '边框 · 固定贴边' : layer.movable ? '水印图层 · 等比变换' : '纹理 · 平铺全画布' }}</span></div>
      </header>
      <div class="inspector-fields">
        <div v-if="layer.movable || !layer.frame" class="section-label">
          位置与大小
        </div>
        <div class="coordinates">
          <template v-if="layer.movable">
            <label><span>X</span><input type="number" aria-label="图层 X %" :value="+(layer.placement.x * 100).toFixed(3)" step="0.1" @change="emit('update', { x: number($event) / 100 })"><small>%</small></label>
            <label><span>Y</span><input type="number" aria-label="图层 Y %" :value="+(layer.placement.y * 100).toFixed(3)" step="0.1" @change="emit('update', { y: number($event) / 100 })"><small>%</small></label>
          </template>
          <label v-if="!layer.frame"><span>{{ layer.movable ? '宽' : '间距' }}</span><input type="number" aria-label="图层宽度 %" :value="+(layer.placement.width * 100).toFixed(3)" min="0.5" max="100" step="0.1" @change="emit('update', { width: number($event) / 100 })"><small>%</small></label>
          <label v-if="layer.movable"><span>旋转</span><input type="number" aria-label="图层角度" :value="+layer.placement.rotation.toFixed(2)" min="-180" max="180" @change="emit('update', { rotation: number($event) })"><small>°</small></label>
        </div>
        <div class="section-label appearance-label">
          外观
        </div>
        <label class="property-row opacity-row"><span>不透明度</span>
          <input type="range" aria-label="图层不透明度" min="0.05" max="1" step="0.01" :value="layer.placement.opacity" @change="emit('update', { opacity: number($event) })">
          <output>{{ Math.round(layer.placement.opacity * 100) }}<small>%</small></output>
        </label>
        <div v-if="layer.recolorable" class="property-row color-row">
          <span>颜色</span>
          <label class="color-value"><input type="color" aria-label="图层颜色" :value="layer.placement.color || '#304050'" @change="emit('update', { color: ($event.target as HTMLInputElement).value })"><span>{{ layer.placement.color?.toUpperCase() || '素材原色' }}</span></label>
          <button type="button" class="reset-color" aria-label="恢复素材原色" title="恢复素材原色" @click="emit('update', { color: '' })">
            <span class="i-ph-arrow-counter-clockwise" aria-hidden="true" />
          </button>
        </div>
        <button v-if="layer.movable" type="button" class="scale-action" @click="emit('update', { width: layer.placement.width * 0.7 })">
          <span class="i-ph-arrows-in-simple" aria-hidden="true" />缩小为 70%
        </button>
        <p class="editor-hint">
          {{ layer.movable ? '拖动移动 · 角点缩放 · 圆点旋转' : '保持边框贴边、纹理铺满画布。' }}
        </p>
      </div>
    </template>
    <p v-else class="inspector-fields editor-hint">
      从图层列表选择水印以调整属性。
    </p>
  </section>
</template>

<style scoped>
.selection-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 12px;
  border-bottom: 1px solid var(--saier-color-border);
}
.selection-heading img {
  flex: 0 0 32px;
  width: 32px;
  height: 32px;
  padding: 3px;
  object-fit: contain;
  border: 1px solid var(--saier-color-border);
  border-radius: 5px;
  background: repeating-conic-gradient(#b4b5ba 0% 25%, #caccd0 0% 50%) 0 / 8px 8px;
}
.selection-heading div {
  min-width: 0;
}
.selection-heading strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 600;
}
.selection-heading div > span {
  color: var(--saier-color-text-muted);
  font-size: 11px;
}
.inspector-fields {
  display: grid;
  gap: 8px;
  padding: 12px;
}
.section-label {
  font-size: 11px;
  color: var(--saier-color-text-muted);
  font-weight: 500;
}
.appearance-label {
  margin-top: 4px;
}
.coordinates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
}
.coordinates label {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 3px;
  padding: 0 6px;
  border: 1px solid var(--saier-color-border);
  border-radius: var(--saier-radius-control);
  background: var(--saier-color-field);
}
.coordinates label:focus-within {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}
.coordinates label > span {
  color: var(--saier-color-text-muted);
  flex: 0 0 auto;
  font-size: 11px;
}
.coordinates input {
  width: 100%;
  padding-inline: 0;
  border: 0;
  background: transparent;
  text-align: right;
  outline: none;
  appearance: textfield;
}
.coordinates input::-webkit-inner-spin-button {
  appearance: none;
}
small {
  font-size: 10px;
  color: var(--saier-color-text-subtle);
}
.property-row {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) 30px;
  align-items: center;
  gap: 6px;
}
.property-row > span {
  color: var(--saier-color-text-muted);
}
output {
  text-align: right;
  font-size: 11px;
}
output small {
  margin-left: 2px;
}
.color-value {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: var(--saier-control-size);
  font-size: 11px;
}
input[type='color'] {
  width: 22px;
  height: 22px;
  padding: 2px;
  border: 1px solid var(--saier-color-border);
  border-radius: 5px;
  background: var(--saier-color-field);
  cursor: pointer;
}
input[type='color']::-webkit-color-swatch-wrapper {
  padding: 0;
}
input[type='color']::-webkit-color-swatch {
  border: 0;
  border-radius: 2px;
}
.reset-color {
  width: var(--saier-control-size);
  padding: 0;
  background: transparent;
  border-color: transparent;
}
.scale-action {
  justify-self: start;
}
@media (pointer: coarse) {
  input[type='color'] {
    width: 36px;
    height: 36px;
  }
}
</style>

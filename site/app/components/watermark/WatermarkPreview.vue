<script setup lang="ts">
import type { ProtectedRegion } from '~/features/watermark/analysis'
import type { LoadedPreset } from '~/features/watermark/preset'
import type { PresetPlacement } from '~/features/watermark/preset-contract'
import { ref } from 'vue'
import WatermarkPlacementOverlay from './WatermarkPlacementOverlay.vue'

defineProps<{ src: string, regions: ProtectedRegion[], preset?: LoadedPreset, placements: PresetPlacement[], image?: { width: number, height: number }, selected: number, disabled: boolean }>()
const emit = defineEmits<{
  select: [index: number]
  update: [index: number, patch: Partial<PresetPlacement>]
  remove: [index: number]
  undo: []
  redo: []
}>()
const showRegions = ref(true)
</script>

<template>
  <div class="watermark-preview">
    <div v-if="src" class="watermark-preview-image">
      <img :src="src" alt="水印合成预览" draggable="false">
      <WatermarkPlacementOverlay
        v-if="preset && image" :preset="preset" :placements="placements" :image="image" :selected="selected" :disabled="disabled"
        @select="emit('select', $event)" @update="(index, patch) => emit('update', index, patch)" @remove="emit('remove', $event)" @undo="emit('undo')" @redo="emit('redo')"
      />
      <template v-if="showRegions">
        <div
          v-for="(region, index) in regions" :key="index"
          class="protected-region" :title="region.label"
          :style="{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }"
        >
          <span>{{ region.label }}</span>
        </div>
      </template>
    </div>
    <p v-else>
      拖入画作，或从左侧选择图片
    </p>
    <label v-if="regions.length" class="preview-toggle">
      <input v-model="showRegions" type="checkbox"> 显示保护区域（不导出）
    </label>
    <p v-if="placements.length" class="editing-hint">
      点选水印拖动，右下角等比缩放；方向键微调 1px，Shift 加速到 10px。松开后更新合成，Esc 取消拖动。
    </p>
  </div>
</template>

<style scoped>
.watermark-preview {
  position: sticky;
  top: 24px;
  display: grid;
  gap: 12px;
  min-height: 360px;
  place-items: center;
  padding: 24px;
  background: var(--saier-color-workspace);
  border-radius: 12px;
}
.watermark-preview-image {
  position: relative;
  max-width: 100%;
  width: fit-content;
  line-height: 0;
}
img {
  display: block;
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
}
.protected-region {
  position: absolute;
  border: 2px solid var(--saier-color-warning);
  box-sizing: border-box;
  pointer-events: none;
}
.protected-region span {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.5;
  font-size: 12px;
  background: var(--saier-color-panel);
  color: var(--saier-color-warning-text);
}
.preview-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.editing-hint {
  max-width: 560px;
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--saier-color-text-muted);
}
@media (max-width: 760px) {
  .watermark-preview {
    position: static;
  }
}
</style>

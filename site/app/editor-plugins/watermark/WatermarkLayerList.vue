<script setup lang="ts">
import type { WatermarkDocumentHost } from './useWatermarkDocuments'

defineProps<{ host: WatermarkDocumentHost }>()
</script>

<template>
  <div class="watermark-layers" role="list" aria-label="水印图层">
    <button v-for="layer in host.state.value?.layers.slice().reverse()" :key="layer.id" type="button" :disabled="host.busy.value" :aria-pressed="layer.id === host.state.value?.selectedId" :aria-label="`选择图层 ${layer.name}`" @click="host.active.value?.select(layer.id)">
      <span class="layer-marker i-ph-stack-simple" aria-hidden="true" /><img :src="layer.source" alt="" width="24" height="24"><span class="layer-name" :title="layer.name">{{ layer.name }}</span><small>{{ Math.round(layer.placement.opacity * 100) }}%</small>
    </button>
    <div class="original">
      <span class="i-ph-lock-simple" aria-hidden="true" /><span class="layer-name">原图</span><small>固定</small>
    </div>
  </div>
</template>

<style scoped>
.watermark-layers {
  padding: 5px;
  display: grid;
  gap: 1px;
  font-family: var(--saier-font-ui);
}
button,
.original {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  min-height: var(--ylf-editor-row);
  padding: 3px 7px;
  color: var(--saier-color-text);
  border: 1px solid transparent;
  border-radius: var(--saier-radius-control);
  background: transparent;
  font-size: var(--saier-font-size-control);
  text-align: left;
}
button {
  cursor: pointer;
}
button:hover:not(:disabled) {
  background: var(--saier-color-surface-hover);
}
button[aria-pressed='true'],
button[aria-pressed='true']:hover:not(:disabled) {
  background: var(--saier-color-accent-soft);
  color: var(--saier-color-accent-text);
}
button:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: -2px;
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.layer-marker {
  color: var(--saier-color-text-subtle);
  font-size: 13px;
  flex: 0 0 13px;
}
button[aria-pressed='true'] .layer-marker {
  color: var(--saier-color-accent);
}
.layer-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
img {
  width: 24px;
  height: 24px;
  flex: 0 0 24px;
  object-fit: contain;
  border: 1px solid var(--saier-color-border);
  border-radius: 3px;
  background: repeating-conic-gradient(#b4b5ba 0% 25%, #caccd0 0% 50%) 0 / 8px 8px;
}
small {
  margin-left: auto;
  color: var(--saier-color-text-muted);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.original {
  margin-top: 5px;
  border-top-color: var(--saier-color-border);
  border-radius: 0;
  color: var(--saier-color-text-muted);
}
</style>

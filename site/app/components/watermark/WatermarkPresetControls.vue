<script setup lang="ts">
import type { LoadedPreset } from '~/features/watermark/preset'
import type { PresetPlacement } from '~/features/watermark/preset-contract'

import PainterFileInput from '@saier/vue/components/PainterFileInput.vue'
import { isMovableAsset, WATERMARK_ROLE_NAMES as roleNames } from '~/features/watermark/editing'

defineProps<{ preset?: LoadedPreset, placements: PresetPlacement[], selected: number, canAdd: boolean, canUndo: boolean, canRedo: boolean, disabled: boolean }>()

const emit = defineEmits<{
  import: [file: File]
  toggle: [id: string, enabled: boolean]
  update: [index: number, patch: Partial<PresetPlacement>]
  remove: [index: number]
  export: []
  select: [index: number]
  add: [id: string]
  undo: []
  redo: []
}>()

function numeric(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <section class="preset-controls saier-editor-form" aria-label="整套水印预设">
    <PainterFileInput label="整套水印预设" accept="application/json,.json" :disabled="disabled" @pick="emit('import', $event)" />
    <template v-if="preset">
      <strong>{{ preset.name }}</strong>
      <p class="editor-hint">
        AI 只接收画作缩略图、素材尺寸和规则，不接收水印素材图片。
      </p>
      <p class="editor-hint">
        勾选用于分析的素材（改变勾选会重置布局）；也可直接添加、手动摆放。
      </p>
      <div v-for="asset in preset.assets" :key="asset.id" class="asset-row">
        <label>
          <input type="checkbox" :checked="asset.enabled" :disabled="disabled" @change="emit('toggle', asset.id, ($event.target as HTMLInputElement).checked)">
          <img :src="asset.source" alt="" width="32" height="32">
          <span class="asset-name" :title="asset.name || roleNames[asset.role]">{{ asset.name || roleNames[asset.role] }}</span>
        </label>
        <button type="button" :disabled="disabled || !canAdd || !asset.enabled || placements.length >= 12" :aria-label="`添加${roleNames[asset.role]}`" @click="emit('add', asset.id)">
          ＋
        </button>
      </div>
      <button type="button" @click="emit('export')">
        保存预设包
      </button>
      <p class="editor-hint">
        缎带在主体上交叉，主图标覆盖衣服，纹理铺满画面；仅脸部等保护区留空。可省略辅助装饰。
      </p>
      <div class="history-actions">
        <button type="button" :disabled="disabled || !canUndo" @click="emit('undo')">
          撤销调整
        </button>
        <button type="button" :disabled="disabled || !canRedo" @click="emit('redo')">
          重做调整
        </button>
      </div>
      <p v-if="placements.length" class="editor-hint">
        点选画布或下面的水印名称，展开对应属性。边框固定贴边，满屏纹理可调整密度和透明度。
      </p>
      <fieldset v-for="(p, index) in placements" :key="index" :disabled="disabled" :class="{ selected: selected === index }">
        <legend>
          <button type="button" :aria-expanded="selected === index" :disabled="disabled" @click="emit('select', index)">
            {{ index + 1 }} · {{ roleNames[preset.assets.find(a => a.id === p.assetId)!.role] }}
          </button>
        </legend>
        <div v-if="selected === index" class="placement-properties">
          <div class="position-grid">
            <label v-if="isMovableAsset(preset.assets.find(a => a.id === p.assetId)!)">X % <input type="number" min="0" max="100" step="0.5" :value="+(p.x * 100).toFixed(2)" @change="emit('update', index, { x: numeric($event) / 100 })"></label>
            <label v-if="isMovableAsset(preset.assets.find(a => a.id === p.assetId)!)">Y % <input type="number" min="0" max="100" step="0.5" :value="+(p.y * 100).toFixed(2)" @change="emit('update', index, { y: numeric($event) / 100 })"></label>
            <label v-if="preset.assets.find(a => a.id === p.assetId)!.role !== 'frame'">宽度 % <input type="number" min="0.5" max="100" step="0.5" :value="+(p.width * 100).toFixed(2)" @change="emit('update', index, { width: numeric($event) / 100 })"></label>
            <label v-if="isMovableAsset(preset.assets.find(a => a.id === p.assetId)!)">角度 ° <input type="number" min="-180" max="180" :value="p.rotation" @change="emit('update', index, { rotation: numeric($event) })"></label>
          </div>
          <label>不透明度 {{ Math.round(p.opacity * 100) }}% <input type="range" min="0.05" max="1" step="0.05" :value="p.opacity" @change="emit('update', index, { opacity: numeric($event) })"></label>
          <div v-if="preset.assets.find(a => a.id === p.assetId)?.recolorable" class="placement-properties">
            <label>颜色
              <input type="color" :value="p.color || '#304050'" @change="emit('update', index, { color: ($event.target as HTMLInputElement).value })">
            </label>
            <button type="button" @click="emit('update', index, { color: '' })">
              原色
            </button>
          </div>
          <button v-if="isMovableAsset(preset.assets.find(a => a.id === p.assetId)!)" type="button" @click="emit('update', index, { width: p.width * 0.7 })">
            缩小为 70%
          </button>
          <button type="button" @click="emit('remove', index)">
            移除此处水印
          </button>
        </div>
      </fieldset>
    </template>
    <p v-else class="editor-hint">
      导入 .saier-watermarks.json，一次复用十字缎带、主图标、满屏纹理和边框。
    </p>
  </section>
</template>

<style scoped>
.preset-controls {
  display: grid;
  gap: 8px;
  min-width: 0;
}
.asset-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.asset-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.asset-row label {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  font-size: 12px;
}
.asset-row img {
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  object-fit: contain;
  background: var(--saier-color-workspace);
}
.position-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.history-actions {
  display: flex;
  gap: 8px;
}
.placement-properties {
  display: grid;
  gap: 10px;
}
fieldset.selected {
  border-color: var(--saier-color-accent-border);
}
legend button {
  padding: 4px 6px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
}
fieldset {
  display: grid;
  gap: 10px;
  padding: 8px;
  min-width: 0;
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
}
legend {
  font-size: 12px;
  overflow-wrap: anywhere;
}
</style>

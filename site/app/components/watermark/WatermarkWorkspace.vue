<script setup lang="ts">
import type { PresetPlacement } from '~/features/watermark/preset-contract'
import type { WatermarkWorkInput } from '~/features/watermark/workfile'
import type { WatermarkWorkspaceState } from '~/features/watermark/workspace'
import PainterPanelHeader from '@saier/vue/components/PainterPanelHeader.vue'
import { computed, onBeforeUnmount, onMounted, shallowRef, useTemplateRef } from 'vue'
import { downloadWatermarkBlob, serializeWatermarkWorkfile } from '~/features/watermark/workfile'
import { WatermarkWorkspace } from '~/features/watermark/workspace'
import WatermarkWorkspaceInspector from './WatermarkWorkspaceInspector.vue'

const props = defineProps<{ input: WatermarkWorkInput }>()
const emit = defineEmits<{ apply: [placements: PresetPlacement[]], close: [] }>()
const canvas = useTemplateRef('canvas')
const session = shallowRef<WatermarkWorkspace>()
const state = shallowRef<WatermarkWorkspaceState>()
const error = shallowRef('')
const ready = shallowRef(false)
const exporting = shallowRef(false)
const exportingPsd = shallowRef(false)
const selected = computed(() => state.value?.layers.find(layer => layer.id === state.value?.selectedId))
const mode = shallowRef<'selection' | 'drag'>('selection')
let observer: ResizeObserver | undefined

function report(reason: unknown): void {
  error.value = reason instanceof Error ? reason.message : '工作台操作失败'
}
function setMode(value: 'selection' | 'drag'): void {
  mode.value = value
  session.value?.painter.useTool(value)
}
function update(patch: Partial<PresetPlacement>): void {
  if (!selected.value)
    return
  try {
    session.value?.update(selected.value.id, patch)
    error.value = ''
  }
  catch (reason) {
    report(reason)
  }
}
function apply(): void {
  session.value!.finishTransform()
  emit('apply', session.value!.getPlacements())
}
async function download(): Promise<void> {
  exporting.value = true
  error.value = ''
  try {
    const output = session.value!.exportCanvas()
    const blob = await new Promise<Blob | null>(resolve => output.toBlob(resolve, 'image/png'))
    if (!blob)
      throw new Error('PNG 导出失败')
    downloadWatermarkBlob(blob, 'saier-watermarked.png')
  }
  catch (reason) { report(reason) }
  finally { exporting.value = false }
}
function save(): void {
  session.value!.finishTransform()
  const text = serializeWatermarkWorkfile({ ...props.input, placements: session.value!.getPlacements() })
  downloadWatermarkBlob(new Blob([text], { type: 'application/json' }), 'saier-watermark-workfile.json')
}
async function downloadPsd(): Promise<void> {
  exporting.value = exportingPsd.value = true
  error.value = ''
  try {
    const { exportWatermarkPsd } = await import('~/features/watermark/psd-export')
    session.value!.finishTransform()
    const blob = exportWatermarkPsd({ ...props.input, placements: session.value!.getPlacements() })
    downloadWatermarkBlob(blob, 'saier-watermarked.psd')
  }
  catch (reason) { report(reason) }
  finally { exporting.value = exportingPsd.value = false }
}

onMounted(async () => {
  const workspace = new WatermarkWorkspace(canvas.value!, props.input, () => {
    if (session.value)
      state.value = workspace.getState()
  }, report)
  session.value = workspace
  try {
    await workspace.init()
    if (!session.value)
      return
    ready.value = true
    observer = new ResizeObserver(() => workspace.painter.onResize())
    observer.observe(canvas.value!)
  }
  catch (reason) { report(reason) }
})
onBeforeUnmount(() => {
  observer?.disconnect()
  session.value?.destroy()
  session.value = undefined
})
</script>

<template>
  <section class="watermark-workspace" aria-label="Saier 水印工作台">
    <header class="workspace-header">
      <strong>Saier <span>水印工作台</span></strong>
      <span class="dimensions">{{ input.artwork.width }} × {{ input.artwork.height }} · {{ input.placements.length }} 个水印图层</span>
      <div class="workspace-actions">
        <button type="button" :disabled="(!ready && !error) || exporting" @click="emit('close')">
          取消编辑
        </button>
        <button type="button" :disabled="!ready || exporting" @click="save">
          保存工作文件
        </button>
        <button type="button" :disabled="!ready || exporting" @click="apply">
          应用调整
        </button>
        <button class="primary" type="button" :disabled="!ready || exporting" @click="download">
          {{ exporting && !exportingPsd ? '正在导出…' : '下载原尺寸 PNG' }}
        </button>
        <button type="button" :disabled="!ready || exporting" title="Krita / Photoshop 可编辑像素图层，保留混合模式和保护蒙版" @click="downloadPsd">
          {{ exportingPsd ? '正在导出 PSD…' : '下载分层 PSD' }}
        </button>
      </div>
    </header>
    <div class="workspace-toolbar">
      <button type="button" :disabled="!ready" :aria-pressed="mode === 'selection'" @click="setMode('selection')">
        选择 / 变换
      </button>
      <button type="button" :disabled="!ready" :aria-pressed="mode === 'drag'" @click="setMode('drag')">
        平移画布
      </button>
      <span class="separator" />
      <button type="button" :disabled="!state?.canUndo" @click="session?.undo()">
        撤销
      </button>
      <button type="button" :disabled="!state?.canRedo" @click="session?.redo()">
        重做
      </button>
      <span class="separator" />
      <button type="button" :disabled="!ready" @click="session?.fitView()">
        适配画布
      </button>
      <button type="button" :disabled="!ready" aria-label="缩小画布" @click="session?.zoom(0.8)">
        −
      </button>
      <span class="zoom">{{ Math.round((state?.zoom ?? 1) * 100) }}%</span>
      <button type="button" :disabled="!ready" aria-label="放大画布" @click="session?.zoom(1.25)">
        ＋
      </button>
    </div>
    <div class="workspace-body">
      <div class="workspace-canvas-host">
        <canvas ref="canvas" class="workspace-canvas" tabindex="0" aria-label="Saier 图层编辑画布" @pointerdown.capture="session?.pointerDown($event)" @keydown="session?.keydown($event)" />
        <p v-if="!ready" class="workspace-status">
          {{ error || '正在打开图层…' }}
        </p>
      </div>
      <aside class="workspace-sidebar">
        <PainterPanelHeader>图层</PainterPanelHeader>
        <div class="workspace-layer-list" role="list" aria-label="水印图层">
          <button
            v-for="layer in state?.layers.slice().reverse()" :key="layer.id" type="button" class="workspace-layer"
            :aria-pressed="layer.id === state?.selectedId" :aria-label="`选择图层 ${layer.name}`"
            @click="session?.select(layer.id); mode = 'selection'"
          >
            <img :src="layer.source" alt="" width="36" height="36"><span>{{ layer.name }}</span><small>{{ Math.round(layer.placement.opacity * 100) }}%</small>
          </button>
          <div class="original-layer">
            ▣ 原图 <small>固定</small>
          </div>
        </div>
        <WatermarkWorkspaceInspector :layer="selected" @update="update" />
      </aside>
    </div>
    <footer class="workspace-footer">
      <span v-if="error" role="alert">{{ error }}</span>
      <span v-else>滚轮缩放 · 方向键微调 · Shift + 方向键 10px · Ctrl / ⌘ Z 撤销 · 脸部保护与原图尺寸保留</span>
    </footer>
  </section>
</template>

<style scoped>
.watermark-workspace {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  color: var(--saier-color-text);
  background: var(--saier-color-app-background);
  text-align: left;
}
.workspace-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--saier-color-border);
}
.workspace-header strong {
  font-size: 18px;
  white-space: nowrap;
}
.workspace-header strong span {
  font-size: 14px;
  font-weight: 500;
  margin-left: 8px;
}
.dimensions {
  font-size: 12px;
  color: var(--saier-color-text-muted);
}
.workspace-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}
.workspace-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  overflow-x: auto;
}
.workspace-toolbar button {
  white-space: nowrap;
}
.separator {
  height: 20px;
  border-left: 1px solid var(--saier-color-border);
  margin: 0 8px;
}
button {
  font-size: 12px;
  padding: 6px 10px;
  border: 1px solid var(--saier-color-border);
  border-radius: 4px;
  background: var(--saier-color-panel);
  cursor: pointer;
}
button.primary,
button[aria-pressed='true'] {
  background: var(--saier-color-accent-soft);
  border-color: var(--saier-color-accent-border);
  color: var(--saier-color-accent-text);
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}
button:focus-visible,
canvas:focus-visible {
  outline: 2px solid var(--saier-color-accent);
  outline-offset: -2px;
}
.workspace-body {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  min-height: 0;
}
.workspace-canvas-host {
  position: relative;
  min-height: 0;
  overflow: hidden;
  background: var(--saier-color-workspace);
}
.workspace-canvas {
  display: block;
  width: 100%;
  height: 100%;
  touch-action: none;
}
.workspace-status {
  position: absolute;
  left: 24px;
  top: 24px;
  padding: 12px;
  background: var(--saier-color-panel);
}
.workspace-sidebar {
  min-height: 0;
  overflow-y: auto;
  border-left: 1px solid var(--saier-color-border);
  background: var(--saier-color-panel);
}
.workspace-layer-list {
  display: grid;
  gap: 4px;
  padding: 8px;
  max-height: 38vh;
  overflow-y: auto;
}
.workspace-layer {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 6px;
  text-align: left;
}
.workspace-layer img {
  width: 36px;
  height: 36px;
  object-fit: contain;
  background: var(--saier-color-workspace);
}
.workspace-layer span {
  flex: 1;
}
.workspace-layer small,
.original-layer small {
  color: var(--saier-color-text-muted);
  margin-left: auto;
}
.original-layer {
  display: flex;
  align-items: center;
  font-size: 12px;
  padding: 10px;
}
.workspace-footer {
  padding: 8px 16px;
  font-size: 12px;
  color: var(--saier-color-text-muted);
  border-top: 1px solid var(--saier-color-border);
}
.zoom {
  min-width: 40px;
  text-align: center;
  font-size: 12px;
}
@media (max-width: 800px) {
  .workspace-header {
    flex-wrap: wrap;
    gap: 8px;
  }
  .workspace-actions {
    width: 100%;
  }
  .dimensions {
    display: none;
  }
  .workspace-body {
    grid-template-columns: minmax(0, 1fr) 230px;
  }
}
</style>

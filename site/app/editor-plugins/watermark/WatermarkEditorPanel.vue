<script setup lang="ts">
import type { Painter } from 'saier'
import type { WatermarkDocumentHost } from './useWatermarkDocuments'
import type { PresetPlacement } from '~/features/watermark/preset-contract'
import PainterFileInput from '@saier/vue/components/PainterFileInput.vue'
import { computed, onMounted, watch } from 'vue'
import { useRuntimeConfig } from '#imports'
import WatermarkLibraryPanel from '~/components/watermark/WatermarkLibraryPanel.vue'
import WatermarkPresetControls from '~/components/watermark/WatermarkPresetControls.vue'
import WatermarkWorkspaceInspector from '~/components/watermark/WatermarkWorkspaceInspector.vue'
import { useYunlefunAuth } from '~/composables/useYunlefunAuth'
import { createCloudWatermarkProvider } from '~/features/watermark/cloud-provider'
import { useWatermarkLab } from '~/features/watermark/useWatermarkLab'
import { serializeWatermarkWorkfile } from '~/features/watermark/workfile'
import WatermarkDraftPanel from './WatermarkDraftPanel.vue'
import '@saier/vue/styles/editor-form.css'

const props = defineProps<{ painter?: Painter, host: WatermarkDocumentHost, available: boolean }>()
const auth = useYunlefunAuth()
const config = useRuntimeConfig()
const cloud = createCloudWatermarkProvider(String(config.public.saierWatermarkRuntimeUrl), auth.getRuntimeAccessToken)
const {
  addCustomAsset,
  loadWorkfile,
  selectedPlacement,
  canUndo,
  canRedo,
  undo,
  redo,
  addPlacement,
  preset,
  presetDescriptor,
  placements,
  chargedMicroPoints,
  operationId,
  loadPreset,
  toggleAsset,
  updatePlacement,
  removePlacement,
  exportPreset,
  artwork,
  regions,
  warnings,
  error,
  busy,
  loading,
  pairingCode,
  openDesktop,
  rules,
  provider,
  load,
  analyze,
  cancel,
} = useWatermarkLab(cloud)
provider.value = 'manual'
const STORAGE_KEY = 'saier:watermark-settings:v1'
const locked = computed(() => !props.available || props.host.busy.value || props.host.drafts.busy.value || busy.value || loading.value)
const selected = computed(() => props.host.state.value?.layers.find(layer => layer.id === props.host.state.value?.selectedId))

onMounted(() => {
  try {
    const settings = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (typeof settings.rules === 'string')
      rules.value = settings.rules.slice(0, 2000)
    if (['manual', 'codex', 'cloud'].includes(settings.provider))
      provider.value = settings.provider
  }
  catch { /* Settings are optional; never persist artwork or pairing credentials here. */ }
  void auth.initialize().catch(report)
})
watch([rules, provider], () => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ rules: rules.value, provider: provider.value }))
  }
  catch { /* Continue with in-memory settings. */ }
})
watch(() => props.host.active.value, cancel)
watch(() => props.available, available => !available && cancel())

function report(reason: unknown): void {
  error.value = reason instanceof Error ? reason.message : '水印操作失败'
}
async function apply(): Promise<void> {
  if (!props.available || !artwork.value || !preset.value)
    return
  try {
    await props.host.open({ artwork: artwork.value, preset: preset.value, placements: placements.value.map(p => ({ ...p })), regions: regions.value.map(r => ({ ...r })) })
  }
  catch (reason) { report(reason) }
}
async function openWorkfile(file: File): Promise<void> {
  if (await loadWorkfile(file))
    await apply()
}
async function useCurrentCanvas(): Promise<void> {
  const p = props.painter
  if (!p || locked.value)
    return
  try {
    const workspace = props.host.active.value
    if (workspace) {
      workspace.finishTransform()
      // Start another layout from its original, never watermark an already composed result.
      await loadWorkfile(new File([serializeWatermarkWorkfile({ ...workspace.input, placements: workspace.getPlacements() })], 'current.json', { type: 'application/json' }))
      return
    }
    const canvas = await p.extractCanvas('canvas', { mode: 'content' }) as HTMLCanvasElement
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob)
      throw new Error('当前画布读取失败')
    await load(new File([blob], 'current.png', { type: 'image/png' }), 'artwork')
  }
  catch (reason) { report(reason) }
}
function update(patch: Partial<PresetPlacement>): void {
  if (!selected.value || locked.value)
    return
  try {
    props.host.active.value?.update(selected.value.id, patch)
  }
  catch (reason) { report(reason) }
}
</script>

<template>
  <section class="watermark-editor-panel saier-editor-form" aria-label="水印插件">
    <p v-if="!available" role="status">
      切换到本地绘画文档后使用水印插件。
    </p>
    <div class="workfile-row">
      <PainterFileInput label="打开水印工作文件" accept="application/json,.json" :disabled="locked" @pick="openWorkfile" />
    </div>
    <WatermarkDraftPanel :host="host" :disabled="!available || host.busy.value || busy || loading" />
    <template v-if="host.active.value">
      <fieldset :disabled="locked">
        <WatermarkWorkspaceInspector :layer="selected" @update="update" />
        <div class="exports">
          <div class="export-label">
            导出作品 <span>原始分辨率</span>
          </div>
          <div class="export-formats">
            <button class="editor-primary" type="button" aria-label="下载 PNG" @click="host.download('png')">
              <span class="i-ph-download-simple" aria-hidden="true" />PNG
            </button>
            <button type="button" aria-label="下载分层 PSD" title="下载分层 PSD · 可在 Krita 编辑" @click="host.download('psd')">
              分层 PSD
            </button>
            <button class="save-workfile" type="button" aria-label="保存水印工作文件" title="保存水印工作文件" @click="host.download('workfile')">
              <span class="i-ph-floppy-disk" aria-hidden="true" />
            </button>
          </div>
          <p class="editor-hint">
            下载工作文件可长期保留素材与布局。
          </p>
        </div>
      </fieldset>
    </template>
    <details :open="!host.active.value">
      <summary><span class="i-ph-caret-right disclosure-caret" aria-hidden="true" /><span>素材、布局与 AI 配置</span><span class="i-ph-sliders-horizontal" aria-hidden="true" /></summary>
      <fieldset class="setup-fields" :disabled="locked">
        <button type="button" @click="useCurrentCanvas">
          使用当前画布 / 原图
        </button>
        <PainterFileInput label="或导入画作" accept="image/png,image/jpeg" @pick="load($event, 'artwork')" />
        <p v-if="artwork" class="editor-hint">
          已准备画作 {{ artwork.width }} × {{ artwork.height }}。应用后会在主画板新增水印文档。
        </p>
        <WatermarkLibraryPanel :preset="preset" :disabled="locked" @import="addCustomAsset" />
        <WatermarkPresetControls :preset="preset" :placements="placements" :selected="selectedPlacement" :can-add="!!artwork" :can-undo="canUndo" :can-redo="canRedo" :disabled="locked" @select="selectedPlacement = $event" @undo="undo" @redo="redo" @add="addPlacement" @import="loadPreset" @toggle="toggleAsset" @update="updatePlacement" @remove="removePlacement" @export="exportPreset" />
        <label>分析方式
          <select v-model="provider">
            <option value="manual">仅本地合成</option>
            <option value="codex">本机 Codex 运行时</option>
            <option value="cloud">云乐坊 AI 点 · 多模态分析</option>
          </select>
        </label>
        <template v-if="provider === 'codex'">
          <label>本机配对码 <input v-model="pairingCode" type="password" autocomplete="off"></label>
          <label class="inline"><input v-model="openDesktop" type="checkbox"> 在 Codex 打开分析记录</label>
        </template>
        <template v-if="provider === 'cloud'">
          <p v-if="auth.isAuthenticated.value">
            {{ auth.displayName.value }} · 云乐坊账号
          </p>
          <button v-else type="button" @click="auth.signIn('interactive')">
            登录云乐坊
          </button>
          <p class="editor-hint">
            分析会发送最长边 1024px 的缩略图并按 AI 点结算。停止等待后，已发出的分析仍可能完成并计费。
          </p>
          <p v-if="auth.errorMessage.value" role="alert">
            {{ auth.errorMessage.value }}
          </p>
        </template>
        <template v-if="provider !== 'manual'">
          <label>布局与避让规则 <textarea v-model="rules" rows="4" maxlength="2000" /></label>
          <button type="button" :disabled="!artwork || !presetDescriptor || (provider === 'codex' && !pairingCode) || (provider === 'cloud' && !auth.isAuthenticated.value)" @click="analyze">
            分析水印布局
          </button>
          <p class="editor-hint">
            AI 只分析位置与颜色，水印在浏览器合成。检查布局后再应用到画板。
          </p>
        </template>
        <button class="editor-primary" type="button" :disabled="!artwork || !preset || !placements.length" @click="apply">
          在主画板应用布局
        </button>
      </fieldset>
    </details>
    <button v-if="busy" type="button" @click="cancel">
      停止等待分析
    </button>
    <p v-if="host.busy.value || loading" role="status">
      正在处理图层…
    </p>
    <p v-if="chargedMicroPoints !== undefined" role="status">
      本次消耗 {{ (chargedMicroPoints / 1000).toFixed(4) }} AI 点
    </p>
    <p v-if="operationId" class="editor-hint">
      记录：{{ operationId }}
    </p>
    <p v-if="error" role="alert">
      {{ error }}
    </p>
    <p v-for="warning in warnings" :key="warning" role="status">
      {{ warning }}
    </p>
  </section>
</template>

<style scoped>
.watermark-editor-panel {
  min-width: 0;
}
.workfile-row {
  padding: 10px 12px;
  border-bottom: 1px solid var(--saier-color-border);
}
fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.setup-fields {
  display: grid;
  gap: 10px;
  padding: 4px 12px 12px;
}
.setup-fields > label:not(.painter-file-input) {
  display: grid;
  gap: 5px;
  color: var(--saier-color-text-muted);
}
.setup-fields > label.inline {
  display: flex;
  align-items: center;
  gap: 6px;
}
.setup-fields :where(select, textarea, input[type='password']) {
  width: 100%;
}
textarea {
  resize: vertical;
}
summary {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 36px;
  padding: 0 12px;
  cursor: pointer;
  list-style: none;
  font-weight: 500;
}
summary::-webkit-details-marker {
  display: none;
}
summary > :last-child {
  margin-left: auto;
  color: var(--saier-color-text-subtle);
}
.disclosure-caret {
  font-size: 11px;
  color: var(--saier-color-text-muted);
}
details[open] .disclosure-caret {
  transform: rotate(90deg);
}
details {
  border-top: 1px solid var(--saier-color-border);
}
.exports {
  display: grid;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--saier-color-border);
}
.export-label {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--saier-color-text-muted);
}
.export-label span {
  color: var(--saier-color-text-subtle);
}
.export-formats {
  display: grid;
  grid-template-columns: 1fr 1fr var(--saier-control-size);
  gap: 6px;
}
.save-workfile {
  padding: 0;
}
.watermark-editor-panel > p {
  padding: 8px 12px;
  margin: 0;
  overflow-wrap: anywhere;
}
[role='alert'] {
  color: var(--saier-color-danger);
}
@media (pointer: coarse) {
  summary {
    min-height: 44px;
  }
}
</style>

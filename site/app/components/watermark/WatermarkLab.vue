<script setup lang="ts">
import type { PresetPlacement } from '~/features/watermark/preset-contract'
import type { WatermarkWorkInput } from '~/features/watermark/workfile'
import { defineAsyncComponent, onMounted, shallowRef } from 'vue'
import { useRuntimeConfig } from '#imports'
import { useYunlefunAuth } from '~/composables/useYunlefunAuth'
import { createCloudWatermarkProvider } from '~/features/watermark/cloud-provider'
import { useWatermarkLab } from '~/features/watermark/useWatermarkLab'
import WatermarkPresetControls from './WatermarkPresetControls.vue'
import WatermarkPreview from './WatermarkPreview.vue'

const WatermarkWorkspace = defineAsyncComponent(() => import('./WatermarkWorkspace.vue'))
const workspaceInput = shallowRef<WatermarkWorkInput>()

const auth = useYunlefunAuth()
const config = useRuntimeConfig()
const cloud = createCloudWatermarkProvider(String(config.public.saierWatermarkRuntimeUrl), auth.getRuntimeAccessToken)

const { loadWorkfile, applyWorkspaceLayout, selectedPlacement, canUndo, canRedo, undo, redo, addPlacement, preset, presetDescriptor, placements, chargedMicroPoints, operationId, canDownload, loadPreset, toggleAsset, updatePlacement, removePlacement, exportPreset, sourceUrl, previewUrl, artwork, watermark, regions, warnings, error, busy, loading, pairingCode, openDesktop, rules, provider, widthRatio, opacity, recolor, color, suggestStyle, threadId, placement, load, analyze, cancel, download } = useWatermarkLab(cloud)

onMounted(() => {
  void auth.initialize().catch((reason: unknown) => {
    error.value = reason instanceof Error ? reason.message : '账号初始化失败'
  })
})

function openWorkspace(): void {
  if (artwork.value && preset.value)
    workspaceInput.value = { artwork: artwork.value, preset: preset.value, placements: placements.value.map(p => ({ ...p })), regions: regions.value.map(r => ({ ...r })) }
}
function applyWorkspace(value: PresetPlacement[]): void {
  applyWorkspaceLayout(value)
  workspaceInput.value = undefined
}
async function openWorkfile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (file && await loadWorkfile(file))
    openWorkspace()
}

function pick(event: Event, kind: 'artwork' | 'watermark'): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (file)
    void load(file, kind)
  input.value = ''
}

function drop(event: DragEvent): void {
  const file = event.dataTransfer?.files[0]
  if (file)
    void load(file, 'artwork')
}
</script>

<template>
  <main v-show="!workspaceInput" class="watermark-lab" @dragover.prevent @drop.prevent="drop">
    <header>
      <NuxtLink to="/">
        ← 返回画板
      </NuxtLink>
      <h1>水印 · 智能布局测试</h1>
      <p>识别需要避让的位置，在浏览器里叠加你的水印。原画和水印均不经过生图处理。</p>
    </header>
    <div class="watermark-lab-layout">
      <section class="watermark-controls" aria-label="水印设置">
        <button class="open-workspace" type="button" :disabled="!artwork || !preset || !placements.length || busy || loading" @click="openWorkspace">
          在 Saier 工作台编辑图层
        </button>
        <label>打开水印工作文件 <input type="file" accept="application/json,.json" :disabled="loading || busy" @change="openWorkfile"></label>
        <label>画作 <input type="file" accept="image/png,image/jpeg" :disabled="loading" @change="pick($event, 'artwork')"></label>
        <label>水印素材 <input type="file" accept="image/png,image/jpeg" :disabled="loading" @change="pick($event, 'watermark')"></label>
        <WatermarkPresetControls :preset="preset" :placements="placements" :selected="selectedPlacement" :can-add="!!artwork" :can-undo="canUndo" :can-redo="canRedo" :disabled="busy || loading" @select="selectedPlacement = $event" @undo="undo" @redo="redo" @add="addPlacement" @import="loadPreset" @toggle="toggleAsset" @update="updatePlacement" @remove="removePlacement" @export="exportPreset" />
        <label>分析方式
          <select v-model="provider">
            <option value="codex">本机 Codex 运行时</option>
            <option value="manual">仅本地合成</option>
            <option value="cloud">云乐坊 AI 点 · 多模态分析</option>
          </select>
        </label>
        <template v-if="provider === 'codex'">
          <label>本机配对码 <input v-model="pairingCode" type="password" autocomplete="off" placeholder="从本地桥接终端复制"></label>
          <p class="hint">
            发送最长边 1024px 的缩略图给本机 Codex 所用的模型服务。每次创建独立任务；暂不追加到已有聊天。
          </p>
          <label><span><input v-model="openDesktop" type="checkbox"> 完成后在 Codex 打开记录</span></label>
        </template>
        <template v-if="provider === 'cloud'">
          <p v-if="auth.isAuthenticated.value">
            {{ auth.displayName.value }} · 云乐坊账号
          </p>
          <button v-else type="button" @click="auth.signIn('interactive')">
            登录云乐坊
          </button>
          <p v-if="auth.errorMessage.value" role="alert">
            {{ auth.errorMessage.value }}
          </p>
          <p class="hint">
            发送最长边 1024px 的分析缩略图，按云乐坊 AI 点结算。停止等待后，已经发出的分析仍可能完成并计费。
          </p>
        </template>
        <template v-if="provider !== 'manual'">
          <label>避让规则 <textarea v-model="rules" rows="3" maxlength="2000" /></label>
          <button v-if="busy" type="button" @click="cancel">
            {{ provider === 'cloud' ? '停止等待' : '取消分析' }}
          </button>
          <button v-else type="button" :disabled="!artwork || loading || (provider === 'codex' && !pairingCode) || (provider === 'cloud' && (!auth.isAuthenticated.value || !presetDescriptor)) || (!!preset && !presetDescriptor)" @click="analyze">
            {{ preset ? '分析并套用整套预设' : '识别保护区域' }}
          </button>
        </template>
        <template v-if="!preset">
          <label>水印宽度 {{ Math.round(widthRatio * 100) }}% <input v-model.number="widthRatio" type="range" min="0.05" max="0.6" step="0.01"></label>
          <label>不透明度 {{ Math.round(opacity * 100) }}% <input v-model.number="opacity" type="range" min="0.05" max="1" step="0.05"></label>
          <label><span><input v-model="recolor" type="checkbox"> 单色水印换色</span></label>
          <label v-if="recolor">水印颜色 <input v-model="color" type="color"></label>
          <button type="button" :disabled="!placement" @click="suggestStyle">
            根据背景推荐颜色与透明度
          </button>
          <p class="hint">
            换色适合缎带、签名等单色线条，保留素材原有透明边缘；推荐色可继续手动调整。
          </p>
        </template>
        <p v-if="artwork && watermark && !placement" role="status">
          没有找到可用位置；请缩小水印或校正保护区域。
        </p>
        <button type="button" :disabled="!canDownload || busy || loading" @click="download">
          下载 PNG
        </button>
        <p class="hint">
          橙框不导出；整套预设会保留保护区内的原画像素，并留出安全边距。识别可能遗漏，请检查预览。
        </p>
        <p v-if="chargedMicroPoints !== undefined" role="status">
          本次消耗 {{ (chargedMicroPoints / 1000).toFixed(4) }} AI 点
        </p>
        <p v-if="operationId" class="hint">
          记录：{{ operationId }}
        </p>
        <a v-if="threadId" :href="`codex://threads/${threadId}`">尝试在 Codex 打开分析记录</a>
        <p v-if="error" role="alert">
          {{ error }}
        </p>
        <p v-for="warning in warnings" :key="warning" role="status">
          {{ warning }}
        </p>
        <ul v-if="regions.length" class="region-list" aria-label="保护区域">
          <li v-for="(region, index) in regions" :key="index">
            {{ region.label }} <button type="button" :aria-label="`移除保护区域 ${region.label}`" @click="regions = regions.filter((_, i) => i !== index)">
              移除
            </button>
          </li>
        </ul>
      </section>
      <WatermarkPreview :src="previewUrl || sourceUrl" :regions="regions" :preset="preset" :placements="placements" :image="artwork" :selected="selectedPlacement" :disabled="busy || loading" @select="selectedPlacement = $event" @update="updatePlacement" @remove="removePlacement" @undo="undo" @redo="redo" />
    </div>
  </main>
  <WatermarkWorkspace v-if="workspaceInput" :input="workspaceInput" @apply="applyWorkspace" @close="workspaceInput = undefined" />
</template>

<style scoped>
.watermark-lab {
  min-height: 100%;
  box-sizing: border-box;
  padding: 32px;
  color: var(--saier-color-text);
  background: var(--saier-color-app-background);
}
header {
  max-width: 1400px;
  margin: 0 auto 24px;
}
h1 {
  margin: 18px 0 8px;
  font-size: 26px;
}
p {
  line-height: 1.6;
}
a {
  color: var(--saier-color-accent-text);
}
.watermark-lab-layout {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  gap: 24px;
  max-width: 1400px;
  margin: auto;
  align-items: start;
}
.watermark-controls {
  display: grid;
  gap: 18px;
  padding: 20px;
  background: var(--saier-color-panel);
  border: 1px solid var(--saier-color-border);
  border-radius: 12px;
}
:deep(label) {
  display: grid;
  gap: 8px;
  font-size: 14px;
}
:deep(input),
:deep(select),
:deep(textarea),
:deep(button) {
  min-width: 0;
  max-width: 100%;
  font: inherit;
  accent-color: var(--saier-color-accent);
}
:deep(select),
:deep(textarea),
:deep(input[type='number']),
:deep(input[type='password']) {
  box-sizing: border-box;
  padding: 8px;
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-field);
  color: inherit;
}
:deep(button) {
  cursor: pointer;
  border: 1px solid var(--saier-color-accent-border);
  border-radius: 6px;
  padding: 9px;
  background: var(--saier-color-accent-soft);
  color: var(--saier-color-accent-text);
}
:deep(button:disabled) {
  cursor: default;
  opacity: 0.5;
}
:deep(.hint) {
  font-size: 12px;
  color: var(--saier-color-text-muted);
  margin: 0;
}
[role='alert'] {
  color: var(--saier-color-danger-text);
}
.region-list {
  margin: 0;
  padding-left: 18px;
  font-size: 13px;
}
.region-list :deep(button) {
  padding: 3px 8px;
  margin-left: 6px;
}
@media (max-width: 760px) {
  .watermark-lab {
    padding: 16px;
  }
  .watermark-lab-layout {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

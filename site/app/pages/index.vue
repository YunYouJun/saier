<script setup lang="ts">
import type { SaierProjectFile } from '@saier/core'
import type { SiteNewCanvasRequest, SitePainterMenuCommand, SitePainterTool } from '~/types/painter-app'
import { usePainter } from '@saier/vue/composables/usePainter'
import { computed, shallowRef, watch } from 'vue'

const {
  htmlLang,
  locale,
  nextLocaleLabel,
  setLocale,
  text,
  toggleLocale,
} = useSiteI18n()

const exportPreview = shallowRef<string>()
const newCanvasDialogOpen = shallowRef(false)
const stabilizerStrength = shallowRef(1)

const {
  activeLayerId,
  canvas: srcCanvas,
  documentActions,
  documents,
  input,
  layerActions,
  layerThumbnails,
  layers,
  memory,
  painter,
  state,
} = usePainter({
  debug: import.meta.env.DEV,
})

const showDiagnostics = import.meta.env.DEV
const pageTitle = computed(() => `${text.value.appName} - ${text.value.tagline}`)
const activeLayer = computed(() => layers.value.find(layer => layer.id === activeLayerId.value))
const activeLayerIndex = computed(() => layers.value.findIndex(layer => layer.id === activeLayerId.value))
const activeTool = computed<SitePainterTool>(() => {
  const tool = state.value?.tool
  return isSitePainterTool(tool) ? tool : 'brush'
})
const toolLabels = computed<Record<SitePainterTool, string>>(() => ({
  brush: text.value.menu.brush,
  drag: text.value.menu.pan,
  eraser: text.value.menu.eraser,
  image: text.value.menu.image,
  selection: text.value.menu.selection,
}))
const toolbarLabels = computed(() => ({
  ...text.value.menu,
  stabilizer: text.value.brushOptions.stabilizer,
}))
const canMoveLayerUp = computed(() => activeLayerIndex.value >= 0 && activeLayerIndex.value < layers.value.length - 1)
const canMoveLayerDown = computed(() => activeLayerIndex.value > 0)
const canRemoveLayer = computed(() => layers.value.length > 1 && Boolean(activeLayer.value))
const memoryStatusLabel = computed(() => {
  const snapshot = memory.value
  if (!snapshot || snapshot.riskLevel === 'normal')
    return ''

  return `${text.value.memory.status}: ~${formatBytes(snapshot.totalEstimatedBytes)}`
})
const statusLabel = computed(() => {
  if (!painter.value)
    return text.value.loading

  const toolLabel = toolLabels.value[activeTool.value]
  const layerLabel = activeLayer.value?.label ?? text.value.status.noLayer
  const parts = [
    text.value.status.ready,
    `${text.value.status.tool}: ${toolLabel}`,
    `${text.value.status.layer}: ${layerLabel}`,
  ]
  if (memoryStatusLabel.value)
    parts.push(memoryStatusLabel.value)
  return parts.join(' · ')
})

useHead(() => ({
  title: pageTitle.value,
  htmlAttrs: {
    lang: htmlLang.value,
  },
}))

watch(painter, (current) => {
  if (!current)
    return

  setStabilizerStrength(current.brush.getStabilizerStrength())
}, { immediate: true })

async function handleMenuCommand(command: SitePainterMenuCommand): Promise<void> {
  if (command.startsWith('tool:')) {
    painter.value?.useTool(command.slice(5) as SitePainterTool)
    return
  }

  switch (command) {
    case 'file:new':
      createNewCanvas()
      break
    case 'file:open-project':
      await openProject()
      break
    case 'file:save-project':
      saveProject()
      break
    case 'file:import-image':
      painter.value?.useTool('image')
      break
    case 'file:export-preview':
      await previewExport()
      break
    case 'file:download':
      await downloadCanvas()
      break
    case 'edit:undo':
      painter.value?.history.undo()
      break
    case 'edit:redo':
      painter.value?.history.redo()
      break
    case 'view:zoom-in':
      painter.value?.canvas.scaleUp()
      break
    case 'view:zoom-out':
      painter.value?.canvas.scaleDown()
      break
    case 'layer:add':
      addLayer()
      break
    case 'layer:move-up':
      moveActiveLayer(1)
      break
    case 'layer:move-down':
      moveActiveLayer(-1)
      break
    case 'layer:remove':
      removeActiveLayer()
      break
  }
}

function addLayer(): void {
  const p = painter.value
  if (!p)
    return

  p.controller.layer.add({ label: layerLabel(layers.value.length + 1) })
}

function closePreview(): void {
  exportPreview.value = undefined
}

function createNewCanvas(): void {
  closePreview()
  newCanvasDialogOpen.value = true
}

function closeNewCanvasDialog(): void {
  newCanvasDialogOpen.value = false
}

function createCanvasDocument(request: SiteNewCanvasRequest): void {
  documentActions.create({
    name: request.name,
    width: request.width,
    height: request.height,
    defaultLayerLabel: layerLabel(1),
  })
  closeNewCanvasDialog()
}

async function downloadCanvas(): Promise<void> {
  const dataUrl = await extractBase64()
  if (!dataUrl)
    return

  const link = document.createElement('a')
  link.href = dataUrl
  link.download = 'saier.png'
  link.click()
}

async function openProject(): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.saier.project.json,.json,application/json'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file)
      return

    try {
      const project = JSON.parse(await file.text()) as SaierProjectFile
      p.importProject(project, { activate: true })
    }
    catch (error) {
      console.error('Failed to import Saier project file.', error)
    }
  }
  input.click()
}

function saveProject(): void {
  const p = painter.value
  if (!p)
    return

  const project = p.exportProject()
  const blob = new Blob([JSON.stringify(project)], { type: 'application/json' })
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${safeFileName(project.metadata.name || 'saier')}.saier.project.json`
  link.click()
  URL.revokeObjectURL(link.href)
}

async function extractBase64(): Promise<string | undefined> {
  const dataUrl = await painter.value?.extractCanvas('base64')
  return typeof dataUrl === 'string' ? dataUrl : undefined
}

function layerLabel(index: number): string {
  return `${text.value.layers.defaultLayerName} ${index}`
}

function moveActiveLayer(offset: 1 | -1): void {
  const layer = activeLayer.value
  if (!layer)
    return

  const nextIndex = activeLayerIndex.value + offset
  if (nextIndex < 0 || nextIndex >= layers.value.length)
    return

  layerActions.move(layer.id, nextIndex)
}

function onExtract(dataUrl: string): void {
  exportPreview.value = dataUrl
}

async function previewExport(): Promise<void> {
  const dataUrl = await extractBase64()
  if (dataUrl)
    onExtract(dataUrl)
}

function removeActiveLayer(): void {
  const layer = activeLayer.value
  if (!layer || !canRemoveLayer.value)
    return

  layerActions.remove(layer.id)
}

function setActiveLayerVisible(visible: boolean): void {
  const layer = activeLayer.value
  if (layer)
    layerActions.setVisible(layer.id, visible)
}

function setStabilizerStrength(strength: number): void {
  const next = normalizeStabilizerStrength(strength)
  stabilizerStrength.value = next
  painter.value?.brush.setStabilizerStrength(next)
  painter.value?.eraser.setStabilizerStrength(next)
}

function switchDocument(id: string): void {
  documentActions.switch(id)
}

function closeDocument(id: string): void {
  documentActions.close(id)
}

function isSitePainterTool(tool: unknown): tool is SitePainterTool {
  return tool === 'brush'
    || tool === 'drag'
    || tool === 'eraser'
    || tool === 'image'
    || tool === 'selection'
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`

  const units = ['KiB', 'MiB', 'GiB']
  let value = bytes / 1024
  let unit = units[0]!

  for (let index = 1; index < units.length && value >= 1024; index++) {
    value /= 1024
    unit = units[index]!
  }

  return `${value >= 10 ? Math.round(value) : value.toFixed(1)} ${unit}`
}

function normalizeStabilizerStrength(strength: number): number {
  return Number.isFinite(strength) ? Math.max(0, Math.min(15, Math.round(strength))) : 0
}

function safeFileName(name: string): string {
  return name
    .trim()
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'saier'
}
</script>

<template>
  <SitePainterShell
    :app-name="text.appName"
    :close-preview-label="text.closePreview"
    :export-preview="exportPreview"
    :export-preview-label="text.exportPreview"
    :language-label="text.language"
    :loading="!painter"
    :loading-label="text.loading"
    :next-locale-label="nextLocaleLabel"
    :status-label="statusLabel"
    :tagline="text.tagline"
    @close-preview="closePreview"
    @toggle-locale="toggleLocale"
  >
    <template #menubar>
      <SitePainterMenubar
        :active-layer-visible="activeLayer?.visible ?? false"
        :active-tool="activeTool"
        :can-move-layer-down="canMoveLayerDown"
        :can-move-layer-up="canMoveLayerUp"
        :can-redo="state?.history.canRedo ?? false"
        :can-remove-layer="canRemoveLayer"
        :can-undo="state?.history.canUndo ?? false"
        :disabled="!painter"
        :has-active-layer="Boolean(activeLayer)"
        :labels="text.menu"
        :locale="locale"
        @command="handleMenuCommand"
        @set-active-layer-visible="setActiveLayerVisible"
        @set-locale="setLocale"
      />
    </template>

    <template #toolbar>
      <SitePainterToolbar
        :active-tool="activeTool"
        :can-redo="state?.history.canRedo ?? false"
        :can-undo="state?.history.canUndo ?? false"
        :disabled="!painter"
        :labels="toolbarLabels"
        :stabilizer-strength="stabilizerStrength"
        @command="handleMenuCommand"
        @update:stabilizer-strength="setStabilizerStrength"
      />
    </template>

    <template #documents>
      <SiteFileTabs
        :documents="documents"
        :disabled="!painter"
        :labels="text.documents"
        @new="createNewCanvas"
        @switch="switchDocument"
        @close="closeDocument"
      />
    </template>

    <template #canvas>
      <canvas ref="srcCanvas" />
    </template>

    <template #options>
      <PainterOptionsBar
        v-if="painter"
        :painter="painter"
        :labels="text.brushOptions"
        :stabilizer-strength="stabilizerStrength"
        @update:stabilizer-strength="setStabilizerStrength"
      />
    </template>

    <template #controls>
      <PainterControls
        v-if="painter"
        :painter="painter"
        :labels="text.controls"
        mode="palette"
        @extract="onExtract"
      />
    </template>

    <template #layers>
      <PainterLayerPanel
        v-if="painter"
        :layers="layers"
        :active-layer-id="activeLayerId"
        :thumbnails="layerThumbnails"
        :labels="text.layers"
        @add="addLayer"
        @remove="layerActions.remove"
        @move="layerActions.move"
        @select="layerActions.setActive"
        @update:visible="layerActions.setVisible"
        @update:opacity="layerActions.setOpacity"
        @update:blend-mode="layerActions.setBlendMode"
        @update:label="layerActions.setLabel"
        @update:lock-alpha="layerActions.setLockAlpha"
        @update:clip="layerActions.setClip"
      />
    </template>

    <template #diagnostics>
      <SitePainterDiagnostics
        v-if="showDiagnostics && (memory || input)"
        :memory="memory"
        :input="input"
        :labels="text.memory"
      />
    </template>
  </SitePainterShell>

  <SiteNewCanvasDialog
    :open="newCanvasDialogOpen"
    :next-index="documents.length + 1"
    :labels="text.documents"
    @close="closeNewCanvasDialog"
    @create="createCanvasDocument"
  />
</template>

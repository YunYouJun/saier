<script setup lang="ts">
import type { PainterLayerNodeState, SaierProjectFile, StrokePatch, TiledSurface, TilePatch } from '@saier/core'
import type { YunlefunCloudFile } from '~/composables/useYunlefunCloudFiles'
import type { SiteKeyboardShortcutRow, SiteNewCanvasRequest, SitePainterColorSectionId, SitePainterCommand, SitePainterFilterCommand, SitePainterMenuCommand, SitePainterPanelId, SitePainterTool } from '~/types/painter-app'
import { usePainter } from '@saier/vue/composables/usePainter'
import { computed, onMounted, reactive, shallowRef, watch } from 'vue'
import { useBeforeUnloadGuard } from '~/composables/useBeforeUnloadGuard'
import { useSitePainterShortcuts } from '~/composables/useSitePainterShortcuts'
import { useYunlefunBrushLibrary } from '~/composables/useYunlefunBrushLibrary'
import { useYunlefunCloudFiles } from '~/composables/useYunlefunCloudFiles'
import { SITE_PAINTER_COMMANDS } from '~/constants/painterCommands'

interface UnsavedChangesConfirmRequest {
  resolve: (confirmed: boolean) => void
}

const {
  htmlLang,
  locale,
  nextLocaleLabel,
  setLocale,
  text,
  toggleLocale,
} = useSiteI18n()

const exportPreview = shallowRef<string>()
const cloudSyncDialogOpen = shallowRef(false)
const lastFilterCommand = shallowRef<SitePainterFilterCommand>()
const keyboardShortcutsDialogOpen = shallowRef(false)
const newCanvasDialogOpen = shallowRef(false)
const stabilizerStrength = shallowRef(1)
const unsavedChangesConfirmRequest = shallowRef<UnsavedChangesConfirmRequest>()
const colorSectionVisibility = reactive<Record<SitePainterColorSectionId, boolean>>({
  palette: true,
  rgbSliders: true,
  wheel: true,
})
const panelVisibility = reactive<Record<SitePainterPanelId, boolean>>({
  controls: true,
  diagnostics: true,
  layers: true,
  options: true,
})

const {
  activeLayerId,
  canvas: srcCanvas,
  documentActions,
  documents,
  input,
  layerActions,
  layerThumbnails,
  layerTree,
  layers,
  memory,
  painter,
  refreshLayerThumbnails,
  refreshMemory,
  state,
} = usePainter({
  debug: import.meta.env.DEV,
})
const {
  displayName: yunlefunDisplayName,
  errorMessage: yunlefunErrorMessage,
  inNativeApp: isInYunlefunApp,
  isAuthenticated: isYunlefunAuthenticated,
  signIn: signInWithYunlefun,
  status: yunlefunStatus,
  syncSilently: syncYunlefunSilently,
} = useYunlefunAuth()
const {
  downloadProject: downloadCloudProject,
  failureMessage: cloudFileFailureMessage,
  files: cloudFiles,
  isMember: isYunlefunMember,
  maxBytes: cloudFileMaxBytes,
  quota: cloudFileQuota,
  refreshFiles: refreshCloudFiles,
  removeFile: removeCloudFile,
  status: cloudFileStatus,
  uploadProgress: cloudFileUploadProgress,
  uploadProject: uploadCloudProject,
} = useYunlefunCloudFiles()
const {
  bindPainter: bindBrushLibraryPainter,
  brushCount: brushLibraryCount,
  failureMessage: brushLibraryFailureMessage,
  lastSyncedAt: brushLibraryLastSyncedAt,
  loadLocal: loadLocalBrushLibrary,
  saveNow: saveBrushLibraryNow,
  status: brushLibraryStatus,
  syncFromCloud: syncBrushLibraryFromCloud,
} = useYunlefunBrushLibrary()

const showDiagnostics = import.meta.env.DEV
const availablePanels = computed<SitePainterPanelId[]>(() =>
  showDiagnostics
    ? ['options', 'controls', 'layers', 'diagnostics']
    : ['options', 'controls', 'layers'],
)
const pageTitle = computed(() => `${text.value.appName} - ${text.value.tagline}`)
const activeLayer = computed(() => layers.value.find(layer => layer.id === activeLayerId.value))
const activeLayerIndex = computed(() => layers.value.findIndex(layer => layer.id === activeLayerId.value))
const canApplyFilter = computed(() => Boolean(activeLayer.value && painter.value && isTiledSurfaceAccessBackend(painter.value.surface)))
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
const panelLabels = computed<Record<SitePainterPanelId, string>>(() => ({
  controls: text.value.menu.operationPanel,
  diagnostics: text.value.menu.diagnosticsPanel,
  layers: text.value.menu.layerPanel,
  options: text.value.menu.brushOptionsPanel,
}))
const panelActionLabels = computed(() => ({
  collapse: text.value.menu.collapsePanel,
  detach: text.value.menu.detachPanel,
  expand: text.value.menu.expandPanel,
  hide: text.value.menu.hidePanel,
}))
const canMoveLayerUp = computed(() => activeLayerIndex.value >= 0 && activeLayerIndex.value < layers.value.length - 1)
const canMoveLayerDown = computed(() => activeLayerIndex.value > 0)
const canRemoveLayer = computed(() => layers.value.length > 1 && Boolean(activeLayer.value))
const hasUnsavedChanges = computed(() => documents.value.some(document => document.dirty))
const unsavedChangesDialogOpen = computed(() => Boolean(unsavedChangesConfirmRequest.value))
const shortcutsDisabled = computed(() =>
  cloudSyncDialogOpen.value || keyboardShortcutsDialogOpen.value || newCanvasDialogOpen.value || unsavedChangesDialogOpen.value,
)
const {
  formatCommandShortcuts,
  resetShortcuts,
} = useSitePainterShortcuts({
  disabled: shortcutsDisabled,
  canRunCommand,
  runCommand: handleMenuCommand,
})
const menuShortcutLabels = computed<Partial<Record<SitePainterCommand, string>>>(() => {
  const labels: Partial<Record<SitePainterCommand, string>> = {}

  for (const definition of SITE_PAINTER_COMMANDS) {
    const shortcut = formatCommandShortcuts(definition.id)
    if (shortcut)
      labels[definition.id] = shortcut
  }

  return labels
})
const shortcutRows = computed<SiteKeyboardShortcutRow[]>(() =>
  SITE_PAINTER_COMMANDS.map(definition => ({
    id: definition.id,
    category: definition.category,
    categoryLabel: text.value.shortcuts.categories[definition.category],
    label: text.value.shortcuts.commands[definition.id],
    shortcutLabel: formatCommandShortcuts(definition.id, text.value.shortcuts.unassigned),
  })),
)
const memoryStatusLabel = computed(() => {
  const snapshot = memory.value
  if (!snapshot || snapshot.riskLevel === 'normal')
    return ''

  return `${text.value.memory.status}: ~${formatBytes(snapshot.totalEstimatedBytes)}`
})
const yunlefunAccountLoading = computed(() =>
  yunlefunStatus.value === 'checking' || yunlefunStatus.value === 'signing-in',
)
const cloudFileErrorMessage = computed(() => cloudFileFailureMessage(text.value.cloudFiles))
const brushLibraryErrorMessage = computed(() => brushLibraryFailureMessage(text.value.cloudFiles))
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

useBeforeUnloadGuard(hasUnsavedChanges)

watch(painter, (current) => {
  bindBrushLibraryPainter(current)
  if (!current)
    return

  setStabilizerStrength(current.brush.getStabilizerStrength())
  syncBrushLibraryForCurrentAccount(current)
}, { immediate: true })

watch(isYunlefunAuthenticated, () => {
  syncBrushLibraryForCurrentAccount()
})

onMounted(() => {
  void syncYunlefunSilently()
})

async function handleMenuCommand(command: SitePainterMenuCommand): Promise<void> {
  if (command.startsWith('tool:')) {
    painter.value?.useTool(command.slice(5) as SitePainterTool)
    return
  }

  switch (command) {
    case 'app:keyboard-shortcuts':
      openKeyboardShortcutsDialog()
      break
    case 'brush:size-down':
      painter.value?.brushSizeDown()
      break
    case 'brush:size-up':
      painter.value?.brushSizeUp()
      break
    case 'file:new':
      createNewCanvas()
      break
    case 'file:open-project':
      await openProject()
      break
    case 'file:save-project':
      saveProject()
      break
    case 'file:cloud-sync':
      openCloudSyncDialog()
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
    case 'view:reset':
      painter.value?.board.resetToCenter()
      break
    case 'selection:cancel':
      painter.value?.cancelSelection()
      break
    case 'filter:repeat':
      await repeatFilter()
      break
    case 'filter:grayscale':
    case 'filter:invert':
      await applyLayerFilter(command)
      break
    case 'layer:add':
      addLayer()
      break
    case 'layer:add-group':
      addGroup()
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

async function loginWithYunlefun(): Promise<void> {
  await signInWithYunlefun('interactive')
}

async function loginWithYunlefunForCloudSync(): Promise<void> {
  const ok = await signInWithYunlefun('interactive')
  if (ok) {
    await refreshCloudFiles()
    await syncBrushLibraryForCurrentAccount()
  }
}

interface LayerCreateTarget {
  parentId?: string | null
  index?: number
}

function addLayer(options: LayerCreateTarget = {}): void {
  const p = painter.value
  if (!p)
    return

  p.controller.layer.add({
    ...options,
    label: layerLabel(layers.value.length + 1),
  })
}

function addGroup(options: LayerCreateTarget = {}): void {
  const p = painter.value
  if (!p)
    return

  p.controller.layer.addGroup({
    ...options,
    label: `${text.value.layers.defaultGroupName} ${countGroups(layerTree.value) + 1}`,
  })
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

async function clearActiveCanvas(): Promise<void> {
  const p = painter.value
  if (!p || !await confirmDiscardUnsavedDocument())
    return

  p.clearCanvas()
}

function openCloudSyncDialog(): void {
  cloudSyncDialogOpen.value = true
  if (isYunlefunAuthenticated.value)
    void refreshCloudFiles()
}

function closeCloudSyncDialog(): void {
  cloudSyncDialogOpen.value = false
}

async function syncBrushLibraryForCurrentAccount(current = painter.value): Promise<void> {
  if (!current)
    return
  if (isYunlefunAuthenticated.value) {
    const result = await syncBrushLibraryFromCloud(current)
    if (result.ok)
      await refreshCloudFiles()
  }
  else {
    loadLocalBrushLibrary(current)
  }
}

async function syncBrushLibraryNow(): Promise<void> {
  const current = painter.value
  if (!current)
    return
  if (!isYunlefunAuthenticated.value) {
    await loginWithYunlefunForCloudSync()
    return
  }
  await saveBrushLibraryNow(current)
  await syncBrushLibraryForCurrentAccount(current)
}

function openKeyboardShortcutsDialog(): void {
  keyboardShortcutsDialogOpen.value = true
}

function closeKeyboardShortcutsDialog(): void {
  keyboardShortcutsDialogOpen.value = false
}

function resetKeyboardShortcuts(): void {
  resetShortcuts()
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
  link.download = `${safeFileName(projectFileName(project))}.saier.project.json`
  link.click()
  URL.revokeObjectURL(link.href)
  p.markDocumentSaved()
}

async function uploadCurrentProjectToCloud(): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const project = p.exportProject()
  const result = await uploadCloudProject(project, {
    name: projectFileName(project),
  })
  if (result.ok)
    p.markDocumentSaved()
}

async function loadCloudProject(file: YunlefunCloudFile): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const result = await downloadCloudProject(file)
  if (!result.ok || !result.project)
    return

  p.importProject(result.project, { activate: true })
  closeCloudSyncDialog()
}

async function deleteCloudProject(file: YunlefunCloudFile): Promise<void> {
  await removeCloudFile(file)
}

async function extractBase64(): Promise<string | undefined> {
  const dataUrl = await painter.value?.extractCanvas('base64', { mode: 'preview' })
  return typeof dataUrl === 'string' ? dataUrl : undefined
}

function layerLabel(index: number): string {
  return `${text.value.layers.defaultLayerName} ${index}`
}

function countGroups(nodes: readonly PainterLayerNodeState[]): number {
  let count = 0
  for (const node of nodes) {
    if (node.type !== 'group')
      continue
    count += 1 + countGroups(node.children)
  }
  return count
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

async function applyLayerFilter(command: SitePainterFilterCommand): Promise<void> {
  const p = painter.value
  const layerId = activeLayerId.value
  if (!p || !layerId || !isTiledSurfaceAccessBackend(p.surface))
    return

  const surface = p.surface.getSurface(layerId)
  const patch = createLayerFilterPatch(layerId, surface, command)
  if (!patch)
    return

  p.recordStrokePatch(patch)
  p.flushSurfaceUploads()
  lastFilterCommand.value = command
  await Promise.all([
    refreshLayerThumbnails(),
    refreshMemory(),
  ])
}

async function previewExport(): Promise<void> {
  const dataUrl = await extractBase64()
  if (dataUrl)
    onExtract(dataUrl)
}

async function repeatFilter(): Promise<void> {
  const command = lastFilterCommand.value
  if (command)
    await applyLayerFilter(command)
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

function setColorSectionVisible(sectionId: SitePainterColorSectionId, visible: boolean): void {
  colorSectionVisibility[sectionId] = visible
}

function setPanelVisible(panelId: SitePainterPanelId, visible: boolean): void {
  panelVisibility[panelId] = visible
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

async function closeDocument(id: string): Promise<void> {
  if (!await confirmDiscardUnsavedDocument(id))
    return

  documentActions.close(id)
}

async function confirmDiscardUnsavedDocument(id?: string): Promise<boolean> {
  const document = id
    ? documents.value.find(item => item.id === id)
    : documents.value.find(item => item.active)
  if (!document?.dirty)
    return true

  return requestUnsavedChangesConfirmation()
}

function requestUnsavedChangesConfirmation(): Promise<boolean> {
  if (unsavedChangesConfirmRequest.value)
    return Promise.resolve(false)

  return new Promise((resolve) => {
    unsavedChangesConfirmRequest.value = { resolve }
  })
}

function resolveUnsavedChangesConfirmation(confirmed: boolean): void {
  const request = unsavedChangesConfirmRequest.value
  unsavedChangesConfirmRequest.value = undefined
  request?.resolve(confirmed)
}

function canRunCommand(command: SitePainterCommand): boolean {
  if (command === 'app:keyboard-shortcuts')
    return true
  if (!painter.value)
    return false
  if (command.startsWith('tool:'))
    return true

  switch (command) {
    case 'edit:undo':
      return state.value?.history.canUndo ?? false
    case 'edit:redo':
      return state.value?.history.canRedo ?? false
    case 'filter:repeat':
      return canApplyFilter.value && Boolean(lastFilterCommand.value)
    case 'filter:grayscale':
    case 'filter:invert':
      return canApplyFilter.value
    case 'layer:move-up':
      return canMoveLayerUp.value
    case 'layer:move-down':
      return canMoveLayerDown.value
    case 'layer:remove':
      return canRemoveLayer.value
    default:
      return true
  }
}

function createLayerFilterPatch(layerId: string, surface: TiledSurface, command: SitePainterFilterCommand): StrokePatch | undefined {
  const tilePatches: TilePatch[] = []
  let rect = emptyRect()

  for (const tile of surface.allocatedTiles) {
    const before = tile.cloneData()
    const after = new Uint8ClampedArray(before)
    const changed = command === 'filter:invert'
      ? invertPixels(after)
      : grayscalePixels(after)

    if (!changed || samePixels(before, after))
      continue

    surface.writeTileData(tile.tileX, tile.tileY, after)
    rect = unionRects(rect, surface.tileRect(tile.tileX, tile.tileY))
    tilePatches.push({
      layerId,
      tileX: tile.tileX,
      tileY: tile.tileY,
      before: new Uint8Array(before),
      after: new Uint8Array(after),
    })
  }

  if (tilePatches.length === 0)
    return undefined

  return {
    layerId,
    rect,
    before: tilePatches,
    after: tilePatches,
  }
}

function emptyRect(): StrokePatch['rect'] {
  return { x: 0, y: 0, width: 0, height: 0 }
}

function grayscalePixels(pixels: Uint8ClampedArray): boolean {
  let changed = false
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0)
      continue

    const gray = Math.round(
      pixels[offset]! * 0.299
      + pixels[offset + 1]! * 0.587
      + pixels[offset + 2]! * 0.114,
    )
    if (pixels[offset] === gray && pixels[offset + 1] === gray && pixels[offset + 2] === gray)
      continue

    pixels[offset] = gray
    pixels[offset + 1] = gray
    pixels[offset + 2] = gray
    changed = true
  }
  return changed
}

function invertPixels(pixels: Uint8ClampedArray): boolean {
  let changed = false
  for (let offset = 0; offset < pixels.length; offset += 4) {
    if (pixels[offset + 3] === 0)
      continue

    pixels[offset] = 255 - pixels[offset]!
    pixels[offset + 1] = 255 - pixels[offset + 1]!
    pixels[offset + 2] = 255 - pixels[offset + 2]!
    changed = true
  }
  return changed
}

function isEmptyRect(rect: StrokePatch['rect']): boolean {
  return rect.width <= 0 || rect.height <= 0
}

function isTiledSurfaceAccessBackend(surface: unknown): surface is { getSurface: (layerId: string) => TiledSurface } {
  return typeof surface === 'object'
    && surface !== null
    && 'getSurface' in surface
    && typeof surface.getSurface === 'function'
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

function samePixels(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length)
    return false

  for (let index = 0; index < a.length; index++) {
    if (a[index] !== b[index])
      return false
  }
  return true
}

function unionRects(a: StrokePatch['rect'], b: StrokePatch['rect']): StrokePatch['rect'] {
  if (isEmptyRect(a))
    return isEmptyRect(b) ? emptyRect() : { ...b }
  if (isEmptyRect(b))
    return { ...a }

  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const right = Math.max(a.x + a.width, b.x + b.width)
  const bottom = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: right - x, height: bottom - y }
}

function projectFileName(project: SaierProjectFile): string {
  return typeof project.metadata?.name === 'string' && project.metadata.name.trim()
    ? project.metadata.name
    : 'saier'
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
    :available-panels="availablePanels"
    :close-preview-label="text.closePreview"
    :export-preview="exportPreview"
    :export-preview-label="text.exportPreview"
    :language-label="text.language"
    :loading="!painter"
    :loading-label="text.loading"
    :next-locale-label="nextLocaleLabel"
    :panel-action-labels="panelActionLabels"
    :panel-labels="panelLabels"
    :panel-visibility="panelVisibility"
    :status-label="statusLabel"
    :tagline="text.tagline"
    @close-preview="closePreview"
    @set-panel-visible="setPanelVisible"
    @toggle-locale="toggleLocale"
  >
    <template #account>
      <SiteAccountButton
        :display-name="yunlefunDisplayName"
        :error-message="yunlefunErrorMessage"
        :is-authenticated="isYunlefunAuthenticated"
        :is-in-native-app="isInYunlefunApp"
        :labels="text.account"
        :loading="yunlefunAccountLoading"
        settings-href="https://yunle.fun/settings"
        @login="loginWithYunlefun"
      />
    </template>

    <template #menubar>
      <SitePainterMenubar
        :active-layer-visible="activeLayer?.visible ?? false"
        :active-tool="activeTool"
        :available-panels="availablePanels"
        :can-apply-filter="canApplyFilter"
        :can-move-layer-down="canMoveLayerDown"
        :can-move-layer-up="canMoveLayerUp"
        :can-redo="state?.history.canRedo ?? false"
        :can-remove-layer="canRemoveLayer"
        :can-repeat-filter="Boolean(lastFilterCommand)"
        :can-undo="state?.history.canUndo ?? false"
        :color-section-visibility="colorSectionVisibility"
        :disabled="!painter"
        :has-active-layer="Boolean(activeLayer)"
        :labels="text.menu"
        :locale="locale"
        :panel-visibility="panelVisibility"
        :shortcuts="menuShortcutLabels"
        @command="handleMenuCommand"
        @set-active-layer-visible="setActiveLayerVisible"
        @set-color-section-visible="setColorSectionVisible"
        @set-locale="setLocale"
        @set-panel-visible="setPanelVisible"
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
        v-if="painter && panelVisibility.options"
        :painter="painter"
        :labels="text.brushOptions"
        :stabilizer-strength="stabilizerStrength"
        @update:stabilizer-strength="setStabilizerStrength"
      />
    </template>

    <template #controls>
      <PainterControls
        v-if="painter && panelVisibility.controls"
        color-panel-mode="inline"
        :color-sections="colorSectionVisibility"
        guard-clear
        :painter="painter"
        :labels="text.controls"
        mode="palette"
        @clear="clearActiveCanvas"
        @extract="onExtract"
      />
    </template>

    <template #layers>
      <PainterLayerPanel
        v-if="painter && panelVisibility.layers"
        :layers="layers"
        :layer-tree="layerTree"
        :active-layer-id="activeLayerId"
        :thumbnails="layerThumbnails"
        :labels="text.layers"
        @add="addLayer"
        @add-group="addGroup"
        @remove="layerActions.remove"
        @move="layerActions.move"
        @move-node="layerActions.moveNode"
        @select="layerActions.setActive"
        @ungroup="layerActions.ungroup"
        @update:visible="layerActions.setVisible"
        @update:opacity="layerActions.setOpacity"
        @update:blend-mode="layerActions.setBlendMode"
        @update:label="layerActions.setLabel"
        @update:lock-alpha="layerActions.setLockAlpha"
        @update:clip="layerActions.setClip"
        @update:group-collapsed="layerActions.setGroupCollapsed"
      />
    </template>

    <template #diagnostics>
      <SitePainterDiagnostics
        v-if="showDiagnostics && panelVisibility.diagnostics && (memory || input)"
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

  <SiteConfirmDialog
    :open="unsavedChangesDialogOpen"
    :title="text.documents.unsavedChangesTitle"
    :message="text.documents.unsavedChangesConfirm"
    :cancel-label="text.documents.cancel"
    :confirm-label="text.documents.discardChanges"
    @cancel="resolveUnsavedChangesConfirmation(false)"
    @confirm="resolveUnsavedChangesConfirmation(true)"
  />

  <SiteKeyboardShortcutsDialog
    :open="keyboardShortcutsDialogOpen"
    :labels="text.shortcuts"
    :rows="shortcutRows"
    @close="closeKeyboardShortcutsDialog"
    @reset-defaults="resetKeyboardShortcuts"
  />

  <SiteCloudSyncDialog
    :brush-library-count="brushLibraryCount"
    :brush-library-error-message="brushLibraryErrorMessage"
    :brush-library-last-synced-at="brushLibraryLastSyncedAt"
    :brush-library-status="brushLibraryStatus"
    :error-message="cloudFileErrorMessage"
    :files="cloudFiles"
    :is-authenticated="isYunlefunAuthenticated"
    :is-member="isYunlefunMember"
    :labels="text.cloudFiles"
    :max-bytes="cloudFileMaxBytes"
    :open="cloudSyncDialogOpen"
    :quota="cloudFileQuota"
    :status="cloudFileStatus"
    :upload-progress="cloudFileUploadProgress"
    @close="closeCloudSyncDialog"
    @load-file="loadCloudProject"
    @login="loginWithYunlefunForCloudSync"
    @refresh="refreshCloudFiles"
    @remove-file="deleteCloudProject"
    @sync-brush-library="syncBrushLibraryNow"
    @upload-current="uploadCurrentProjectToCloud"
  />
</template>

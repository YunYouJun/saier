<script setup lang="ts">
import type { PainterLayerNodeState, SaierProjectFile, SaierStrokeCommit, SaierStrokeLog, StrokePatch, TiledSurface, TilePatch } from '@saier/core'
import type { Painter } from 'saier'
import type { YunlefunCloudFile } from '~/composables/useYunlefunCloudFiles'
import type { SiteKeyboardShortcutRow, SiteNewCanvasRequest, SitePainterColorSectionId, SitePainterCommand, SitePainterFilterCommand, SitePainterMenuCommand, SitePainterPanelId, SitePainterTool } from '~/types/painter-app'
import type { SitePainterShellMode } from '~/types/painter-shell'
import type { SaierProjectDraftFile } from '~/utils/projectDraft'
import { usePainter } from '@saier/vue/composables/usePainter'
import { computed, onBeforeUnmount, onMounted, reactive, shallowRef, watch } from 'vue'
import SiteDesktopPainterShell from '~/components/SiteDesktopPainterShell.vue'
import SiteMobilePainterShell from '~/components/SiteMobilePainterShell.vue'
import { useBeforeUnloadGuard } from '~/composables/useBeforeUnloadGuard'
import { useSitePlatformAdapter } from '~/composables/useSitePlatformAdapter'
import { useSitePainterShellMode } from '~/composables/useSitePainterShellMode'
import { useSitePainterShortcuts } from '~/composables/useSitePainterShortcuts'
import {
  createCloudRoomAddLayerArgs,
  createCloudRoomLayerBooleanArgs,
  createCloudRoomLayerValueArgs,
  createCloudRoomMoveNodeArgs,
  useSiteCloudRoomCollaboration,
} from '~/composables/useSiteCloudRoomCollaboration'
import { useYunlefunBrushLibrary } from '~/composables/useYunlefunBrushLibrary'
import { useYunlefunCloudFiles } from '~/composables/useYunlefunCloudFiles'
import { parseCloudRoomLink, useYunlefunCloudRooms } from '~/composables/useYunlefunCloudRooms'
import { SITE_PAINTER_COMMANDS } from '~/constants/painterCommands'
import {
  isBrushPresetImportError,
  parseBrushPresetImportText,
} from '~/utils/brushImport'
import { createCloudRoomClientOperationId } from '~/utils/cloudRoomOperations'
import {
  clearProjectDraft,
  createProjectDraft,
  readProjectDraft,
  writeProjectDraft,
} from '~/utils/projectDraft'

interface UnsavedChangesConfirmRequest {
  resolve: (confirmed: boolean) => void
}

interface SiteNoticeItem {
  id: number
  type: 'error' | 'warning' | 'info'
  title: string
  message?: string
}

type ProjectImportFailureReason = 'read-failed' | 'invalid-json' | 'invalid-project'
type UnavailableBrushPresetReason = 'missing-engine' | 'missing-surface-sampler'

interface UnavailableBrushPresetPayload {
  presetId: string
  presetName: string
  reason: UnavailableBrushPresetReason
  message: string
}

interface SiteCloudRoomE2eDabOptions {
  a?: number
  b?: number
  g?: number
  hardness?: number
  opacity?: number
  r?: number
  radius?: number
  x?: number
  y?: number
}

interface SiteCloudRoomE2eLayerState {
  id: string
  label: string
  visible: boolean
}

interface SiteCloudRoomE2eNoticeState {
  message?: string
  title: string
  type: SiteNoticeItem['type']
}

interface SiteCloudRoomE2eState {
  activeLayerId?: string
  canvasHash: string
  headRevision: number
  layers: SiteCloudRoomE2eLayerState[]
  latestSnapshotRevision: number
  notices: SiteCloudRoomE2eNoticeState[]
  readOnly: boolean
  role?: string
  roomId?: string
}

interface SiteCloudRoomE2eBridge {
  addLayer: (id: string) => Promise<SiteCloudRoomE2eState>
  drawDab: (options?: SiteCloudRoomE2eDabOptions) => Promise<SiteCloudRoomE2eState>
  state: () => Promise<SiteCloudRoomE2eState>
  syncNow: () => Promise<SiteCloudRoomE2eState>
  tryReadOnlyAddLayer: (id: string) => Promise<SiteCloudRoomE2eState>
}

const {
  currentLocaleOption,
  htmlLang,
  locale,
  localeOptions,
  setLocale,
  text,
} = useSiteI18n()
const platformAdapter = useSitePlatformAdapter()

const exportPreview = shallowRef<string>()
const cloudRoomDialogOpen = shallowRef(false)
const cloudSyncDialogOpen = shallowRef(false)
const lastFilterCommand = shallowRef<SitePainterFilterCommand>()
const keyboardShortcutsDialogOpen = shallowRef(false)
const newCanvasDialogOpen = shallowRef(false)
const projectDraftRecovery = shallowRef<SaierProjectDraftFile>()
const pendingCloudRoomLink = shallowRef('')
const siteNotices = shallowRef<SiteNoticeItem[]>([])
const stabilizerStrength = shallowRef(1)
const strokeReplayPlaying = shallowRef(false)
const strokeReplayPosition = shallowRef(0)
const strokeReplaySpeed = shallowRef(1)
const strokeRecordingCount = shallowRef(0)
const strokeRecordingEnabled = shallowRef(false)
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
  navigator: true,
  options: true,
})

const PROJECT_DRAFT_SAVE_DEBOUNCE_MS = 1200

const {
  activeLayerId,
  canvas: srcCanvas,
  documentActions,
  documents,
  input,
  layerActions,
  layerMaskThumbnails,
  layerThumbnails,
  layerTree,
  layers,
  memory,
  navigatorActions,
  navigatorThumbnail,
  paintTarget,
  painter,
  refreshLayerThumbnails,
  refreshMemory,
  state,
  viewport,
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
  renameFile: renameCloudFile,
  status: cloudFileStatus,
  uploadProgress: cloudFileUploadProgress,
  uploadProject: uploadCloudProject,
} = useYunlefunCloudFiles()
const {
  appendOperation: appendCloudRoomOperation,
  createCheckpointSnapshot: createCloudRoomCheckpointSnapshot,
  createRoom: createCloudRoom,
  failureMessage: cloudRoomFailureMessage,
  isReadOnly: isCloudRoomReadOnly,
  joinRoom: joinCloudRoomSnapshot,
  leaveRoom: leaveCloudRoomSession,
  listOperations: listCloudRoomOperations,
  session: cloudRoomSession,
  shareUrl: cloudRoomShareUrl,
  status: cloudRoomStatus,
  updatePresence: updateCloudRoomPresence,
  uploadProgress: cloudRoomUploadProgress,
} = useYunlefunCloudRooms()
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
const {
  canSubmit: canSubmitCloudRoomOperation,
  submitDocumentCommand: submitCloudRoomDocumentCommand,
  submitLayerCommand: submitCloudRoomLayerCommand,
  syncNow: syncCloudRoomOperations,
} = useSiteCloudRoomCollaboration({
  appendOperation: appendCloudRoomOperation,
  createSnapshot: createCloudRoomCheckpointSnapshot,
  createPresence: createCloudRoomPresence,
  listOperations: listCloudRoomOperations,
  onError: showCloudRoomOperationFailure,
  onSnapshotRequired: restoreCloudRoomSnapshot,
  painter,
  refreshLayerThumbnails,
  refreshMemory,
  refreshNavigatorThumbnail: navigatorActions.refreshThumbnail,
  session: cloudRoomSession,
  updatePresence: updateCloudRoomPresence,
})

const showDiagnostics = import.meta.env.DEV
const availablePanels = computed<SitePainterPanelId[]>(() =>
  showDiagnostics
    ? ['options', 'controls', 'layers', 'navigator', 'diagnostics']
    : ['options', 'controls', 'layers', 'navigator'],
)
const { mode: painterShellMode } = useSitePainterShellMode()
const painterShellComponents = {
  desktop: SiteDesktopPainterShell,
  mobile: SiteMobilePainterShell,
} satisfies Record<SitePainterShellMode, typeof SiteDesktopPainterShell | typeof SiteMobilePainterShell>
const painterShellComponent = computed(() => painterShellComponents[painterShellMode.value])
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
  navigator: text.value.menu.navigatorPanel,
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
const canReplayStrokeRecording = computed(() => Boolean(painter.value) && strokeRecordingCount.value > 0)
const hasUnsavedChanges = computed(() => documents.value.some(document => document.dirty))
const projectDraftRecoveryOpen = computed(() => Boolean(projectDraftRecovery.value))
const projectDraftRecoveryMeta = computed(() => {
  const draft = projectDraftRecovery.value
  if (!draft)
    return undefined

  return {
    name: projectDraftName(draft),
    size: `${draft.project.width} x ${draft.project.height}`,
    updatedAt: formatDraftUpdatedAt(draft.updatedAt),
  }
})
const unsavedChangesDialogOpen = computed(() => Boolean(unsavedChangesConfirmRequest.value))
const shortcutsDisabled = computed(() =>
  cloudSyncDialogOpen.value
  || cloudRoomDialogOpen.value
  || keyboardShortcutsDialogOpen.value
  || newCanvasDialogOpen.value
  || projectDraftRecoveryOpen.value
  || unsavedChangesDialogOpen.value,
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
const cloudRoomErrorMessage = computed(() => cloudRoomFailureMessage(text.value.cloudRooms))
const cloudRoomDefaultTitle = computed(() => {
  const p = painter.value
  return p ? projectFileName(p.exportProject()) : text.value.appName
})
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
  if (cloudRoomSession.value) {
    parts.push(cloudRoomSession.value.readOnly
      ? text.value.cloudRooms.readOnly
      : text.value.cloudRooms.status)
  }
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

useBeforeUnloadGuard(hasUnsavedChanges, {
  lifecycle: platformAdapter.lifecycle,
  onBeforeUnload: () => {
    const current = painter.value
    if (current)
      void saveProjectDraftNow(current)
  },
})

let projectDraftSaveTimer: ReturnType<typeof setTimeout> | undefined
let projectDraftStorageQueue = Promise.resolve()
let removeProjectDraftListeners: (() => void) | undefined
let removeStrokeRecordingListeners: (() => void) | undefined
let restoringProjectDraft = false
let strokeReplayTimer: ReturnType<typeof setTimeout> | undefined
let siteNoticeId = 0

watch(painter, (current) => {
  bindBrushLibraryPainter(current)
  bindProjectDraftAutosave(current)
  bindStrokeRecordingState(current)
  if (!current)
    return

  void detectLocalProjectDraft(current)
  setStabilizerStrength(current.brush.getStabilizerStrength())
  syncBrushLibraryForCurrentAccount(current)
}, { immediate: true })

watch(isYunlefunAuthenticated, () => {
  syncBrushLibraryForCurrentAccount()
})

watch(isCloudRoomReadOnly, (readOnly) => {
  if (readOnly)
    painter.value?.useTool('drag')
})

onMounted(() => {
  void syncYunlefunSilently()
  void detectCloudRoomLink()
})

onBeforeUnmount(() => {
  removeProjectDraftListeners?.()
  removeProjectDraftListeners = undefined
  removeStrokeRecordingListeners?.()
  removeStrokeRecordingListeners = undefined
  if (projectDraftSaveTimer) {
    clearTimeout(projectDraftSaveTimer)
    projectDraftSaveTimer = undefined
  }
  stopStrokeReplay()
})

async function handleMenuCommand(command: SitePainterMenuCommand): Promise<void> {
  if (isCloudRoomReadOnly.value && isRoomWriteCommand(command)) {
    showCloudRoomReadOnlyNotice()
    return
  }

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
      await saveProject()
      break
    case 'file:cloud-sync':
      openCloudSyncDialog()
      break
    case 'file:cloud-room':
      openCloudRoomDialog()
      break
    case 'file:import-image':
      painter.value?.useTool('image')
      break
    case 'file:import-brush':
      await importBrushPreset()
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
      painter.value?.zoomIn()
      break
    case 'view:zoom-out':
      painter.value?.zoomOut()
      break
    case 'view:reset':
      painter.value?.resetViewport()
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
    case 'recording:toggle':
      toggleStrokeRecording()
      break
    case 'recording:replay-last':
      await replayLastRecordedStroke()
      break
    case 'recording:clear':
      clearStrokeRecording()
      break
    case 'recording:export-log':
      await exportStrokeLog()
      break
    case 'recording:import-log':
      await importStrokeLog()
      break
    case 'recording:play':
      startStrokeReplay()
      break
    case 'recording:pause':
      stopStrokeReplay()
      break
    case 'recording:seek-start':
      seekStrokeReplay(0)
      break
    case 'recording:step-forward':
      await replayNextRecordedStroke()
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

async function loginWithYunlefunForCloudRoom(): Promise<void> {
  const ok = await signInWithYunlefun('interactive')
  if (ok && pendingCloudRoomLink.value)
    await joinCloudRoom(pendingCloudRoomLink.value)
}

async function detectCloudRoomLink(): Promise<void> {
  if (!import.meta.client)
    return

  const href = window.location.href
  if (!parseCloudRoomLink(href))
    return

  pendingCloudRoomLink.value = href
  cloudRoomDialogOpen.value = true
  if (isYunlefunAuthenticated.value)
    await joinCloudRoom(href)
}

function openCloudRoomDialog(): void {
  cloudRoomDialogOpen.value = true
}

function closeCloudRoomDialog(): void {
  cloudRoomDialogOpen.value = false
}

async function createCloudRoomFromCurrent(title: string): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const result = await createCloudRoom(p.exportProject(), {
    title,
    visibility: 'link',
  })
  if (!result.ok)
    return

  showSiteNotice('info', text.value.cloudRooms.status, result.session?.room.title)
}

async function joinCloudRoom(link: string): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const result = await joinCloudRoomSnapshot(link)
  if (!result.ok || !result.project)
    return

  try {
    p.importProject(result.project, { activate: true })
    p.markDocumentSaved()
    p.useTool('drag')
    pendingCloudRoomLink.value = ''
    await syncCloudRoomOperations()
  }
  catch (error) {
    console.error('Failed to import cloud room snapshot.', error)
    showProjectImportFailure('invalid-project')
  }
}

async function restoreCloudRoomSnapshot(project: SaierProjectFile, revision: number): Promise<void> {
  const p = painter.value
  if (!p)
    return

  try {
    p.importProject(project, { activate: true })
    p.markDocumentSaved()
    p.useTool('drag')
    await Promise.all([
      refreshLayerThumbnails(),
      refreshMemory(),
      navigatorActions.refreshThumbnail(),
    ])
    showSiteNotice('info', text.value.cloudRooms.status, `Snapshot r${revision}`)
  }
  catch (error) {
    console.error('Failed to restore cloud room snapshot.', error)
    showProjectImportFailure('invalid-project')
  }
}

function createCloudRoomPresence(): Record<string, unknown> {
  return {
    activeDocumentId: painter.value?.getActiveDocumentId(),
    activeLayerId: activeLayerId.value,
    tool: activeTool.value,
  }
}

async function shareCloudRoom(): Promise<void> {
  const url = cloudRoomShareUrl.value
  if (!url)
    return

  try {
    const shared = await platformAdapter.share({
      title: text.value.cloudRooms.shareTitle,
      url,
    })
    if (shared)
      return

    await copyCloudRoomLink(url)
  }
  catch (error) {
    console.error('Failed to share cloud room link.', error)
    showSiteNotice('error', text.value.cloudRooms.errorTitle, text.value.cloudRooms.shareFailed)
  }
}

function leaveCloudRoom(): void {
  leaveCloudRoomSession()
  pendingCloudRoomLink.value = ''
}

async function copyCloudRoomLink(url: string): Promise<void> {
  if (!import.meta.client || !navigator.clipboard) {
    showSiteNotice('error', text.value.cloudRooms.errorTitle, text.value.cloudRooms.copyFailed)
    return
  }

  await navigator.clipboard.writeText(url)
  showSiteNotice('info', text.value.cloudRooms.copySucceeded)
}

interface LayerCreateTarget {
  id?: string
  parentId?: string | null
  index?: number
}

function addLayer(options: LayerCreateTarget = {}): void {
  if (!ensureCloudRoomCanEdit())
    return

  const p = painter.value
  if (!p)
    return

  const addOptions = {
    ...options,
    id: options.id ?? (canSubmitCloudRoomOperation.value ? createCloudRoomClientOperationId('layer') : undefined),
    label: layerLabel(layers.value.length + 1),
  }
  p.controller.layer.add(addOptions)
  if (addOptions.id) {
    void submitCloudRoomLayerCommand({
      args: createCloudRoomAddLayerArgs({
        id: addOptions.id,
        index: addOptions.index,
        label: addOptions.label,
        parentId: addOptions.parentId,
      }),
      command: 'add',
    })
  }
}

function addGroup(options: LayerCreateTarget = {}): void {
  if (!ensureCloudRoomCanEdit())
    return

  const p = painter.value
  if (!p)
    return

  const addOptions = {
    ...options,
    id: options.id ?? (canSubmitCloudRoomOperation.value ? createCloudRoomClientOperationId('group') : undefined),
    label: `${text.value.layers.defaultGroupName} ${countGroups(layerTree.value) + 1}`,
  }
  p.controller.layer.addGroup(addOptions)
  if (addOptions.id) {
    void submitCloudRoomLayerCommand({
      args: createCloudRoomAddLayerArgs({
        id: addOptions.id,
        index: addOptions.index,
        label: addOptions.label,
        parentId: addOptions.parentId,
      }),
      command: 'add-group',
    })
  }
}

function closePreview(): void {
  exportPreview.value = undefined
}

function createNewCanvas(): void {
  if (!ensureCloudRoomCanEdit())
    return

  closePreview()
  newCanvasDialogOpen.value = true
}

function closeNewCanvasDialog(): void {
  newCanvasDialogOpen.value = false
}

async function clearActiveCanvas(): Promise<void> {
  const p = painter.value
  if (!p || !ensureCloudRoomCanEdit() || !await confirmDiscardUnsavedDocument())
    return

  p.clearCanvas()
  void submitCloudRoomDocumentCommand({
    command: 'clear-canvas',
  })
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

  await platformAdapter.saveDataUrl(dataUrl, { suggestedName: 'saier.png' })
}

async function openProject(): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const file = await platformAdapter.openFile({
    accept: '.saier.project.json,.json,application/json',
  })
  if (!file)
    return

  let rawProject = ''
  try {
    rawProject = await file.text()
  }
  catch (error) {
    console.error('Failed to read Saier project file.', error)
    showProjectImportFailure('read-failed')
    return
  }

  let project: SaierProjectFile
  try {
    project = JSON.parse(rawProject) as SaierProjectFile
  }
  catch (error) {
    console.error('Failed to parse Saier project file.', error)
    showProjectImportFailure('invalid-json')
    return
  }

  try {
    p.importProject(project, { activate: true })
  }
  catch (error) {
    console.error('Failed to import Saier project file.', error)
    showProjectImportFailure('invalid-project')
  }
}

async function importBrushPreset(): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const file = await platformAdapter.openFile({
    accept: '.myb,.json,text/plain',
  })
  if (!file)
    return

  let registeredName = ''
  try {
    const imported = parseBrushPresetImportText(await file.text(), {
      existingIds: p.brush.listPresets().map(preset => preset.id),
      fileName: file.name,
    })
    const registered = p.brush.registerPreset(imported.preset, { select: true })
    registeredName = registered.name
    p.useTool('brush')
  }
  catch (error) {
    console.error('Failed to import brush preset file.', error)
    showSiteNotice('error', text.value.notices.brushImportFailed, brushImportFailureMessage(error))
    return
  }

  try {
    const result = await saveBrushLibraryNow(p)
    if (result.ok) {
      showSiteNotice('info', text.value.notices.brushImportSucceeded, registeredName)
    }
    else {
      showSiteNotice('warning', text.value.notices.brushImportSavedLocally, brushLibraryFailureMessage(text.value.cloudFiles))
    }
  }
  catch (error) {
    console.error('Failed to save imported brush preset.', error)
    showSiteNotice('warning', text.value.notices.brushImportSavedLocally, errorMessage(error))
  }
}

async function saveProject(): Promise<void> {
  const p = painter.value
  if (!p)
    return

  try {
    await writeCurrentProjectDraft(p)
    p.markDocumentSaved()
  }
  catch (error) {
    console.error('Failed to save Saier project locally.', error)
    showSiteNotice('error', text.value.notices.projectDraftSaveFailed, errorMessage(error))
  }
}

async function uploadCurrentProjectToCloud(): Promise<void> {
  const p = painter.value
  if (!p)
    return

  await saveProjectDraftNow(p)
  const project = p.exportProject()
  const result = await uploadCloudProject(project, {
    name: projectFileName(project),
  })
  if (result.ok) {
    p.markDocumentSaved()
    await clearProjectDraftIfClean(p)
  }
}

async function loadCloudProject(file: YunlefunCloudFile): Promise<void> {
  const p = painter.value
  if (!p)
    return

  const result = await downloadCloudProject(file)
  if (!result.ok || !result.project)
    return

  try {
    p.importProject(result.project, { activate: true })
  }
  catch (error) {
    console.error('Failed to import cloud Saier project file.', error)
    showProjectImportFailure('invalid-project')
    return
  }
  closeCloudSyncDialog()
}

async function deleteCloudProject(file: YunlefunCloudFile): Promise<void> {
  await removeCloudFile(file)
}

async function renameCloudProject(file: YunlefunCloudFile, name: string): Promise<void> {
  await renameCloudFile(file, name)
}

function bindProjectDraftAutosave(current: Painter | undefined): void {
  removeProjectDraftListeners?.()
  removeProjectDraftListeners = undefined
  if (projectDraftSaveTimer) {
    clearTimeout(projectDraftSaveTimer)
    projectDraftSaveTimer = undefined
  }
  if (!current)
    return

  const schedule = () => scheduleProjectDraftSave(current)
  current.emitter.on('brush:up', schedule)
  current.emitter.on('eraser:up', schedule)
  current.emitter.on('canvas:clear', schedule)
  current.emitter.on('documents:change', schedule)
  current.emitter.on('active-document:change', schedule)
  current.controller.on('layers:change', schedule)
  removeProjectDraftListeners = () => {
    current.emitter.off('brush:up', schedule)
    current.emitter.off('eraser:up', schedule)
    current.emitter.off('canvas:clear', schedule)
    current.emitter.off('documents:change', schedule)
    current.emitter.off('active-document:change', schedule)
    current.controller.off('layers:change', schedule)
  }
}

function bindStrokeRecordingState(current: Painter | undefined): void {
  removeStrokeRecordingListeners?.()
  removeStrokeRecordingListeners = undefined
  syncStrokeRecordingState(current)
  if (!current)
    return

  const sync = () => syncStrokeRecordingState(current)
  current.emitter.on('stroke:commit', sync)
  current.emitter.on('documents:change', sync)
  current.emitter.on('active-document:change', sync)
  current.controller.on('layers:change', sync)
  removeStrokeRecordingListeners = () => {
    current.emitter.off('stroke:commit', sync)
    current.emitter.off('documents:change', sync)
    current.emitter.off('active-document:change', sync)
    current.controller.off('layers:change', sync)
  }
}

function syncStrokeRecordingState(current = painter.value): void {
  if (!current) {
    strokeRecordingEnabled.value = false
    strokeRecordingCount.value = 0
    return
  }

  strokeRecordingEnabled.value = current.strokeRecording.isEnabled()
  strokeRecordingCount.value = getReplayableRecordedStrokes(current).length
  if (strokeReplayPosition.value > strokeRecordingCount.value)
    strokeReplayPosition.value = strokeRecordingCount.value
  if (strokeReplayPosition.value >= strokeRecordingCount.value)
    stopStrokeReplay()
}

function getReplayableRecordedStrokes(current: Painter): SaierStrokeCommit[] {
  const documentId = current.getActiveDocumentId()
  return current.strokeRecording.getStrokes()
    .filter(stroke => stroke.documentId === documentId && Boolean(current.document.getLayer(stroke.layerId)))
}

function toggleStrokeRecording(): void {
  const current = painter.value
  if (!current)
    return

  current.strokeRecording.setEnabled(!current.strokeRecording.isEnabled())
  syncStrokeRecordingState(current)
}

async function replayLastRecordedStroke(): Promise<void> {
  if (!ensureCloudRoomCanEdit())
    return

  const current = painter.value
  if (!current)
    return

  const stroke = getReplayableRecordedStrokes(current).at(-1)
  if (!stroke)
    return

  current.strokeRecording.replayStroke(stroke)
  current.flushSurfaceUploads()
  scheduleProjectDraftSave(current)
  await Promise.all([
    refreshLayerThumbnails(),
    refreshMemory(),
    navigatorActions.refreshThumbnail(),
  ])
  syncStrokeRecordingState(current)
}

function clearStrokeRecording(): void {
  const current = painter.value
  if (!current)
    return

  stopStrokeReplay()
  current.strokeRecording.clear()
  strokeReplayPosition.value = 0
  syncStrokeRecordingState(current)
}

async function exportStrokeLog(): Promise<void> {
  const current = painter.value
  if (!current)
    return

  try {
    const project = current.exportProject()
    const log = current.strokeRecording.getLog({ documentId: current.getActiveDocumentId() })
    await platformAdapter.saveText(JSON.stringify(log), {
      suggestedName: `${safeFileName(projectFileName(project))}.saier.strokes.json`,
      type: 'application/json',
    })
  }
  catch (error) {
    console.error('Failed to export Saier stroke log.', error)
    showSiteNotice('error', text.value.recording.exportFailed, errorMessage(error))
  }
}

async function importStrokeLog(): Promise<void> {
  const current = painter.value
  const layerId = activeLayerId.value
  if (!current || !layerId)
    return

  const file = await platformAdapter.openFile({
    accept: '.saier.strokes.json,.json,application/json',
  })
  if (!file)
    return

  let log: SaierStrokeLog
  try {
    const parsed = JSON.parse(await file.text()) as unknown
    if (!isSaierStrokeLog(parsed)) {
      showSiteNotice('error', text.value.recording.importFailed, text.value.recording.invalidLog)
      return
    }
    log = parsed
  }
  catch (error) {
    console.error('Failed to parse Saier stroke log.', error)
    showSiteNotice('error', text.value.recording.importFailed, text.value.recording.invalidLog)
    return
  }

  try {
    const imported = current.strokeRecording.importLog(log, {
      documentId: current.getActiveDocumentId(),
      layerIdFallback: current.resolvePaintLayerId(layerId),
    })
    strokeReplayPosition.value = 0
    syncStrokeRecordingState(current)
    showSiteNotice('info', text.value.recording.imported, String(imported))
  }
  catch (error) {
    console.error('Failed to import Saier stroke log.', error)
    showSiteNotice('error', text.value.recording.importFailed, errorMessage(error))
  }
}

function startStrokeReplay(): void {
  if (strokeReplayPlaying.value || strokeReplayPosition.value >= strokeRecordingCount.value)
    return

  strokeReplayPlaying.value = true
  scheduleStrokeReplayTick(0)
}

function stopStrokeReplay(): void {
  strokeReplayPlaying.value = false
  if (strokeReplayTimer !== undefined) {
    clearTimeout(strokeReplayTimer)
    strokeReplayTimer = undefined
  }
}

function seekStrokeReplay(position: number): void {
  stopStrokeReplay()
  strokeReplayPosition.value = clampInteger(position, 0, strokeRecordingCount.value)
}

function setStrokeReplaySpeed(speed: number): void {
  strokeReplaySpeed.value = Math.max(0.25, Math.min(4, Math.round(speed * 4) / 4))
}

function scheduleStrokeReplayTick(delay: number): void {
  if (strokeReplayTimer !== undefined)
    clearTimeout(strokeReplayTimer)
  strokeReplayTimer = setTimeout(() => {
    strokeReplayTimer = undefined
    void replayStrokePlaybackTick()
  }, delay)
}

async function replayStrokePlaybackTick(): Promise<void> {
  if (!strokeReplayPlaying.value)
    return

  const replayed = await replayNextRecordedStroke()
  if (!replayed || strokeReplayPosition.value >= strokeRecordingCount.value) {
    stopStrokeReplay()
    return
  }

  const nextStroke = painter.value ? getReplayableRecordedStrokes(painter.value)[strokeReplayPosition.value] : undefined
  scheduleStrokeReplayTick(strokeReplayDelay(nextStroke))
}

async function replayNextRecordedStroke(): Promise<boolean> {
  if (!ensureCloudRoomCanEdit())
    return false

  const current = painter.value
  if (!current)
    return false

  const strokes = getReplayableRecordedStrokes(current)
  const stroke = strokes[strokeReplayPosition.value]
  if (!stroke)
    return false

  current.strokeRecording.replayStroke(stroke)
  current.flushSurfaceUploads()
  strokeReplayPosition.value += 1
  scheduleProjectDraftSave(current)
  await Promise.all([
    refreshLayerThumbnails(),
    refreshMemory(),
    navigatorActions.refreshThumbnail(),
  ])
  syncStrokeRecordingState(current)
  return true
}

function strokeReplayDelay(stroke: SaierStrokeCommit | undefined): number {
  const duration = stroke
    ? Math.max(...stroke.events.map(event => event.t), 160)
    : 160
  return Math.max(80, Math.round(duration / strokeReplaySpeed.value))
}

async function detectLocalProjectDraft(_current: Painter): Promise<void> {
  if (!import.meta.client)
    return

  try {
    projectDraftRecovery.value = await readProjectDraft()
  }
  catch (error) {
    console.error('Failed to read Saier local project draft.', error)
    showSiteNotice('error', text.value.notices.projectDraftReadFailed, errorMessage(error))
  }
}

async function restoreLocalProjectDraft(): Promise<void> {
  const current = painter.value
  const draft = projectDraftRecovery.value
  if (!current || !draft)
    return

  projectDraftRecovery.value = undefined
  const documentsBeforeRestore = current.getDocuments()
  const previousActiveId = current.getActiveDocumentId()
  restoringProjectDraft = true
  try {
    const restored = current.importProject(draft.project, {
      activate: true,
      name: projectFileName(draft.project),
    })
    current.markDocumentDirty(restored.id)

    const previous = documentsBeforeRestore.find(document => document.id === previousActiveId)
    if (documentsBeforeRestore.length === 1 && previous && !previous.dirty)
      current.closeDocument(previousActiveId)
  }
  catch (error) {
    console.error('Failed to restore Saier local project draft.', error)
    showSiteNotice('error', text.value.notices.projectDraftRestoreFailed, errorMessage(error))
    await discardLocalProjectDraft()
  }
  finally {
    restoringProjectDraft = false
  }
}

async function discardLocalProjectDraft(): Promise<void> {
  projectDraftRecovery.value = undefined
  await clearStoredProjectDraft()
}

function projectDraftName(draft: SaierProjectDraftFile): string {
  const name = typeof draft.project.metadata?.name === 'string'
    ? draft.project.metadata.name.trim()
    : ''
  return name || text.value.documents.draftRecovery.unknownName
}

function formatDraftUpdatedAt(updatedAt: number): string {
  return new Intl.DateTimeFormat(locale.value === 'zh' ? 'zh-CN' : 'en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(updatedAt))
}

function scheduleProjectDraftSave(current: Painter): void {
  if (restoringProjectDraft)
    return
  if (projectDraftSaveTimer)
    clearTimeout(projectDraftSaveTimer)

  projectDraftSaveTimer = setTimeout(() => {
    projectDraftSaveTimer = undefined
    void saveProjectDraftNow(current)
  }, PROJECT_DRAFT_SAVE_DEBOUNCE_MS)
}

async function saveProjectDraftNow(current: Painter): Promise<void> {
  if (!import.meta.client)
    return

  const activeDocument = current.getDocuments().find(document => document.active)
  if (!activeDocument?.dirty)
    return

  try {
    await writeCurrentProjectDraft(current)
  }
  catch (error) {
    console.error('Failed to write Saier local project draft.', error)
    showSiteNotice('error', text.value.notices.projectDraftSaveFailed, errorMessage(error))
  }
}

async function writeCurrentProjectDraft(current: Painter): Promise<void> {
  const draft = createProjectDraft(current.exportProject())
  await queueProjectDraftStorage(() => writeProjectDraft(draft))
}

async function clearProjectDraftIfClean(current: Painter): Promise<void> {
  if (!import.meta.client)
    return

  if (!current.hasUnsavedChanges())
    await clearStoredProjectDraft()
  else
    scheduleProjectDraftSave(current)
}

async function clearStoredProjectDraft(): Promise<void> {
  try {
    await queueProjectDraftStorage(() => clearProjectDraft())
  }
  catch (error) {
    console.error('Failed to clear Saier local project draft.', error)
    showSiteNotice('error', text.value.notices.projectDraftClearFailed, errorMessage(error))
  }
}

function queueProjectDraftStorage(operation: () => Promise<void>): Promise<void> {
  const queued = projectDraftStorageQueue.then(operation, operation)
  projectDraftStorageQueue = queued.catch(() => {})
  return queued
}

function showProjectImportFailure(reason: ProjectImportFailureReason): void {
  showSiteNotice('error', text.value.notices.projectImportFailed, projectImportFailureMessage(reason))
}

function projectImportFailureMessage(reason: ProjectImportFailureReason): string {
  switch (reason) {
    case 'read-failed':
      return text.value.notices.projectImportReadFailed
    case 'invalid-json':
      return text.value.notices.projectImportInvalidJson
    case 'invalid-project':
      return text.value.notices.projectImportInvalidProject
  }
}

function brushImportFailureMessage(error: unknown): string | undefined {
  if (!isBrushPresetImportError(error))
    return errorMessage(error)

  switch (error.reason) {
    case 'empty_file':
    case 'unsupported_format':
      return text.value.notices.brushImportUnsupported
    case 'invalid_mypaint':
      return text.value.notices.brushImportInvalidMyPaint
    case 'unsupported_sai':
      return text.value.notices.brushImportUnsupportedSai
  }
}

function showSiteNotice(type: SiteNoticeItem['type'], title: string, message?: string): void {
  const notice: SiteNoticeItem = {
    id: ++siteNoticeId,
    type,
    title,
    ...(message ? { message } : {}),
  }
  siteNotices.value = [
    ...siteNotices.value.filter(item => item.title !== title),
    notice,
  ].slice(-4)
}

function showUnavailableBrushPresetNotice(payload: UnavailableBrushPresetPayload): void {
  const reason = payload.reason === 'missing-engine'
    ? text.value.notices.brushPresetMissingEngine
    : text.value.notices.brushPresetRequiresSampler
  showSiteNotice('warning', text.value.notices.brushPresetUnavailable, `${payload.presetName}: ${reason}`)
}

function closeSiteNotice(id: number): void {
  siteNotices.value = siteNotices.value.filter(item => item.id !== id)
}

function errorMessage(error: unknown): string | undefined {
  if (error instanceof Error && error.message)
    return error.message
  return typeof error === 'string' && error ? error : undefined
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
  if (!ensureCloudRoomCanEdit())
    return

  const layer = activeLayer.value
  if (!layer)
    return

  const nextIndex = activeLayerIndex.value + offset
  if (nextIndex < 0 || nextIndex >= layers.value.length)
    return

  layerActions.move(layer.id, nextIndex)
  void submitCloudRoomLayerCommand({
    args: { id: layer.id, toIndex: nextIndex },
    command: 'move',
  })
}

function onExtract(dataUrl: string): void {
  exportPreview.value = dataUrl
}

async function applyLayerFilter(command: SitePainterFilterCommand): Promise<void> {
  if (!ensureCloudRoomCanEdit())
    return

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
  if (!ensureCloudRoomCanEdit())
    return

  const layer = activeLayer.value
  if (!layer || !canRemoveLayer.value)
    return

  layerActions.remove(layer.id)
  void submitCloudRoomLayerCommand({
    args: { id: layer.id },
    command: 'remove',
  })
}

function setActiveLayerVisible(visible: boolean): void {
  if (!ensureCloudRoomCanEdit())
    return

  const layer = activeLayer.value
  if (layer) {
    layerActions.setVisible(layer.id, visible)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerBooleanArgs(layer.id, 'visible', visible),
      command: 'set-visible',
    })
  }
}

function removeLayer(id: string): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.remove(id)
    void submitCloudRoomLayerCommand({
      args: { id },
      command: 'remove',
    })
  }
}

function moveLayer(id: string, toIndex: number): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.move(id, toIndex)
    void submitCloudRoomLayerCommand({
      args: { id, toIndex },
      command: 'move',
    })
  }
}

function moveLayerNode(id: string, target: Parameters<typeof layerActions.moveNode>[1]): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.moveNode(id, target)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomMoveNodeArgs(id, target),
      command: 'move-node',
    })
  }
}

function ungroupLayer(id: string): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.ungroup(id)
    void submitCloudRoomLayerCommand({
      args: { id },
      command: 'ungroup',
    })
  }
}

function setLayerVisible(id: string, visible: boolean): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setVisible(id, visible)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerBooleanArgs(id, 'visible', visible),
      command: 'set-visible',
    })
  }
}

function setLayerOpacity(id: string, opacity: number): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setOpacity(id, opacity)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerValueArgs(id, 'opacity', opacity),
      command: 'set-opacity',
    })
  }
}

function setLayerBlendMode(id: string, blendMode: Parameters<typeof layerActions.setBlendMode>[1]): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setBlendMode(id, blendMode)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerValueArgs(id, 'blendMode', blendMode),
      command: 'set-blend-mode',
    })
  }
}

function setLayerLabel(id: string, label: string): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setLabel(id, label)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerValueArgs(id, 'label', label),
      command: 'set-label',
    })
  }
}

function setLayerLockAlpha(id: string, lockAlpha: boolean): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setLockAlpha(id, lockAlpha)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerBooleanArgs(id, 'lockAlpha', lockAlpha),
      command: 'set-lock-alpha',
    })
  }
}

function setLayerClip(id: string, clip: boolean): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setClip(id, clip)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerBooleanArgs(id, 'clip', clip),
      command: 'set-clip',
    })
  }
}

function addLayerMask(id: string): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.addMask(id)
    void submitCloudRoomLayerCommand({
      args: { id, maskId: `${id}:mask` },
      command: 'add-mask',
    })
  }
}

function removeLayerMask(id: string): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.removeMask(id)
    void submitCloudRoomLayerCommand({
      args: { id },
      command: 'remove-mask',
    })
  }
}

function setLayerMaskEnabled(id: string, enabled: boolean): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setMaskEnabled(id, enabled)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerBooleanArgs(id, 'enabled', enabled),
      command: 'set-mask-enabled',
    })
  }
}

function setLayerGroupCollapsed(id: string, collapsed: boolean): void {
  if (ensureCloudRoomCanEdit()) {
    layerActions.setGroupCollapsed(id, collapsed)
    void submitCloudRoomLayerCommand({
      args: createCloudRoomLayerBooleanArgs(id, 'collapsed', collapsed),
      command: 'set-group-collapsed',
    })
  }
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
  if (!ensureCloudRoomCanEdit() || !await confirmDiscardUnsavedDocument(id))
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

function ensureCloudRoomCanEdit(): boolean {
  if (!isCloudRoomReadOnly.value)
    return true

  showCloudRoomReadOnlyNotice()
  return false
}

function showCloudRoomReadOnlyNotice(): void {
  showSiteNotice('warning', text.value.cloudRooms.readOnlyTitle, text.value.cloudRooms.readOnlyBlocked)
}

function showCloudRoomOperationFailure(): void {
  const message = cloudRoomErrorMessage.value || text.value.cloudRooms.backendUnavailable
  showSiteNotice('error', text.value.cloudRooms.errorTitle, message)
}

function isRoomWriteCommand(command: SitePainterCommand): boolean {
  if (command === 'app:keyboard-shortcuts'
    || command === 'file:cloud-room'
    || command === 'file:download'
    || command === 'file:export-preview'
    || command === 'file:save-project'
    || command === 'recording:clear'
    || command === 'recording:export-log'
    || command === 'recording:import-log'
    || command === 'recording:pause'
    || command === 'recording:seek-start'
    || command === 'recording:toggle'
    || command === 'view:reset'
    || command === 'view:zoom-in'
    || command === 'view:zoom-out'
    || command === 'tool:drag') {
    return false
  }

  return true
}

function canRunCommand(command: SitePainterCommand): boolean {
  if (command === 'app:keyboard-shortcuts')
    return true
  if (!painter.value)
    return false
  if (isCloudRoomReadOnly.value && isRoomWriteCommand(command))
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
    case 'recording:replay-last':
      return canReplayStrokeRecording.value
    case 'recording:clear':
      return strokeRecordingCount.value > 0
    case 'recording:export-log':
      return strokeRecordingCount.value > 0
    case 'recording:play':
    case 'recording:step-forward':
      return canReplayStrokeRecording.value && strokeReplayPosition.value < strokeRecordingCount.value
    case 'recording:pause':
      return strokeReplayPlaying.value
    case 'recording:seek-start':
      return strokeReplayPosition.value > 0
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

function isSaierStrokeLog(value: unknown): value is SaierStrokeLog {
  const record = value as Partial<SaierStrokeLog>
  return Boolean(record
    && record.schema === 'saier.stroke-log.v1'
    && typeof record.documentId === 'string'
    && Array.isArray(record.operations))
}

function clampInteger(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  return Math.max(min, Math.min(max, Math.round(value)))
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

async function createSiteCloudRoomE2eState(): Promise<SiteCloudRoomE2eState> {
  const session = cloudRoomSession.value

  return {
    activeLayerId: activeLayerId.value,
    canvasHash: await createSiteCloudRoomE2eCanvasHash(),
    headRevision: session?.room.headRevision ?? 0,
    latestSnapshotRevision: session?.room.latestSnapshotRevision ?? 0,
    layers: layers.value.map(layer => ({
      id: layer.id,
      label: layer.label,
      visible: layer.visible,
    })),
    notices: siteNotices.value.map(notice => ({
      message: notice.message,
      title: notice.title,
      type: notice.type,
    })),
    readOnly: session?.readOnly ?? false,
    role: session?.role,
    roomId: session?.room.id,
  }
}

async function createSiteCloudRoomE2eCanvasHash(): Promise<string> {
  const dataUrl = await painter.value?.extractCanvas('base64', { mode: 'preview' })
  return hashString(typeof dataUrl === 'string' ? dataUrl : '')
}

async function drawSiteCloudRoomE2eDab(options: SiteCloudRoomE2eDabOptions = {}): Promise<SiteCloudRoomE2eState> {
  if (!ensureCloudRoomCanEdit())
    return createSiteCloudRoomE2eState()

  const current = painter.value
  const layerId = activeLayerId.value
  if (!current || !layerId)
    return createSiteCloudRoomE2eState()

  current.surface.beginStroke(layerId)
  current.surface.paintDab(layerId, {
    color: {
      a: options.a ?? 1,
      b: options.b ?? 0,
      g: options.g ?? 0,
      r: options.r ?? 1,
    },
    hardness: options.hardness ?? 0,
    opacity: options.opacity ?? 1,
    radius: options.radius ?? 10,
    x: options.x ?? 48,
    y: options.y ?? 48,
  }, 'normal')
  const patch = current.surface.endStroke(layerId)
  current.recordStrokePatch(patch)
  current.flushSurfaceUploads()

  await Promise.all([
    refreshLayerThumbnails(),
    refreshMemory(),
    navigatorActions.refreshThumbnail(),
  ])
  await Promise.resolve()

  return createSiteCloudRoomE2eState()
}

async function addSiteCloudRoomE2eLayer(id: string): Promise<SiteCloudRoomE2eState> {
  addLayer({ id })
  await Promise.resolve()
  return createSiteCloudRoomE2eState()
}

async function tryReadOnlyAddSiteCloudRoomE2eLayer(id: string): Promise<SiteCloudRoomE2eState> {
  if (isCloudRoomReadOnly.value)
    addLayer({ id })
  await Promise.resolve()
  return createSiteCloudRoomE2eState()
}

async function syncSiteCloudRoomE2eNow(): Promise<SiteCloudRoomE2eState> {
  await syncCloudRoomOperations()
  return createSiteCloudRoomE2eState()
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash.toString(16).padStart(8, '0')
}

function installSiteCloudRoomE2eBridge(): void {
  if (!import.meta.client || !import.meta.dev)
    return

  const target = globalThis as typeof globalThis & {
    __SAIER_SITE_E2E__?: SiteCloudRoomE2eBridge
  }
  target.__SAIER_SITE_E2E__ = {
    addLayer: addSiteCloudRoomE2eLayer,
    drawDab: drawSiteCloudRoomE2eDab,
    state: createSiteCloudRoomE2eState,
    syncNow: syncSiteCloudRoomE2eNow,
    tryReadOnlyAddLayer: tryReadOnlyAddSiteCloudRoomE2eLayer,
  }
}

installSiteCloudRoomE2eBridge()
</script>

<template>
  <component
    :is="painterShellComponent"
    :app-name="text.appName"
    :available-panels="availablePanels"
    :close-preview-label="text.closePreview"
    :export-preview="exportPreview"
    :export-preview-label="text.exportPreview"
    :current-locale-label="currentLocaleOption.shortLabel"
    :locale="locale"
    :locale-options="localeOptions"
    :language-label="text.language"
    :loading="!painter"
    :loading-label="text.loading"
    :panel-action-labels="panelActionLabels"
    :panel-labels="panelLabels"
    :panel-visibility="panelVisibility"
    :status-label="statusLabel"
    :tagline="text.tagline"
    @close-preview="closePreview"
    @set-locale="setLocale"
    @set-panel-visible="setPanelVisible"
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
        :locale-options="localeOptions"
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
      <div class="site-painter-toolbar-stack">
        <SitePainterToolbar
          :active-tool="activeTool"
          :can-redo="state?.history.canRedo ?? false"
          :can-replay-recording="canReplayStrokeRecording"
          :can-undo="state?.history.canUndo ?? false"
          :disabled="!painter"
          :labels="toolbarLabels"
          :recording-count="strokeRecordingCount"
          :recording-enabled="strokeRecordingEnabled"
          :stabilizer-strength="stabilizerStrength"
          @command="handleMenuCommand"
          @update:stabilizer-strength="setStabilizerStrength"
        />
        <SiteStrokeReplayControls
          :count="strokeRecordingCount"
          :disabled="!painter"
          :labels="text.recording"
          :playing="strokeReplayPlaying"
          :position="strokeReplayPosition"
          :speed="strokeReplaySpeed"
          @command="handleMenuCommand"
          @seek="seekStrokeReplay"
          @update:speed="setStrokeReplaySpeed"
        />
      </div>
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
      <template v-if="painter && panelVisibility.options">
        <PainterTransformBar
          v-if="state?.tool === 'selection' && painter.getTransformSelection()"
          :painter="painter"
        />
        <PainterOptionsBar
          v-else
          :painter="painter"
          :labels="text.brushOptions"
          :stabilizer-strength="stabilizerStrength"
          @unavailable-preset="showUnavailableBrushPresetNotice"
          @update:stabilizer-strength="setStabilizerStrength"
        />
      </template>
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
        :mask-thumbnails="layerMaskThumbnails"
        :paint-target="paintTarget"
        :labels="text.layers"
        @add="addLayer"
        @add-group="addGroup"
        @remove="removeLayer"
        @move="moveLayer"
        @move-node="moveLayerNode"
        @select="layerActions.setActive"
        @ungroup="ungroupLayer"
        @update:visible="setLayerVisible"
        @update:opacity="setLayerOpacity"
        @update:blend-mode="setLayerBlendMode"
        @update:label="setLayerLabel"
        @update:lock-alpha="setLayerLockAlpha"
        @update:clip="setLayerClip"
        @add-mask="addLayerMask"
        @remove-mask="removeLayerMask"
        @update:mask-enabled="setLayerMaskEnabled"
        @update:paint-target="layerActions.setPaintTarget"
        @update:group-collapsed="setLayerGroupCollapsed"
      />
    </template>

    <template #navigator>
      <PainterNavigator
        v-if="painter && panelVisibility.navigator"
        :thumbnail="navigatorThumbnail"
        :viewport="viewport"
        :labels="text.navigator"
        @center="navigatorActions.setCenter"
        @refresh="navigatorActions.refreshThumbnail"
        @reset="navigatorActions.reset"
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
  </component>

  <SiteNoticeStack
    :close-label="text.notices.close"
    :notices="siteNotices"
    @close="closeSiteNotice"
  />

  <SiteProjectDraftRecoveryDialog
    :open="projectDraftRecoveryOpen"
    :labels="text.documents.draftRecovery"
    :meta="projectDraftRecoveryMeta"
    @discard="discardLocalProjectDraft"
    @restore="restoreLocalProjectDraft"
  />

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

  <SiteCloudRoomDialog
    :default-title="cloudRoomDefaultTitle"
    :error-message="cloudRoomErrorMessage"
    :is-authenticated="isYunlefunAuthenticated"
    :labels="text.cloudRooms"
    :open="cloudRoomDialogOpen"
    :session="cloudRoomSession"
    :share-url="cloudRoomShareUrl"
    :status="cloudRoomStatus"
    :upload-progress="cloudRoomUploadProgress"
    @close="closeCloudRoomDialog"
    @create="createCloudRoomFromCurrent"
    @join="joinCloudRoom"
    @leave="leaveCloudRoom"
    @login="loginWithYunlefunForCloudRoom"
    @share="shareCloudRoom"
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
    @rename-file="renameCloudProject"
    @sync-brush-library="syncBrushLibraryNow"
    @upload-current="uploadCurrentProjectToCloud"
  />
</template>

<style scoped>
.site-painter-toolbar-stack {
  display: flex;
  max-width: 100%;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  scrollbar-width: none;
}

.site-painter-toolbar-stack::-webkit-scrollbar {
  display: none;
}
</style>

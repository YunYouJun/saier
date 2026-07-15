<script setup lang="ts">
import type { YunlefunBrushLibraryStatus } from '~/composables/useYunlefunBrushLibrary'
import type { YunlefunCloudFile, YunlefunCloudFileStatus, YunlefunCloudStorageQuota } from '~/composables/useYunlefunCloudFiles'
import { computed, shallowRef, watch } from 'vue'

interface SiteCloudSyncDialogLabels {
  brushLibrary: string
  brushLibraryCount: string
  brushLibraryEmpty: string
  brushLibrarySync: string
  brushLibrarySynced: string
  brushLibrarySyncing: string
  checkingQuota: string
  close: string
  confirmRemove: string
  deleting: string
  downloading: string
  empty: string
  finalizing: string
  load: string
  loading: string
  maxFileSize: string
  memberPlan: string
  name: string
  normalPlan: string
  quotaAvailable: string
  quotaUsed: string
  recentFiles: string
  refresh: string
  renaming: string
  rename: string
  remove: string
  saveRename: string
  signIn: string
  signInRequired: string
  size: string
  title: string
  updated: string
  uploadCurrent: string
  uploading: string
}

const props = defineProps<{
  errorMessage: string
  files: readonly YunlefunCloudFile[]
  isAuthenticated: boolean
  isMember: boolean
  labels: SiteCloudSyncDialogLabels
  maxBytes: number
  open: boolean
  quota: YunlefunCloudStorageQuota | null
  status: YunlefunCloudFileStatus
  uploadProgress: number
  brushLibraryCount: number
  brushLibraryErrorMessage: string
  brushLibraryLastSyncedAt: number | null
  brushLibraryStatus: YunlefunBrushLibraryStatus
}>()

const emit = defineEmits<{
  close: []
  loadFile: [file: YunlefunCloudFile]
  login: []
  refresh: []
  removeFile: [file: YunlefunCloudFile]
  renameFile: [file: YunlefunCloudFile, name: string]
  syncBrushLibrary: []
  uploadCurrent: []
}>()

const pendingRemoveId = shallowRef<string>()
const pendingRenameId = shallowRef<string>()
const pendingLoadId = shallowRef<string>()
const renameDraft = shallowRef('')

const canUseCloud = computed(() => props.isAuthenticated)
const isRefreshing = computed(() => props.status === 'loading')
const isUploadingProject = computed(() => props.status === 'uploading' || props.status === 'finalizing')
const isBusy = computed(() =>
  props.status === 'loading'
  || props.status === 'uploading'
  || props.status === 'finalizing'
  || props.status === 'downloading'
  || props.status === 'deleting'
  || props.status === 'renaming',
)
const isBrushLibraryBusy = computed(() =>
  props.brushLibraryStatus === 'loading'
  || props.brushLibraryStatus === 'uploading'
  || props.brushLibraryStatus === 'finalizing'
  || props.brushLibraryStatus === 'downloading',
)
const quotaSummary = computed(() => {
  if (!props.quota)
    return `${props.labels.maxFileSize}: ${formatBytes(props.maxBytes)}`

  const plan = props.isMember ? props.labels.memberPlan : props.labels.normalPlan
  return [
    plan,
    `${props.labels.quotaUsed}: ${formatBytes(props.quota.usedBytes)} / ${formatBytes(props.quota.quotaBytes)}`,
    `${props.labels.quotaAvailable}: ${formatBytes(props.quota.availableBytes)}`,
    `${props.labels.maxFileSize}: ${formatBytes(props.maxBytes)}`,
  ].join(' · ')
})
const statusLabel = computed(() => {
  switch (props.status) {
    case 'deleting':
      return props.labels.deleting
    case 'downloading':
      return props.labels.downloading
    case 'finalizing':
      return props.labels.finalizing
    case 'loading':
      return props.labels.checkingQuota
    case 'renaming':
      return props.labels.renaming
    case 'uploading':
      return props.uploadProgress > 0 && props.uploadProgress < 1
        ? `${props.labels.uploading} ${Math.round(props.uploadProgress * 100)}%`
        : props.labels.uploading
    default:
      return ''
  }
})
const brushLibraryStatusLabel = computed(() => {
  if (isBrushLibraryBusy.value)
    return props.labels.brushLibrarySyncing
  return ''
})
const uploadButtonLabel = computed(() => isUploadingProject.value ? statusLabel.value : props.labels.uploadCurrent)
const liveStatusLabel = computed(() => [statusLabel.value, brushLibraryStatusLabel.value].filter(Boolean).join(' · '))
const brushLibrarySummary = computed(() => {
  if (props.brushLibraryCount <= 0)
    return props.labels.brushLibraryEmpty

  const parts = [
    `${props.labels.brushLibraryCount}: ${props.brushLibraryCount}`,
  ]
  if (props.brushLibraryLastSyncedAt)
    parts.push(`${props.labels.brushLibrarySynced}: ${formatDate(props.brushLibraryLastSyncedAt)}`)
  return parts.join(' · ')
})

watch(
  () => props.open,
  (open) => {
    if (!open) {
      pendingRemoveId.value = undefined
      pendingLoadId.value = undefined
      cancelRename()
    }
  },
)

watch(
  () => props.status,
  (status, previousStatus) => {
    if (status === 'error' || (previousStatus === 'downloading' && status !== 'downloading'))
      pendingLoadId.value = undefined
  },
)

function requestLoad(file: YunlefunCloudFile): void {
  pendingLoadId.value = file.id
  emit('loadFile', file)
}

function requestRemove(file: YunlefunCloudFile): void {
  if (pendingRemoveId.value === file.id) {
    emit('removeFile', file)
    pendingRemoveId.value = undefined
    return
  }

  pendingRemoveId.value = file.id
}

function startRename(file: YunlefunCloudFile): void {
  pendingRemoveId.value = undefined
  pendingRenameId.value = file.id
  renameDraft.value = file.name
}

function cancelRename(): void {
  pendingRenameId.value = undefined
  renameDraft.value = ''
}

function submitRename(file: YunlefunCloudFile): void {
  const nextName = renameDraft.value.trim()
  if (!nextName || nextName === file.name) {
    cancelRename()
    return
  }

  emit('renameFile', file, nextName)
  cancelRename()
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp))
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
</script>

<template>
  <div
    v-if="open"
    class="site-cloud-sync"
    role="dialog"
    aria-modal="true"
    :aria-label="labels.title"
    @keydown.esc.stop="emit('close')"
  >
    <section class="site-cloud-sync__panel">
      <header class="site-cloud-sync__header">
        <h2 class="site-cloud-sync__title">
          {{ labels.title }}
        </h2>
        <button type="button" class="site-cloud-sync__icon" :title="labels.close" @click="emit('close')">
          <span class="i-ph-x" />
        </button>
      </header>

      <div class="site-cloud-sync__toolbar">
        <button
          type="button"
          class="site-cloud-sync__button"
          :aria-busy="isRefreshing"
          :disabled="isBusy"
          @click="emit('refresh')"
        >
          <span :class="isRefreshing ? 'i-ph-spinner-gap site-cloud-sync__spinner' : 'i-ph-arrows-clockwise'" />
          <span>{{ isRefreshing ? labels.checkingQuota : labels.refresh }}</span>
        </button>
        <button
          type="button"
          class="site-cloud-sync__button site-cloud-sync__button--primary"
          :aria-busy="isUploadingProject"
          :disabled="!canUseCloud || isBusy"
          @click="emit('uploadCurrent')"
        >
          <span :class="isUploadingProject ? 'i-ph-spinner-gap site-cloud-sync__spinner' : 'i-ph-cloud-arrow-up'" />
          <span>{{ uploadButtonLabel }}</span>
        </button>
      </div>

      <div class="site-cloud-sync__notice">
        <template v-if="!isAuthenticated">
          <span>{{ labels.signInRequired }}</span>
          <button type="button" class="site-cloud-sync__link" @click="emit('login')">
            {{ labels.signIn }}
          </button>
        </template>
        <template v-else>
          <span>{{ quotaSummary }}</span>
        </template>
      </div>

      <span class="site-cloud-sync__live-status" role="status" aria-live="polite" aria-atomic="true">
        {{ liveStatusLabel }}
      </span>
      <p v-if="errorMessage" class="site-cloud-sync__error">
        {{ errorMessage }}
      </p>

      <section class="site-cloud-sync__brush-library" aria-live="polite">
        <div class="site-cloud-sync__brush-copy">
          <h3 class="site-cloud-sync__subtitle">
            {{ labels.brushLibrary }}
          </h3>
          <p class="site-cloud-sync__brush-summary">
            {{ brushLibrarySummary }}
          </p>
        </div>
        <button
          type="button"
          class="site-cloud-sync__button"
          :aria-busy="isBrushLibraryBusy"
          :disabled="!canUseCloud || isBusy || isBrushLibraryBusy"
          @click="emit('syncBrushLibrary')"
        >
          <span :class="isBrushLibraryBusy ? 'i-ph-spinner-gap site-cloud-sync__spinner' : 'i-ph-paint-brush'" />
          <span>{{ isBrushLibraryBusy ? labels.brushLibrarySyncing : labels.brushLibrarySync }}</span>
        </button>
      </section>

      <p v-if="brushLibraryErrorMessage" class="site-cloud-sync__error">
        {{ brushLibraryErrorMessage }}
      </p>

      <div class="site-cloud-sync__table" role="table">
        <div class="site-cloud-sync__caption">
          {{ labels.recentFiles }}
        </div>
        <div class="site-cloud-sync__row site-cloud-sync__row--head" role="row">
          <span role="columnheader">{{ labels.name }}</span>
          <span role="columnheader">{{ labels.size }}</span>
          <span role="columnheader">{{ labels.updated }}</span>
          <span role="columnheader" />
        </div>

        <div v-if="files.length === 0" class="site-cloud-sync__empty">
          {{ labels.empty }}
        </div>

        <div
          v-for="file in files"
          :key="file.id"
          class="site-cloud-sync__row"
          role="row"
        >
          <span class="site-cloud-sync__name" role="cell">
            <input
              v-if="pendingRenameId === file.id"
              v-model="renameDraft"
              class="site-cloud-sync__rename-input"
              :aria-label="labels.rename"
              @keydown.enter.prevent="submitRename(file)"
              @keydown.esc.prevent="cancelRename"
            >
            <template v-else>
              {{ file.name }}
            </template>
          </span>
          <span role="cell">{{ formatBytes(file.size) }}</span>
          <span class="site-cloud-sync__date" role="cell">{{ formatDate(file.updatedAt) }}</span>
          <span class="site-cloud-sync__actions" role="cell">
            <button
              v-if="pendingRenameId === file.id"
              type="button"
              class="site-cloud-sync__icon-button"
              :disabled="isBusy"
              :title="labels.saveRename"
              @click="submitRename(file)"
            >
              <span class="i-ph-check" />
            </button>
            <button
              v-else
              type="button"
              class="site-cloud-sync__icon-button"
              :disabled="isBusy"
              :title="labels.rename"
              @click="startRename(file)"
            >
              <span class="i-ph-pencil-simple" />
            </button>
            <button type="button" class="site-cloud-sync__icon-button" :aria-busy="pendingLoadId === file.id" :disabled="isBusy" :title="labels.load" @click="requestLoad(file)">
              <span :class="pendingLoadId === file.id ? 'i-ph-spinner-gap site-cloud-sync__spinner' : 'i-ph-cloud-arrow-down'" />
            </button>
            <button
              type="button"
              class="site-cloud-sync__icon-button site-cloud-sync__icon-button--danger"
              :class="{ 'is-confirming': pendingRemoveId === file.id }"
              :disabled="isBusy"
              :title="pendingRemoveId === file.id ? labels.confirmRemove : labels.remove"
              @click="requestRemove(file)"
            >
              <span :class="pendingRemoveId === file.id ? 'i-ph-check' : 'i-ph-trash'" />
            </button>
          </span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.site-cloud-sync {
  box-sizing: border-box;
  position: absolute;
  z-index: 45;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 14px;
  background: var(--saier-color-scrim);
}

.site-cloud-sync__panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(760px, calc(100vw - 28px));
  max-height: min(680px, calc(100vh - 28px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--saier-color-border);
  border-radius: 8px;
  background: var(--saier-color-panel-raised);
  box-shadow: var(--saier-shadow-dialog);
  color: var(--saier-color-text);
  padding: 12px;
}

.site-cloud-sync__header,
.site-cloud-sync__toolbar,
.site-cloud-sync__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.site-cloud-sync__header {
  justify-content: space-between;
  margin-bottom: 12px;
}

.site-cloud-sync__title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.site-cloud-sync__icon,
.site-cloud-sync__button,
.site-cloud-sync__icon-button {
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text);
}

.site-cloud-sync__icon,
.site-cloud-sync__icon-button {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
}

.site-cloud-sync__button {
  display: inline-flex;
  height: 34px;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  padding: 0 10px;
  white-space: nowrap;
}

.site-cloud-sync__spinner {
  animation: site-cloud-sync-spin 800ms linear infinite;
}

.site-cloud-sync__live-status {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.site-cloud-sync__button--primary {
  border-color: var(--saier-color-success-border);
  background: var(--saier-color-success-soft);
}

.site-cloud-sync__icon-button--danger:hover {
  border-color: var(--saier-color-danger-border);
  background: var(--saier-color-danger-soft);
}

.site-cloud-sync__icon-button--danger.is-confirming {
  border-color: var(--saier-color-danger-border);
  background: var(--saier-color-danger-soft);
  color: var(--saier-color-danger-text);
}

.site-cloud-sync__button:disabled,
.site-cloud-sync__icon-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.site-cloud-sync__toolbar {
  justify-content: space-between;
  margin-bottom: 10px;
}

.site-cloud-sync__notice,
.site-cloud-sync__brush-library,
.site-cloud-sync__status,
.site-cloud-sync__error {
  margin: 0 0 10px;
  border-radius: 7px;
  font-size: 13px;
  line-height: 1.45;
  padding: 9px 10px;
}

.site-cloud-sync__notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text-muted);
}

.site-cloud-sync__brush-library {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: var(--saier-color-info-soft);
  color: var(--saier-color-text-muted);
}

.site-cloud-sync__brush-copy {
  min-width: 0;
}

.site-cloud-sync__subtitle {
  margin: 0 0 2px;
  color: var(--saier-color-text);
  font-size: 13px;
}

.site-cloud-sync__brush-summary {
  margin: 0;
  font-size: 12px;
}

.site-cloud-sync__status {
  background: var(--saier-color-accent-soft);
  color: var(--saier-color-accent-text);
}

.site-cloud-sync__error {
  background: var(--saier-color-danger-soft);
  color: var(--saier-color-danger-text);
}

.site-cloud-sync__link {
  border: 0;
  background: transparent;
  color: var(--saier-color-info-text);
  font: inherit;
  text-decoration: none;
}

.site-cloud-sync__table {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--saier-color-border);
  border-radius: 7px;
}

.site-cloud-sync__caption {
  position: sticky;
  z-index: 1;
  top: 0;
  border-bottom: 1px solid var(--saier-color-border);
  background: var(--saier-color-panel-raised);
  color: var(--saier-color-text-muted);
  font-size: 12px;
  font-weight: 700;
  padding: 8px 10px;
}

.site-cloud-sync__row {
  display: grid;
  grid-template-columns: minmax(140px, 1.4fr) minmax(72px, 0.5fr) minmax(132px, 0.9fr) minmax(108px, auto);
  min-height: 38px;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--saier-color-border);
  color: var(--saier-color-text-muted);
  font-size: 13px;
  padding: 7px 10px;
}

.site-cloud-sync__row:first-child {
  border-top: 0;
}

.site-cloud-sync__row--head {
  position: sticky;
  z-index: 1;
  top: 33px;
  min-height: 30px;
  background: var(--saier-color-panel-raised);
  color: var(--saier-color-text-subtle);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.site-cloud-sync__empty {
  color: var(--saier-color-text-subtle);
  font-size: 13px;
  padding: 22px 10px;
  text-align: center;
}

.site-cloud-sync__name,
.site-cloud-sync__date {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-cloud-sync__name {
  color: var(--saier-color-text);
}

.site-cloud-sync__rename-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  border: 1px solid var(--saier-color-info-border);
  border-radius: 5px;
  outline: none;
  background: var(--saier-color-surface-hover);
  color: var(--saier-color-text);
  font: inherit;
  padding: 5px 7px;
}

.site-cloud-sync__actions {
  justify-content: flex-end;
  gap: 6px;
}

@keyframes site-cloud-sync-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .site-cloud-sync__spinner {
    animation: none;
  }
}

@media (max-width: 640px) {
  .site-cloud-sync__toolbar,
  .site-cloud-sync__notice,
  .site-cloud-sync__brush-library {
    align-items: stretch;
    flex-direction: column;
  }

  .site-cloud-sync__row {
    grid-template-columns: minmax(0, 1fr) minmax(58px, auto) minmax(68px, auto);
  }

  .site-cloud-sync__row > :nth-child(3) {
    display: none;
  }
}
</style>

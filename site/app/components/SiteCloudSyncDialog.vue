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
  normalPlan: string
  quotaAvailable: string
  quotaUsed: string
  refresh: string
  remove: string
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
  syncBrushLibrary: []
  uploadCurrent: []
}>()

const pendingRemoveId = shallowRef<string>()

const canUseCloud = computed(() => props.isAuthenticated)
const isBusy = computed(() =>
  props.status === 'loading'
  || props.status === 'uploading'
  || props.status === 'finalizing'
  || props.status === 'downloading'
  || props.status === 'deleting',
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
    if (!open)
      pendingRemoveId.value = undefined
  },
)

function requestRemove(file: YunlefunCloudFile): void {
  if (pendingRemoveId.value === file.id) {
    emit('removeFile', file)
    pendingRemoveId.value = undefined
    return
  }

  pendingRemoveId.value = file.id
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
          :disabled="isBusy"
          @click="emit('refresh')"
        >
          <span class="i-ph-arrows-clockwise" />
          <span>{{ labels.refresh }}</span>
        </button>
        <button
          type="button"
          class="site-cloud-sync__button site-cloud-sync__button--primary"
          :disabled="!canUseCloud || isBusy"
          @click="emit('uploadCurrent')"
        >
          <span class="i-ph-cloud-arrow-up" />
          <span>{{ labels.uploadCurrent }}</span>
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

      <p v-if="statusLabel" class="site-cloud-sync__status">
        {{ statusLabel }}
      </p>
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
          :disabled="!canUseCloud || isBusy || isBrushLibraryBusy"
          @click="emit('syncBrushLibrary')"
        >
          <span class="i-ph-paint-brush" />
          <span>{{ labels.brushLibrarySync }}</span>
        </button>
      </section>

      <p v-if="brushLibraryStatusLabel" class="site-cloud-sync__status">
        {{ brushLibraryStatusLabel }}
      </p>
      <p v-if="brushLibraryErrorMessage" class="site-cloud-sync__error">
        {{ brushLibraryErrorMessage }}
      </p>

      <div class="site-cloud-sync__table" role="table">
        <div class="site-cloud-sync__row site-cloud-sync__row--head" role="row">
          <span role="columnheader">{{ labels.title }}</span>
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
          <span class="site-cloud-sync__name" role="cell">{{ file.name }}</span>
          <span role="cell">{{ formatBytes(file.size) }}</span>
          <span class="site-cloud-sync__date" role="cell">{{ formatDate(file.updatedAt) }}</span>
          <span class="site-cloud-sync__actions" role="cell">
            <button type="button" class="site-cloud-sync__icon-button" :disabled="isBusy" :title="labels.load" @click="emit('loadFile', file)">
              <span class="i-ph-cloud-arrow-down" />
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
  background: rgb(0 0 0 / 42%);
}

.site-cloud-sync__panel {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  width: min(760px, calc(100vw - 28px));
  max-height: min(680px, calc(100vh - 28px));
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 8px;
  background: rgb(20 20 22 / 96%);
  box-shadow: 0 24px 70px rgb(0 0 0 / 42%);
  color: white;
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
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 7%);
  color: white;
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
}

.site-cloud-sync__button--primary {
  border-color: rgb(94 234 212 / 28%);
  background: rgb(20 184 166 / 22%);
}

.site-cloud-sync__icon-button--danger:hover {
  border-color: rgb(255 128 128 / 34%);
  background: rgb(255 96 96 / 16%);
}

.site-cloud-sync__icon-button--danger.is-confirming {
  border-color: rgb(255 128 128 / 45%);
  background: rgb(255 96 96 / 22%);
  color: #ffe0e0;
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
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 72%);
}

.site-cloud-sync__brush-library {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: rgb(125 211 252 / 8%);
  color: rgb(255 255 255 / 78%);
}

.site-cloud-sync__brush-copy {
  min-width: 0;
}

.site-cloud-sync__subtitle {
  margin: 0 0 2px;
  color: rgb(255 255 255 / 92%);
  font-size: 13px;
}

.site-cloud-sync__brush-summary {
  margin: 0;
  font-size: 12px;
}

.site-cloud-sync__status {
  background: rgb(96 165 250 / 12%);
  color: rgb(191 219 254);
}

.site-cloud-sync__error {
  background: rgb(255 96 96 / 13%);
  color: #ffd5d5;
}

.site-cloud-sync__link {
  border: 0;
  background: transparent;
  color: rgb(125 211 252);
  font: inherit;
  text-decoration: none;
}

.site-cloud-sync__table {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
}

.site-cloud-sync__row {
  display: grid;
  grid-template-columns: minmax(140px, 1.4fr) minmax(72px, 0.5fr) minmax(132px, 0.9fr) minmax(74px, auto);
  min-height: 38px;
  align-items: center;
  gap: 12px;
  border-top: 1px solid rgb(255 255 255 / 8%);
  color: rgb(255 255 255 / 76%);
  font-size: 13px;
  padding: 7px 10px;
}

.site-cloud-sync__row:first-child {
  border-top: 0;
}

.site-cloud-sync__row--head {
  position: sticky;
  z-index: 1;
  top: 0;
  min-height: 30px;
  background: rgb(28 28 31 / 98%);
  color: rgb(255 255 255 / 46%);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
}

.site-cloud-sync__empty {
  color: rgb(255 255 255 / 46%);
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
  color: rgb(255 255 255 / 90%);
}

.site-cloud-sync__actions {
  justify-content: flex-end;
  gap: 6px;
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

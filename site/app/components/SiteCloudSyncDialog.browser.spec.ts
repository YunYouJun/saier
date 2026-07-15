import type { YunlefunBrushLibraryStatus } from '~/composables/useYunlefunBrushLibrary'
import type { YunlefunCloudFile, YunlefunCloudFileStatus } from '~/composables/useYunlefunCloudFiles'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import SiteCloudSyncDialog from './SiteCloudSyncDialog.vue'

const mounted: { unmount: () => void }[] = []

const labels = {
  brushLibrary: 'Brush library',
  brushLibraryCount: 'Brushes',
  brushLibraryEmpty: 'No synced custom brushes',
  brushLibrarySync: 'Sync brushes',
  brushLibrarySynced: 'Last synced',
  brushLibrarySyncing: 'Syncing brushes...',
  checkingQuota: 'Checking storage...',
  close: 'Close',
  confirmRemove: 'Delete this cloud file?',
  deleting: 'Deleting...',
  downloading: 'Loading...',
  empty: 'No cloud files yet',
  finalizing: 'Finalizing...',
  load: 'Load',
  loading: 'Loading files...',
  maxFileSize: 'File limit',
  memberPlan: 'Member storage',
  name: 'Name',
  normalPlan: 'Free storage',
  quotaAvailable: 'Available',
  quotaUsed: 'Used',
  recentFiles: 'Recent files',
  refresh: 'Refresh',
  renaming: 'Renaming...',
  rename: 'Rename',
  remove: 'Delete',
  saveRename: 'Save name',
  signIn: 'Sign in',
  signInRequired: 'Sign in to use shared cloud storage.',
  size: 'Size',
  title: 'Cloud sync',
  updated: 'Updated',
  uploadCurrent: 'Upload current',
  uploading: 'Uploading...',
}

const file = {
  app: 'saier',
  cloudPath: 'saier/project.saier.project.json',
  contentType: 'application/json',
  createdAt: 1,
  fileID: 'cloud-file-1',
  format: 'saier.project',
  id: 'project-1',
  kind: 'project',
  name: 'Project one',
  reservationId: 'reservation-1',
  size: 1024,
  updatedAt: 1,
  userId: 'user-1',
} satisfies YunlefunCloudFile

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function mountDialog() {
  const status = shallowRef<YunlefunCloudFileStatus>('idle')
  const brushLibraryStatus = shallowRef<YunlefunBrushLibraryStatus>('idle')
  const uploadProgress = shallowRef(0)
  const loadedFiles: YunlefunCloudFile[] = []
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp({
    setup() {
      return () => h(SiteCloudSyncDialog, {
        brushLibraryCount: 1,
        brushLibraryErrorMessage: '',
        brushLibraryLastSyncedAt: null,
        brushLibraryStatus: brushLibraryStatus.value,
        errorMessage: '',
        files: [file],
        isAuthenticated: true,
        isMember: false,
        labels,
        maxBytes: 200 * 1024 * 1024,
        onLoadFile: (value: YunlefunCloudFile) => loadedFiles.push(value),
        open: true,
        quota: null,
        status: status.value,
        uploadProgress: uploadProgress.value,
      })
    },
  })
  app.mount(el)

  const item = {
    brushLibraryStatus,
    el,
    loadedFiles,
    status,
    unmount: () => {
      app.unmount()
      el.remove()
    },
    uploadProgress,
  }
  mounted.push(item)
  return item
}

function buttonByTitle(root: ParentNode, title: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')]
    .find(item => item.getAttribute('title') === title)
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`missing button: ${title}`)
  return button
}

function panelHeight(root: ParentNode): number {
  const panel = root.querySelector('.site-cloud-sync__panel')
  if (!(panel instanceof HTMLElement))
    throw new Error('missing cloud sync panel')
  return panel.getBoundingClientRect().height
}

describe('site cloud sync dialog loading feedback', () => {
  it('shows project loading in the selected row without changing panel height', async () => {
    const { el, loadedFiles, status } = mountDialog()
    const initialHeight = panelHeight(el)
    const loadButton = buttonByTitle(el, labels.load)

    loadButton.click()
    await nextTick()

    expect(loadedFiles).toEqual([file])
    expect(loadButton.querySelector('.site-cloud-sync__spinner')).not.toBeNull()
    expect(panelHeight(el)).toBe(initialHeight)

    status.value = 'downloading'
    await nextTick()
    expect(panelHeight(el)).toBe(initialHeight)

    status.value = 'idle'
    await nextTick()
    expect(loadButton.querySelector('.site-cloud-sync__spinner')).toBeNull()
    expect(panelHeight(el)).toBe(initialHeight)
  })

  it('keeps upload and brush sync progress inside their buttons', async () => {
    const { brushLibraryStatus, el, status, uploadProgress } = mountDialog()
    const initialHeight = panelHeight(el)
    const uploadButton = el.querySelector('.site-cloud-sync__button--primary')
    if (!(uploadButton instanceof HTMLButtonElement))
      throw new TypeError('missing upload button')

    status.value = 'uploading'
    uploadProgress.value = 0.42
    await nextTick()

    expect(uploadButton.textContent).toContain('Uploading... 42%')
    expect(uploadButton.querySelector('.site-cloud-sync__spinner')).not.toBeNull()
    expect(el.querySelector('.site-cloud-sync__status')).toBeNull()
    expect(panelHeight(el)).toBe(initialHeight)

    status.value = 'idle'
    brushLibraryStatus.value = 'uploading'
    await nextTick()

    expect(el.textContent).toContain(labels.brushLibrarySyncing)
    expect(el.querySelectorAll('.site-cloud-sync__spinner')).toHaveLength(1)
    expect(panelHeight(el)).toBe(initialHeight)
  })
})

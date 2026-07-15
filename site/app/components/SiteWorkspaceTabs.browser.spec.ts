import type { SiteWorkspaceTab } from '~/types/activity-plugin'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SiteWorkspaceTabs from './SiteWorkspaceTabs.vue'

const mounted: Array<() => void> = []

afterEach(() => {
  for (const unmount of mounted.splice(0))
    unmount()
})

describe('site workspace tabs', () => {
  it('switches and closes document and activity tabs through the same public contract', async () => {
    const switched: SiteWorkspaceTab[] = []
    const closed: SiteWorkspaceTab[] = []
    const tabs: SiteWorkspaceTab[] = [
      {
        active: true,
        closeLabel: 'Close file',
        closeable: false,
        dirty: false,
        documentId: 'document-1',
        id: 'document:document-1',
        kind: 'document',
        subtitle: '1024 x 768',
        title: 'Canvas 1',
      },
      {
        active: false,
        closeLabel: 'Exit Pictionary',
        closeable: true,
        dirty: false,
        icon: 'i-ph-game-controller',
        id: 'activity:pictionary',
        kind: 'activity',
        pluginId: 'pictionary',
        subtitle: 'Room sr_1',
        title: 'Pictionary',
      },
    ]

    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
      render: () => h(SiteWorkspaceTabs, {
        disabled: false,
        labels: {
          newCanvas: 'New canvas',
          tabs: 'Workspaces',
          unsavedChangesTitle: 'Unsaved changes',
        },
        onClose: (tab: SiteWorkspaceTab) => closed.push(tab),
        onSwitch: (tab: SiteWorkspaceTab) => switched.push(tab),
        tabs,
      }),
    })
    app.mount(el)
    mounted.push(() => {
      app.unmount()
      el.remove()
    })
    await nextTick()

    const activityTab = Array.from(el.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
      .find(button => button.textContent?.includes('Pictionary'))
    if (!activityTab)
      throw new Error('missing activity workspace tab')
    activityTab.click()
    await nextTick()
    expect(switched).toEqual([tabs[1]])

    const close = el.querySelector<HTMLButtonElement>('[title="Exit Pictionary"]')
    if (!close)
      throw new Error('missing activity close action')
    close.click()
    await nextTick()
    expect(closed).toEqual([tabs[1]])
  })
})

import type { PainterDocumentState } from 'saier'
import type { SiteActivityPluginRequest } from '~/utils/activityPluginRoutes'
import { describe, expect, it } from 'vitest'
import { nextTick, shallowRef } from 'vue'
import { useSiteActivityWorkspace } from './useSiteActivityWorkspace'

function documentState(id: string, active: boolean): PainterDocumentState {
  return {
    active,
    dirty: false,
    height: 768,
    id,
    name: id,
    width: 1024,
  }
}

describe('site activity workspace', () => {
  it('keeps a mounted activity tab while users switch back to a document', async () => {
    const request = shallowRef<SiteActivityPluginRequest | null>({
      roomId: 'sr_room-1',
      type: 'pictionary',
    })
    const documents = shallowRef([documentState('Canvas 1', true)])
    const workspace = useSiteActivityWorkspace({
      activityRequest: request,
      closeDocumentLabel: 'Close file',
      documents,
      locale: 'en',
    })

    expect(workspace.activityActive.value).toBe(true)
    expect(workspace.activityMounted.value).toBe(true)
    expect(workspace.workspaceTabs.value).toEqual([
      expect.objectContaining({ active: false, kind: 'document', title: 'Canvas 1' }),
      expect.objectContaining({ active: true, kind: 'activity', subtitle: 'Room sr_room-1' }),
    ])

    workspace.showDocument()
    expect(workspace.activityActive.value).toBe(false)
    expect(workspace.activityMounted.value).toBe(true)
    expect(workspace.workspaceTabs.value[0]).toEqual(expect.objectContaining({ active: true }))
    expect(workspace.workspaceTabs.value[1]).toEqual(expect.objectContaining({ active: false }))

    workspace.showActivity()
    expect(workspace.activityActive.value).toBe(true)

    request.value = null
    await nextTick()
    expect(workspace.activityMounted.value).toBe(false)
    expect(workspace.activityActive.value).toBe(false)
    expect(workspace.workspaceTabs.value).toHaveLength(1)
  })

  it('derives the activity menu and localized temporary tab from manifests', () => {
    const request = shallowRef<SiteActivityPluginRequest | null>({ type: 'pictionary' })
    const locale = shallowRef<'en' | 'zh'>('zh')
    const workspace = useSiteActivityWorkspace({
      activityRequest: request,
      closeDocumentLabel: '关闭文件',
      documents: [documentState('画布 1', true)],
      locale,
    })

    expect(workspace.activityMenuItems.value).toEqual([
      { icon: 'i-ph-game-controller', id: 'pictionary', label: '你画我猜...' },
    ])
    expect(workspace.workspaceTabs.value[1]).toEqual(expect.objectContaining({
      closeLabel: '退出你画我猜',
      subtitle: '活动大厅',
      title: '你画我猜',
    }))
  })
})

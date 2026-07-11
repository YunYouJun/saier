import type {
  SetRoomMemberRoleOptions,
  SetRoomModeOptions,
  YunlefunCloudRoomSession,
} from '~/composables/useYunlefunCloudRooms'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SiteCloudRoomOwnerPanel from './SiteCloudRoomOwnerPanel.vue'

const mounted: { unmount: () => void }[] = []

const labels = {
  driverEditor: 'Driver editor',
  members: 'Members',
  modeDriver: 'Driver',
  modeMultiEditor: 'Multi-editor',
  modeViewer: 'Viewer',
  noEditorAvailable: 'Promote a member to editor before using driver mode.',
  ownerTools: 'Owner controls',
  roleEditor: 'Editor',
  roleOwner: 'Owner',
  roleViewer: 'Viewer',
  roomMode: 'Room mode',
  saveRoomMode: 'Save mode',
  setRoleEditor: 'Set as editor',
  setRoleViewer: 'Set as viewer',
}

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function mountOwnerPanel(options: {
  disabled?: boolean
  session?: YunlefunCloudRoomSession
} = {}) {
  const memberRoles: SetRoomMemberRoleOptions[] = []
  const roomModes: SetRoomModeOptions[] = []
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp({
    setup() {
      return () => h(SiteCloudRoomOwnerPanel, {
        disabled: options.disabled ?? false,
        labels,
        onSetMemberRole: (payload: SetRoomMemberRoleOptions) => memberRoles.push(payload),
        onSetRoomMode: (payload: SetRoomModeOptions) => roomModes.push(payload),
        session: options.session ?? createSession(),
      })
    },
  })
  app.mount(el)

  const item = {
    el,
    memberRoles,
    roomModes,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

function createSession(options: {
  driverUserId?: string
  members?: YunlefunCloudRoomSession['members']
  mode?: YunlefunCloudRoomSession['room']['mode']
} = {}): YunlefunCloudRoomSession {
  return {
    members: options.members ?? [
      {
        displayName: 'Owner',
        lastSeenAt: 1,
        online: true,
        role: 'owner',
        roomId: 'room-a',
        userId: 'owner',
      },
      {
        displayName: 'Viewer',
        lastSeenAt: 1,
        online: true,
        role: 'viewer',
        roomId: 'room-a',
        userId: 'user-b',
      },
      {
        displayName: 'Editor',
        lastSeenAt: 1,
        online: true,
        role: 'editor',
        roomId: 'room-a',
        userId: 'user-c',
      },
    ],
    readOnly: false,
    role: 'owner',
    room: {
      createdAt: 1,
      driverUserId: options.driverUserId,
      headRevision: 0,
      id: 'room-a',
      latestSnapshotRevision: 0,
      mode: options.mode ?? 'viewer',
      ownerUserId: 'owner',
      title: 'Room A',
      updatedAt: 1,
      visibility: 'link',
    },
    shareUrl: 'https://example.test/?room=room-a',
  }
}

function buttonByTitle(root: ParentNode, title: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')]
    .find(item => item.getAttribute('title') === title)
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`missing button: ${title}`)
  return button
}

function roleButton(root: ParentNode, userId: string, role: 'editor' | 'viewer'): HTMLButtonElement {
  const button = root.querySelector(`[data-user-id="${userId}"] button[data-role="${role}"]`)
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`missing role button: ${userId}/${role}`)
  return button
}

describe('site cloud room owner panel', () => {
  it('emits member role changes for non-owner members', async () => {
    const { el, memberRoles } = mountOwnerPanel()

    roleButton(el, 'user-b', 'editor').click()
    await nextTick()

    expect(memberRoles).toEqual([
      {
        role: 'editor',
        userId: 'user-b',
      },
    ])
  })

  it('emits driver mode with the selected editor', async () => {
    const { el, roomModes } = mountOwnerPanel()

    buttonByTitle(el, 'Driver').click()
    await nextTick()
    buttonByTitle(el, 'Save mode').click()
    await nextTick()

    expect(roomModes).toEqual([
      {
        driverUserId: 'user-c',
        mode: 'driver',
      },
    ])
  })

  it('keeps driver mode save disabled until an editor exists', async () => {
    const session = createSession({
      members: [
        {
          displayName: 'Owner',
          lastSeenAt: 1,
          online: true,
          role: 'owner',
          roomId: 'room-a',
          userId: 'owner',
        },
        {
          displayName: 'Viewer',
          lastSeenAt: 1,
          online: true,
          role: 'viewer',
          roomId: 'room-a',
          userId: 'user-b',
        },
      ],
    })
    const { el } = mountOwnerPanel({ session })

    buttonByTitle(el, 'Driver').click()
    await nextTick()

    expect(buttonByTitle(el, 'Save mode').disabled).toBe(true)
  })
})

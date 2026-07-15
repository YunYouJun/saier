import type { PictionaryPlayer } from '@saier/collaboration'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, shallowRef } from 'vue'
import { useSiteI18n } from '~/composables/useSiteI18n'
import PictionaryCreateRoomCard from './PictionaryCreateRoomCard.vue'
import PictionaryJoinRoomCard from './PictionaryJoinRoomCard.vue'
import PictionaryRoomLobby from './PictionaryRoomLobby.vue'
import PictionaryRoomToolbar from './PictionaryRoomToolbar.vue'
import PictionaryScoreboard from './PictionaryScoreboard.vue'
import '~/assets/activity.css'
import '~/assets/theme.css'

const mounted: Array<() => void> = []
const { setLocale } = useSiteI18n()

afterEach(() => {
  for (const unmount of mounted.splice(0))
    unmount()
  setLocale('zh')
})

function mount(render: () => ReturnType<typeof h>, theme: 'dark' | 'light' = 'light'): HTMLElement {
  const el = document.createElement('div')
  el.className = theme
  document.body.appendChild(el)
  const app = createApp({ render })
  app.mount(el)
  mounted.push(() => {
    app.unmount()
    el.remove()
  })
  return el
}

describe('pictionary editor UI', () => {
  it('inherits editor density and switches its local copy with the global locale', async () => {
    setLocale('en')
    const title = shallowRef('Weekend room')
    const customWords = shallowRef('')
    const joinTarget = shallowRef('')
    const el = mount(() => h('main', { class: 'site-activity-surface' }, [
      h(PictionaryCreateRoomCard, {
        ...{
          busy: false,
          customWords: customWords.value,
          error: 'Create error',
          title: title.value,
        },
        'onUpdate:title': value => title.value = value,
        'onUpdate:customWords': value => customWords.value = value,
      }),
      h(PictionaryJoinRoomCard, {
        ...{
          error: 'Join error',
          modelValue: joinTarget.value,
        },
        'onUpdate:modelValue': value => joinTarget.value = value,
      }),
    ]), 'dark')

    const panel = el.querySelector<HTMLElement>('.site-activity-panel')!
    const control = el.querySelector<HTMLElement>('.site-activity-control')!
    const primaryButton = el.querySelector<HTMLElement>('.site-activity-button.is-primary')!
    expect(getComputedStyle(panel).borderRadius).toBe('8px')
    expect(getComputedStyle(control).minHeight).toBe('36px')
    expect(getComputedStyle(primaryButton).backgroundColor).toBe('rgba(96, 165, 250, 0.15)')
    expect(el.textContent).toContain('Create room')
    expect(el.textContent).toContain('Join game')
    expect(el.querySelector('[aria-describedby="pictionary-create-error"]')).not.toBeNull()
    expect(el.querySelector('[aria-describedby="pictionary-join-error"]')).not.toBeNull()

    el.className = 'light'
    expect(getComputedStyle(primaryButton).backgroundColor).toBe('rgba(37, 99, 235, 0.12)')

    setLocale('zh')
    await nextTick()
    expect(el.textContent).toContain('创建房间')
    expect(el.textContent).toContain('加入游戏')
    expect(el.textContent).not.toContain('返回 Saier')
    expect(el.textContent).not.toContain('退出插件')
  })

  it('keeps room controls presentational and exposes only game actions', async () => {
    setLocale('zh')
    const players: PictionaryPlayer[] = [
      { joinedAt: 1, muted: false, online: true, score: 10, status: 'active', userId: 'host-user' },
      { joinedAt: 2, muted: false, online: true, score: 5, status: 'active', userId: 'guest-user' },
    ]
    const cycles = shallowRef<1 | 2 | 3 | 4 | 5>(2)
    const duration = shallowRef<60_000 | 90_000 | 120_000>(90_000)
    let inviteCount = 0
    let startCount = 0
    const el = mount(() => h('main', { class: 'site-activity-surface' }, [
      h(PictionaryRoomToolbar, {
        transportLabel: '实时链路 · open',
        onInvite: () => inviteCount++,
      }),
      h(PictionaryRoomLobby, {
        ...{
          busy: false,
          cycles: cycles.value,
          duration: duration.value,
          hostId: 'host-user',
          isHost: true,
          onInvite: () => inviteCount++,
          onStart: () => startCount++,
          players,
        },
        'onUpdate:cycles': value => cycles.value = value,
        'onUpdate:duration': value => duration.value = value,
      }),
      h(PictionaryScoreboard, {
        currentUserId: 'host-user',
        isHost: true,
        players,
        warning: '',
      }),
    ]))

    const buttons = [...el.querySelectorAll<HTMLButtonElement>('button')]
    buttons.find(button => button.textContent?.includes('邀请'))?.click()
    buttons.find(button => button.textContent?.includes('开始游戏'))?.click()
    expect(inviteCount).toBe(1)
    expect(startCount).toBe(1)
    expect(el.textContent).toContain('房主')
    expect(el.textContent).toContain('计分板')
    expect(el.textContent).not.toContain('退出')

    setLocale('en')
    await nextTick()
    expect(el.textContent).toContain('Host')
    expect(el.textContent).toContain('Scoreboard')
  })
})

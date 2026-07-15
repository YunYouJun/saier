import type { Component } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, onBeforeUnmount } from 'vue'
import SiteActivityPluginHost from './SiteActivityPluginHost.vue'

const mounted: Array<() => void> = []

afterEach(() => {
  for (const unmount of mounted.splice(0))
    unmount()
})

async function flushPluginLoad(): Promise<void> {
  await Promise.resolve()
  await nextTick()
}

describe('site activity plugin host', () => {
  it('loads the selected plugin only when the host mounts and forwards exit', async () => {
    let loadCount = 0
    let disposeCount = 0
    let exitCount = 0
    const plugin: Component = {
      props: ['roomId', 'inviteToken'],
      setup(props, { emit }) {
        onBeforeUnmount(() => disposeCount++)
        return () => h('button', {
          class: 'fake-activity-plugin',
          onClick: () => emit('exit'),
        }, `${props.roomId}:${props.inviteToken}`)
      },
    }
    const loadPlugin = () => async () => {
      loadCount++
      return { default: plugin }
    }
    expect(loadCount).toBe(0)

    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
      render: () => h(SiteActivityPluginHost, {
        loadPlugin,
        onExit: () => exitCount++,
        request: { inviteToken: 'token-1', roomId: 'room-1', type: 'pictionary' },
      }),
    })
    app.mount(el)
    mounted.push(() => {
      app.unmount()
      el.remove()
    })
    await flushPluginLoad()

    expect(loadCount).toBe(1)
    expect(el.querySelector('.fake-activity-plugin')?.textContent).toBe('room-1:token-1')
    const pluginButton = el.querySelector('.fake-activity-plugin') as HTMLButtonElement
    pluginButton.click()
    expect(exitCount).toBe(1)

    mounted.pop()?.()
    expect(disposeCount).toBe(1)
  })

  it('does not attempt to render an unknown plugin', async () => {
    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
      render: () => h(SiteActivityPluginHost, {
        loadPlugin: () => undefined,
        request: { roomId: 'room-1', type: 'pictionary' },
      }),
    })
    app.mount(el)
    mounted.push(() => {
      app.unmount()
      el.remove()
    })
    await flushPluginLoad()

    expect(el.getAttribute('role') ?? el.querySelector('[role="alert"]')?.getAttribute('role')).toBe('alert')
    expect(el.textContent).toContain('这个 Activity 插件不可用')
  })
})

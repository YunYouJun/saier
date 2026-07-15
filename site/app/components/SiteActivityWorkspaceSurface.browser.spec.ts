import type { Component } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick, onBeforeUnmount, shallowRef } from 'vue'
import SiteActivityWorkspaceSurface from './SiteActivityWorkspaceSurface.vue'

const mounted: Array<() => void> = []

afterEach(() => {
  for (const unmount of mounted.splice(0))
    unmount()
})

async function flushPluginLoad(): Promise<void> {
  await Promise.resolve()
  await nextTick()
}

describe('site activity workspace surface', () => {
  it('keeps the activity mounted while a document is active and disposes it when closed', async () => {
    let loadCount = 0
    let disposeCount = 0
    const active = shallowRef(true)
    const request = shallowRef<{ roomId: string, type: 'pictionary' } | null>({
      roomId: 'sr_room-1',
      type: 'pictionary',
    })
    const plugin: Component = {
      setup() {
        onBeforeUnmount(() => disposeCount++)
        return () => h('div', { class: 'fake-activity' }, 'Activity canvas')
      },
    }
    const loadPlugin = () => async () => {
      loadCount++
      return { default: plugin }
    }

    const el = document.createElement('div')
    document.body.appendChild(el)
    const app = createApp({
      render: () => h(SiteActivityWorkspaceSurface, {
        active: active.value,
        loadPlugin,
        request: request.value,
      }, {
        document: () => h('div', { class: 'fake-document' }, 'Main canvas'),
      }),
    })
    app.mount(el)
    mounted.push(() => {
      app.unmount()
      el.remove()
    })
    await flushPluginLoad()

    expect(loadCount).toBe(1)
    expect(disposeCount).toBe(0)
    expect(el.querySelector('.fake-activity')?.textContent).toBe('Activity canvas')

    active.value = false
    await nextTick()
    expect(disposeCount).toBe(0)
    expect(el.querySelector('.fake-activity')).not.toBeNull()
    expect(getComputedStyle(el.querySelector<HTMLElement>('.site-workspace-surface__activity')!).display).toBe('none')

    request.value = null
    await nextTick()
    expect(disposeCount).toBe(1)
    expect(el.querySelector('.fake-activity')).toBeNull()
    expect(el.querySelector('.fake-document')?.textContent).toBe('Main canvas')
  })
})

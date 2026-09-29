import type { PictionaryAiHandoff } from './ai-handoff'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, effectScope, h, nextTick, shallowRef } from 'vue'
import { useSiteI18n } from '~/composables/useSiteI18n'
import { createPictionaryAiHandoff } from './ai-handoff'
import { usePictionaryI18n } from './i18n'
import PictionaryAiHandoffControl from './PictionaryAiHandoff.vue'
import { usePictionaryAiRemix } from './usePictionaryAiRemix'
import '~/assets/activity.css'
import '~/assets/theme.css'

const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose())
  vi.restoreAllMocks()
})

function fixture(extract?: () => Promise<HTMLCanvasElement>) {
  const source = document.createElement('canvas')
  source.width = 1024
  source.height = 768
  const context = source.getContext('2d')!
  context.fillStyle = '#0000ff'
  context.fillRect(0, 0, 1024, 768)
  context.fillStyle = '#ff0000'
  context.fillRect(128, 64, 256, 256)
  const publicState = shallowRef({ phase: 'drawing', round: { roundId: 'round-1', aiRemixUsed: false } })
  const canUse = shallowRef(true)
  const requestAiRemix = vi.fn()
  const requireRoundState = vi.fn()
  const extractCanvas = vi.fn(extract ?? (async () => source))
  const scope = effectScope()
  cleanup.push(() => scope.stop())
  const remix = scope.run(() => usePictionaryAiRemix({
    activities: { publicState, requestAiRemix },
    canvasContainerRef: shallowRef(null),
    canUse: computed(() => canUse.value),
    getPainter: () => ({ extractCanvas }),
    requireRoundState,
    syncAuthority: vi.fn(),
    text: usePictionaryI18n().text,
  } as unknown as Parameters<typeof usePictionaryAiRemix>[0]))!
  remix.selection.value = { x: 128, y: 64, width: 256, height: 256 }
  return { canUse, extractCanvas, publicState, remix, requestAiRemix, requireRoundState, source }
}

describe('manual ChatGPT image handoff', () => {
  it('exports only selected pixels without reserving a paid generation or reading the answer', async () => {
    const { remix, requestAiRemix, requireRoundState } = fixture()
    await remix.prepareHandoff()
    const handoff = remix.handoff.value!
    const blob = await (await fetch(handoff.imageDataUrl)).blob()
    const image = await createImageBitmap(blob)
    try {
      expect([image.width, image.height]).toEqual([512, 512])
      const result = document.createElement('canvas')
      result.width = result.height = 512
      const context = result.getContext('2d')!
      context.drawImage(image, 0, 0)
      expect(Array.from(context.getImageData(256, 256, 1, 1).data)).toEqual([255, 0, 0, 255])
      expect(handoff.prompt).toContain('Clean up the lines')
      expect(Object.keys(handoff).sort()).toEqual(['imageDataUrl', 'prompt'])
      expect(requestAiRemix).not.toHaveBeenCalled()
      expect(requireRoundState).not.toHaveBeenCalled()
    }
    finally {
      image.close()
    }
  })

  it('discards an in-flight snapshot after the round changes and clears prepared data on effect changes', async () => {
    let finish!: (canvas: HTMLCanvasElement) => void
    const { remix, publicState, source } = fixture(() => new Promise((resolve) => {
      finish = resolve
    }))
    const preparing = remix.prepareHandoff()
    publicState.value = { phase: 'drawing', round: { roundId: 'round-2', aiRemixUsed: false } }
    finish(source)
    await preparing
    expect(remix.handoff.value).toBeUndefined()
    expect(remix.handoffBusy.value).toBe(false)

    const next = fixture()
    await next.remix.prepareHandoff()
    expect(next.remix.handoff.value).toBeDefined()
    next.remix.effect.value = 'texture'
    expect(next.remix.handoff.value).toBeUndefined()
    next.canUse.value = false
    await next.remix.prepareHandoff()
    expect(next.extractCanvas).toHaveBeenCalledTimes(1)
  })

  it('provides a local download and a plain ChatGPT link, with a readable clipboard fallback', async () => {
    useSiteI18n().setLocale('zh')
    const { source } = fixture()
    const handoff = shallowRef<PictionaryAiHandoff>()
    const disabled = shallowRef(true)
    const prepare = vi.fn(() => {
      handoff.value = createPictionaryAiHandoff(source.toDataURL(), 'texture')
    })
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(PictionaryAiHandoffControl, {
      disabled: disabled.value,
      handoff: handoff.value,
      onPrepare: prepare,
    }) })
    app.mount(host)
    cleanup.push(() => {
      app.unmount()
      host.remove()
    })
    host.querySelector('details')!.open = true
    host.querySelector<HTMLButtonElement>('button')!.click()
    expect(prepare).not.toHaveBeenCalled()
    disabled.value = false
    await nextTick()
    host.querySelector<HTMLButtonElement>('button')!.click()
    await nextTick()
    expect(host.querySelector('a[download]')?.getAttribute('href')).toBe(handoff.value!.imageDataUrl)
    const link = host.querySelector<HTMLAnchorElement>('a[target="_blank"]')!
    expect(link.href).toBe('https://chatgpt.com/')
    expect(link.rel).toBe('noopener noreferrer')
    expect(host.textContent).toContain('不会自动贴回')
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    host.querySelectorAll<HTMLButtonElement>('button')[1]!.click()
    await vi.waitFor(() => expect(host.querySelector('[role="status"]')?.textContent).toContain('复制失败'))
    const prompt = host.querySelector('textarea')!
    expect(prompt.readOnly).toBe(true)
    expect(prompt.value).toBe(handoff.value!.prompt)
    handoff.value = undefined
    await nextTick()
    expect(host.querySelector('a')).toBeNull()
  })
})

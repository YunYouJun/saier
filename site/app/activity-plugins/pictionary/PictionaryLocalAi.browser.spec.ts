import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, effectScope, h, nextTick, shallowRef } from 'vue'
import { useSiteI18n } from '~/composables/useSiteI18n'
import { usePictionaryI18n } from './i18n'
import { normalizeLocalAiImage } from './local-ai-client'
import PictionaryLocalAi from './PictionaryLocalAi.vue'
import { usePictionaryAiRemix } from './usePictionaryAiRemix'

const cleanup: Array<() => void> = []
afterEach(() => {
  cleanup.splice(0).forEach(dispose => dispose())
  vi.restoreAllMocks()
})

function coloredCanvas(size: number, color: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const context = canvas.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, size, size)
  return canvas
}

async function inspectImage(dataUrl: string) {
  const bytes = Uint8Array.from(atob(dataUrl.split(',')[1]!), character => character.charCodeAt(0))
  const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
  const canvas = coloredCanvas(bitmap.width, 'white')
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0)
  const info = { size: [bitmap.width, bitmap.height], pixel: Array.from(canvas.getContext('2d')!.getImageData(256, 256, 1, 1).data) }
  bitmap.close()
  return info
}

function fixture() {
  const source = coloredCanvas(1024, '#0000ff')
  source.getContext('2d')!.fillStyle = '#ff0000'
  source.getContext('2d')!.fillRect(128, 64, 256, 256)
  const publicState = shallowRef({ phase: 'drawing', phaseEpoch: 4, controllerEpoch: 2, round: { roundId: 'round-1', aiRemixUsed: false } })
  const canUse = shallowRef(true)
  const requestAiRemix = vi.fn()
  const importLocalAiRemix = vi.fn().mockResolvedValue({ outcome: 'applied', fileId: 'cloud://env/result.png' })
  const syncAuthority = vi.fn()
  const scope = effectScope()
  cleanup.push(() => scope.stop())
  const remix = scope.run(() => usePictionaryAiRemix({
    activities: { publicState, requestAiRemix, importLocalAiRemix },
    canvasContainerRef: shallowRef(null),
    canUse: computed(() => canUse.value),
    getPainter: () => ({ extractCanvas: async () => source }),
    requireRoundState: () => ({ activityEpoch: 3, sessionId: 'session-1', state: publicState.value }),
    syncAuthority,
    text: usePictionaryI18n().text,
  } as unknown as Parameters<typeof usePictionaryAiRemix>[0]))!
  remix.selection.value = { x: 128, y: 64, width: 256, height: 256 }
  remix.localAi.pairingCode.value = 'a'.repeat(64)
  return { canUse, importLocalAiRemix, publicState, remix, requestAiRemix, syncAuthority }
}

describe('local Codex remix workflow', () => {
  it('sends only the selected pixels and effect, previews a normalized image, and applies through authority only on request', async () => {
    const output = coloredCanvas(1024, '#00ff00').toDataURL()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ imageDataUrl: output }))
    const game = fixture()
    await game.remix.localAi.generate()
    const [url, options] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://127.0.0.1:47832/generate')
    expect(options).toMatchObject({ credentials: 'omit', redirect: 'error', headers: { Authorization: `Bearer ${'a'.repeat(64)}` } })
    const body = JSON.parse(String(options!.body))
    expect(Object.keys(body).sort()).toEqual(['effect', 'imageDataUrl'])
    expect(await inspectImage(body.imageDataUrl)).toEqual({ size: [512, 512], pixel: [255, 0, 0, 255] })
    const result = game.remix.localAi.result.value
    expect(await inspectImage(result)).toEqual({ size: [512, 512], pixel: [0, 255, 0, 255] })
    expect(game.importLocalAiRemix).not.toHaveBeenCalled()
    expect(game.requestAiRemix).not.toHaveBeenCalled()
    await game.remix.localAi.apply()
    expect(game.importLocalAiRemix).toHaveBeenCalledExactlyOnceWith({
      activityEpoch: 3,
      commandId: expect.any(String),
      controllerEpoch: 2,
      effect: 'polish',
      phaseEpoch: 4,
      rect: { x: 128, y: 64, width: 256, height: 256 },
      referenceImageDataUrl: result,
      roundId: 'round-1',
      sessionId: 'session-1',
    })
    expect(game.syncAuthority).toHaveBeenCalledOnce()
    expect(game.remix.localAi.result.value).toBe('')
    await game.remix.localAi.apply()
    expect(game.importLocalAiRemix).toHaveBeenCalledOnce()
  })

  it.each(['round', 'controller', 'permission', 'cancel'])('aborts and discards late results after %s changes', async (change) => {
    let finish!: (response: Response) => void
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise((resolve) => {
      finish = resolve
    }))
    const game = fixture()
    const generation = game.remix.localAi.generate()
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    if (change === 'round')
      game.publicState.value = { ...game.publicState.value, round: { roundId: 'round-2', aiRemixUsed: false } }
    else if (change === 'controller')
      game.publicState.value = { ...game.publicState.value, controllerEpoch: 3 }
    else if (change === 'permission')
      game.canUse.value = false
    else
      game.remix.localAi.cancel()
    expect(fetchMock.mock.calls[0]![1]!.signal!.aborted).toBe(true)
    finish(Response.json({ imageDataUrl: coloredCanvas(512, 'green').toDataURL() }))
    await generation
    await game.remix.localAi.apply()
    expect(game.remix.localAi.result.value).toBe('')
    expect(game.remix.localAi.busy.value).toBe(false)
    expect(game.importLocalAiRemix).not.toHaveBeenCalled()
  })

  it('keeps a downloadable preview on import failure and rejects remote URLs and malformed pixels', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ imageDataUrl: coloredCanvas(512, 'green').toDataURL() }))
    const game = fixture()
    await game.remix.localAi.generate()
    game.importLocalAiRemix.mockRejectedValue(new Error('disabled'))
    await game.remix.localAi.apply()
    expect(game.remix.localAi.result.value).toContain('data:image/png;base64,')
    expect(game.remix.localAi.message.value).not.toBe('')
    expect(game.syncAuthority).toHaveBeenCalledOnce()
    await expect(normalizeLocalAiImage('https://untrusted.invalid/image.png')).rejects.toThrow()
    await expect(normalizeLocalAiImage('data:image/png;base64,aW1hZ2U=')).rejects.toThrow()
    await expect(normalizeLocalAiImage(coloredCanvas(32, 'red').toDataURL())).rejects.toThrow()
    game.remix.effect.value = 'texture'
    expect(game.remix.localAi.result.value).toBe('')
  })

  it('renders pairing, a preview download, and an explicit apply button with disabled states', async () => {
    useSiteI18n().setLocale('zh')
    const disabled = shallowRef(true)
    const apply = vi.fn()
    const generate = vi.fn()
    const result = coloredCanvas(512, 'green').toDataURL()
    const host = document.createElement('div')
    document.body.append(host)
    const app = createApp({ render: () => h(PictionaryLocalAi, {
      applying: false,
      busy: false,
      disabled: disabled.value,
      message: '',
      onApply: apply,
      onGenerate: generate,
      pairingCode: 'a'.repeat(64),
      port: 47832,
      result,
    }) })
    app.mount(host)
    cleanup.push(() => {
      app.unmount()
      host.remove()
    })
    host.querySelector('details')!.open = true
    expect(host.querySelector('input[type="password"]')?.getAttribute('autocomplete')).toBe('off')
    expect(host.querySelector('a[download]')?.getAttribute('href')).toBe(result)
    const buttons = host.querySelectorAll<HTMLButtonElement>('button')
    buttons[0]!.click()
    buttons[1]!.click()
    expect(generate).not.toHaveBeenCalled()
    expect(apply).not.toHaveBeenCalled()
    disabled.value = false
    await nextTick()
    buttons[0]!.click()
    buttons[1]!.click()
    expect(generate).toHaveBeenCalledOnce()
    expect(apply).toHaveBeenCalledOnce()
  })
})

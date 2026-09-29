import type { PictionaryAiEffect } from '@saier/collaboration'
import type { ComputedRef } from 'vue'
import type { PictionaryMessages } from './i18n'
import { onScopeDispose, shallowRef, watch } from 'vue'
import { requestLocalAiImage } from './local-ai-client'

export interface LocalAiSnapshot {
  imageDataUrl: string
  effect: PictionaryAiEffect
  activityEpoch: number
  commandId: string
  controllerEpoch: number
  phaseEpoch: number
  rect: { x: number, y: number, width: number, height: number }
  roundId: string
  sessionId: string
}

interface Options {
  canUse: ComputedRef<boolean>
  capture: () => Promise<LocalAiSnapshot>
  importImage: (snapshot: LocalAiSnapshot, imageDataUrl: string) => Promise<void>
  scopeKey: ComputedRef<string>
  text: ComputedRef<PictionaryMessages>
}

/** Keep the local generation separate from the authoritative apply transaction. */
export function usePictionaryLocalAi(options: Options) {
  const pairingCode = shallowRef('')
  const port = shallowRef(47832)
  const busy = shallowRef(false)
  const applying = shallowRef(false)
  const result = shallowRef('')
  const message = shallowRef('')
  let snapshot: LocalAiSnapshot | undefined
  let controller: AbortController | undefined
  let revision = 0

  function cancel(): void {
    revision++
    controller?.abort()
    controller = undefined
    busy.value = false
  }

  function reset(): void {
    cancel()
    result.value = ''
    snapshot = undefined
    message.value = ''
  }
  watch(options.scopeKey, reset, { flush: 'sync' })
  onScopeDispose(() => {
    reset()
    pairingCode.value = ''
  })

  async function generate(): Promise<void> {
    if (!options.canUse.value || busy.value || applying.value)
      return
    reset()
    const ownRevision = revision
    const abort = new AbortController()
    controller = abort
    busy.value = true
    const timer = setTimeout(() => abort.abort(), 250_000)
    try {
      const captured = await options.capture()
      abort.signal.throwIfAborted()
      const image = await requestLocalAiImage({
        effect: captured.effect,
        imageDataUrl: captured.imageDataUrl,
        pairingCode: pairingCode.value.trim(),
        port: port.value,
        signal: abort.signal,
      })
      if (ownRevision !== revision || abort.signal.aborted)
        return
      snapshot = captured
      result.value = image
    }
    catch {
      if (ownRevision === revision)
        message.value = options.text.value.room.aiLocalFailed
    }
    finally {
      clearTimeout(timer)
      if (ownRevision === revision) {
        busy.value = false
        controller = undefined
      }
    }
  }

  async function apply(): Promise<void> {
    if (!options.canUse.value || !snapshot || !result.value || busy.value || applying.value)
      return
    const ownRevision = revision
    const captured = snapshot
    const image = result.value
    applying.value = true
    message.value = ''
    try {
      await options.importImage(captured, image)
      if (ownRevision === revision)
        reset()
    }
    catch {
      if (ownRevision === revision)
        message.value = options.text.value.room.aiLocalApplyFailed
    }
    finally {
      applying.value = false
    }
  }

  return { apply, applying, busy, cancel, generate, message, pairingCode, port, result }
}

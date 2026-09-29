import type {
  PictionaryAiCanvasPatch,
  PictionaryAiEffect,
  PictionaryAiRect,
  PictionaryPublicState,
} from '@saier/collaboration'
import type { Painter } from 'saier'
import type { ComputedRef, DeepReadonly, ShallowRef } from 'vue'
import type { PictionaryAiHandoff } from './ai-handoff'
import type { PictionaryMessages } from './i18n'
import type { useYunlefunRoomActivities } from '~/composables/useYunlefunRoomActivities'
import { importImagePixels } from 'saier'
import { computed, onScopeDispose, shallowRef, watch } from 'vue'
import { createPictionaryAiHandoff } from './ai-handoff'
import { usePictionaryLocalAi } from './usePictionaryLocalAi'

interface PictionaryRoundContext {
  activityEpoch: number
  sessionId: string
  state: DeepReadonly<PictionaryPublicState>
}

interface UsePictionaryAiRemixOptions {
  activities: ReturnType<typeof useYunlefunRoomActivities>
  canvasContainerRef: Readonly<ShallowRef<HTMLDivElement | null>>
  canUse: ComputedRef<boolean>
  getPainter: () => Painter | undefined
  requireRoundState: () => PictionaryRoundContext
  syncAuthority: () => Promise<void>
  text: ComputedRef<PictionaryMessages>
}

export function usePictionaryAiRemix(options: UsePictionaryAiRemixOptions) {
  const effect = shallowRef<PictionaryAiEffect>('polish')
  const selection = shallowRef<PictionaryAiRect>()
  const selectionStart = shallowRef<{ x: number, y: number }>()
  const selecting = shallowRef(false)
  const requestBusy = shallowRef(false)
  const message = shallowRef('')
  const bonusUrl = shallowRef('')
  const detachedBonus = shallowRef(false)
  const handoff = shallowRef<PictionaryAiHandoff>()
  const handoffBusy = shallowRef(false)
  let handoffRevision = 0
  const pending = computed(() => requestBusy.value
    || options.activities.publicState.value?.round?.aiRemix?.status === 'pending')
  const used = computed(() => options.activities.publicState.value?.round?.aiRemixUsed ?? false)

  function invalidateHandoff(): void {
    handoffRevision++
    handoff.value = undefined
  }

  watch([
    () => options.activities.publicState.value?.round?.roundId,
    () => options.activities.publicState.value?.phase,
    selection,
    effect,
    options.canUse,
    pending,
    used,
  ], invalidateHandoff, { flush: 'sync' })
  onScopeDispose(invalidateHandoff)

  const localAi = usePictionaryLocalAi({
    canUse: computed(() => options.canUse.value && !!selection.value && !pending.value && !used.value && !handoffBusy.value),
    scopeKey: computed(() => JSON.stringify([
      options.activities.publicState.value?.round?.roundId,
      options.activities.publicState.value?.phaseEpoch,
      options.activities.publicState.value?.controllerEpoch,
      options.canUse.value,
      used.value,
      selection.value,
      effect.value,
    ])),
    text: options.text,
    async capture() {
      const painter = options.getPainter()
      const rect = selection.value && { ...selection.value }
      if (!painter || !rect)
        throw new Error('No selection')
      const current = options.requireRoundState()
      const context = {
        activityEpoch: current.activityEpoch,
        commandId: crypto.randomUUID(),
        controllerEpoch: current.state.controllerEpoch ?? 1,
        effect: effect.value,
        phaseEpoch: current.state.phaseEpoch,
        rect,
        roundId: current.state.round!.roundId,
        sessionId: current.sessionId,
      }
      return { ...context, imageDataUrl: await createReferenceImage(painter, rect) }
    },
    async importImage(snapshot, imageDataUrl) {
      requestBusy.value = true
      message.value = ''
      try {
        const { imageDataUrl: _reference, ...context } = snapshot
        const result = await options.activities.importLocalAiRemix({ ...context, referenceImageDataUrl: imageDataUrl })
        if (result.outcome === 'bonus') {
          bonusUrl.value = await options.activities.resolveFileUrl(result.fileId)
          detachedBonus.value = options.activities.publicState.value?.round?.roundId !== snapshot.roundId
          message.value = options.text.value.room.aiBonusHint
        }
        else {
          message.value = options.text.value.room.aiApplied
          selection.value = undefined
        }
      }
      finally {
        requestBusy.value = false
        try {
          await options.syncAuthority()
        }
        catch {
          // Room polling retries authoritative recovery; never patch only this client.
        }
      }
    },
  })

  watch(
    () => options.activities.publicState.value?.round?.roundId,
    () => {
      selection.value = undefined
      selectionStart.value = undefined
      selecting.value = false
      message.value = ''
      bonusUrl.value = ''
      detachedBonus.value = false
    },
  )

  watch(
    () => options.activities.publicState.value?.round?.aiRemixBonus?.fileId,
    async (fileId) => {
      bonusUrl.value = ''
      detachedBonus.value = false
      if (!fileId)
        return
      try {
        const url = await options.activities.resolveFileUrl(fileId)
        if (options.activities.publicState.value?.round?.aiRemixBonus?.fileId === fileId)
          bonusUrl.value = url
      }
      catch {
        // A reveal bonus is optional and never blocks authoritative recovery.
      }
    },
    { immediate: true },
  )

  function beginSelection(): void {
    if (!options.canUse.value || pending.value || used.value || handoffBusy.value || localAi.busy.value || localAi.applying.value)
      return
    const painter = options.getPainter()
    painter?.brush.cancelStroke()
    painter?.eraser.cancelStroke()
    selection.value = undefined
    selectionStart.value = undefined
    message.value = options.text.value.room.aiSelectionHint
    selecting.value = true
  }

  function startSelection(event: PointerEvent): void {
    if (!selecting.value)
      return
    const point = canvasPoint(event)
    selectionStart.value = point
    selection.value = { height: 0, width: 0, x: point.x, y: point.y }
    const target = event.currentTarget as HTMLElement
    target.setPointerCapture(event.pointerId)
  }

  function moveSelection(event: PointerEvent): void {
    const start = selectionStart.value
    if (start)
      selection.value = createPictionaryAiSquareSelection(start, canvasPoint(event))
  }

  function finishSelection(event: PointerEvent): void {
    releasePointer(event)
    const value = selection.value
    selectionStart.value = undefined
    selecting.value = false
    if (!value || value.width < 64) {
      selection.value = undefined
      message.value = options.text.value.room.aiSelectionTooSmall
      return
    }
    message.value = ''
  }

  function cancelSelection(event: PointerEvent): void {
    releasePointer(event)
    selectionStart.value = undefined
    selection.value = undefined
    selecting.value = false
    message.value = ''
  }

  async function generate(): Promise<void> {
    const selected = selection.value
    const painter = options.getPainter()
    if (!selected || !painter || !options.canUse.value || pending.value || used.value || handoffBusy.value || localAi.busy.value || localAi.applying.value)
      return
    const current = options.requireRoundState()
    requestBusy.value = true
    message.value = ''
    try {
      const result = await options.activities.requestAiRemix({
        activityEpoch: current.activityEpoch,
        commandId: crypto.randomUUID(),
        controllerEpoch: current.state.controllerEpoch ?? 1,
        effect: effect.value,
        phaseEpoch: current.state.phaseEpoch,
        rect: selected,
        referenceImageDataUrl: await createReferenceImage(painter, selected),
        roundId: current.state.round!.roundId,
        sessionId: current.sessionId,
      })
      if (result.outcome === 'bonus') {
        bonusUrl.value = await options.activities.resolveFileUrl(result.fileId)
        detachedBonus.value = options.activities.publicState.value?.round?.roundId !== current.state.round!.roundId
        message.value = options.text.value.room.aiBonusHint
      }
      else {
        message.value = options.text.value.room.aiApplied
        selection.value = undefined
      }
    }
    catch {
      message.value = options.text.value.room.aiFailed
    }
    finally {
      requestBusy.value = false
      try {
        await options.syncAuthority()
      }
      catch {
        // Normal room polling will retry authority synchronization.
      }
    }
  }

  async function prepareHandoff(): Promise<void> {
    const selected = selection.value
    const painter = options.getPainter()
    if (!selected || !painter || !options.canUse.value || pending.value || used.value || handoffBusy.value || localAi.busy.value || localAi.applying.value)
      return
    invalidateHandoff()
    const revision = handoffRevision
    const selectedEffect = effect.value
    handoffBusy.value = true
    message.value = ''
    try {
      const image = await createReferenceImage(painter, selected)
      if (revision === handoffRevision)
        handoff.value = createPictionaryAiHandoff(image, selectedEffect)
    }
    catch {
      if (revision === handoffRevision)
        message.value = options.text.value.room.aiExternalFailed
    }
    finally {
      handoffBusy.value = false
    }
  }

  async function applyCanvasPatch(patch: PictionaryAiCanvasPatch): Promise<void> {
    const painter = options.getPainter()
    if (!painter?.surface.writeRegion)
      throw new Error('Activity surface does not support image patches.')
    const layerId = painter.document.activeLayerId
    if (!layerId)
      throw new Error('Activity canvas has no active layer.')
    const url = await options.activities.resolveFileUrl(patch.fileId)
    const imported = await importImagePixels(url, {
      maxHeight: patch.rect.height,
      maxWidth: patch.rect.width,
    })
    if (imported.width !== patch.rect.width || imported.height !== patch.rect.height)
      throw new Error('AI patch dimensions do not match its authoritative selection.')
    painter.surface.writeRegion(layerId, patch.rect, imported.pixels)
  }

  function canvasPoint(event: PointerEvent): { x: number, y: number } {
    const bounds = options.canvasContainerRef.value?.getBoundingClientRect()
    if (!bounds)
      return { x: 0, y: 0 }
    return {
      x: Math.round(Math.max(0, Math.min(1024, (event.clientX - bounds.left) / bounds.width * 1024))),
      y: Math.round(Math.max(0, Math.min(768, (event.clientY - bounds.top) / bounds.height * 768))),
    }
  }

  return {
    applyCanvasPatch,
    beginSelection,
    bonusUrl,
    cancelSelection,
    detachedBonus,
    effect,
    finishSelection,
    generate,
    handoff,
    handoffBusy,
    localAi,
    message,
    moveSelection,
    pending,
    prepareHandoff,
    requestBusy,
    selecting,
    selection,
    startSelection,
    used,
  }
}

export function createPictionaryAiSquareSelection(
  start: { x: number, y: number },
  end: { x: number, y: number },
): PictionaryAiRect {
  const directionX = end.x < start.x ? -1 : 1
  const directionY = end.y < start.y ? -1 : 1
  const boundaryX = directionX < 0 ? start.x : 1024 - start.x
  const boundaryY = directionY < 0 ? start.y : 768 - start.y
  const size = Math.round(Math.min(Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)), boundaryX, boundaryY))
  return {
    height: size,
    width: size,
    x: directionX < 0 ? start.x - size : start.x,
    y: directionY < 0 ? start.y - size : start.y,
  }
}

function releasePointer(event: PointerEvent): void {
  const target = event.currentTarget as HTMLElement
  if (target.hasPointerCapture(event.pointerId))
    target.releasePointerCapture(event.pointerId)
}

async function createReferenceImage(painter: Painter, selection: PictionaryAiRect): Promise<string> {
  const source = await painter.extractCanvas('canvas', { mode: 'preview' }) as HTMLCanvasElement
  const output = document.createElement('canvas')
  output.width = 512
  output.height = 512
  const context = output.getContext('2d')
  if (!context)
    throw new Error('Canvas 2D is unavailable.')
  const scaleX = source.width / 1024
  const scaleY = source.height / 768
  context.drawImage(
    source,
    selection.x * scaleX,
    selection.y * scaleY,
    selection.width * scaleX,
    selection.height * scaleY,
    0,
    0,
    512,
    512,
  )
  return output.toDataURL('image/png')
}

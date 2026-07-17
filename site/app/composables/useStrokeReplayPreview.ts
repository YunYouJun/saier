import type { SaierProjectFile, SaierStrokeCommit } from '@saier/core'
import type { Painter } from 'saier'
import type { Ref } from 'vue'
import { createPainter } from 'saier'
import { onBeforeUnmount, readonly, shallowRef } from 'vue'

interface UseStrokeReplayPreviewOptions {
  canvas: Ref<HTMLCanvasElement | null>
}

/** Owns an isolated, disposable painter used only for stroke-log playback. */
export function useStrokeReplayPreview(options: UseStrokeReplayPreviewOptions) {
  const previewing = shallowRef(false)
  const baseProjects = new Map<string, SaierProjectFile>()
  let blockedSource: Painter | undefined
  let blockedSourceWasInStage = false
  let previewPainter: Painter | undefined
  let previewDocumentId: string | undefined
  let previewSessionCounter = 0
  let resizeObserver: ResizeObserver | undefined
  let run = 0

  function captureBase(source: Painter): void {
    const documentId = source.getActiveDocumentId()
    baseProjects.set(documentId, source.exportProject())
    if (previewDocumentId === documentId)
      close()
  }

  function hasBase(source: Painter): boolean {
    return baseProjects.has(source.getActiveDocumentId())
  }

  function clearBase(source?: Painter): void {
    if (source)
      baseProjects.delete(source.getActiveDocumentId())
    else
      baseProjects.clear()
    close()
  }

  async function showAt(source: Painter, strokes: SaierStrokeCommit[], position: number): Promise<void> {
    const currentRun = ++run
    const target = options.canvas.value
    if (!target)
      return

    const documentId = source.getActiveDocumentId()
    const project = baseProjects.get(documentId) ?? source.exportProject()
    baseProjects.set(documentId, project)
    const next = previewPainter ?? await createPreviewPainter(source, project, target)
    if (currentRun !== run)
      return

    const previousDocumentId = next.getActiveDocumentId()
    const replayDocumentId = `stroke-replay-preview-${++previewSessionCounter}`
    next.importProject(project, { activate: true, id: replayDocumentId })
    next.closeDocument(previousDocumentId)
    copyViewport(source, next)
    for (const stroke of strokes.slice(0, Math.max(0, Math.min(position, strokes.length))))
      next.strokeRecording.replayStroke(stroke, { recordHistory: false })
    next.flushSurfaceUploads()

    blockSourceInput(source)
    previewPainter = next
    previewDocumentId = documentId
    previewing.value = true
    observeResize(source, next, target)
  }

  async function playStroke(
    stroke: SaierStrokeCommit,
    speed: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (!previewPainter)
      throw new Error('Stroke replay preview is not ready')
    await previewPainter.strokeRecording.replayStrokeTimed(stroke, {
      recordHistory: false,
      signal,
      speed,
    })
  }

  function close(): void {
    run += 1
    restoreSourceInput()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    previewDocumentId = undefined
    previewing.value = false
  }

  function dispose(): void {
    close()
    resizeObserver?.disconnect()
    resizeObserver = undefined
    previewPainter?.destroy()
    previewPainter = undefined
  }

  function observeResize(source: Painter, targetPainter: Painter, target: HTMLCanvasElement): void {
    resizeObserver?.disconnect()
    if (typeof ResizeObserver === 'undefined')
      return
    resizeObserver = new ResizeObserver(() => {
      targetPainter.onResize()
      copyViewport(source, targetPainter)
    })
    resizeObserver.observe(target)
  }

  function blockSourceInput(source: Painter): void {
    restoreSourceInput()
    blockedSource = source
    blockedSourceWasInStage = source.isPointerInStage
    source.isPointerInStage = false
  }

  function restoreSourceInput(): void {
    if (blockedSource)
      blockedSource.isPointerInStage = blockedSourceWasInStage
    blockedSource = undefined
    blockedSourceWasInStage = false
  }

  onBeforeUnmount(dispose)

  return {
    captureBase,
    clearBase,
    close,
    hasBase,
    playStroke,
    previewing: readonly(previewing),
    showAt,
  }
}

async function createPreviewPainter(
  source: Painter,
  project: SaierProjectFile,
  target: HTMLCanvasElement,
): Promise<Painter> {
  const bounds = source.app.canvas.getBoundingClientRect()
  const painter = createPainter({
    backend: 'tiled',
    boardSize: { width: project.width, height: project.height },
    input: { pointerSource: 'pixi' },
    pixiOptions: { backgroundAlpha: 0 },
    size: {
      width: Math.max(1, Math.round(bounds.width)),
      height: Math.max(1, Math.round(bounds.height)),
    },
    view: target,
  })
  await painter.init()
  return painter
}

function copyViewport(source: Painter, target: Painter): void {
  const viewport = source.getViewportSnapshot()
  target.board.container.position.set(viewport.x, viewport.y)
  target.boundingBoxes.position.set(viewport.x, viewport.y)
  target.canvas.scaleTo(viewport.scale)
}

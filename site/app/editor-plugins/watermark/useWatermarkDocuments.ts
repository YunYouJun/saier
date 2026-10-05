import type { Painter } from 'saier'
import type { ShallowRef } from 'vue'
import type { WatermarkDraft, WatermarkDraftRecord } from '~/features/watermark/draft'
import type { WatermarkWorkInput } from '~/features/watermark/workfile'
import type { WatermarkWorkspaceState } from '~/features/watermark/workspace'
import type { SitePainterCommand } from '~/types/painter-app'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import { downloadWatermarkBlob, serializeWatermarkWorkfile } from '~/features/watermark/workfile'
import { WatermarkWorkspace } from '~/features/watermark/workspace'
import { useWatermarkDrafts } from './useWatermarkDrafts'

/** Own document-scoped watermark adapters without creating another canvas or Painter. */
export function useWatermarkDocuments(painter: ShallowRef<Painter | undefined>, report: (error: unknown) => void, canInteract: () => boolean = () => true) {
  const drafts = useWatermarkDrafts()
  const sessions = new Map<string, WatermarkWorkspace>()
  const active = shallowRef<WatermarkWorkspace>()
  const state = shallowRef<WatermarkWorkspaceState>()
  const busy = shallowRef(false)
  let disposed = false
  let pending: WatermarkWorkspace | undefined
  let unbind: (() => void) | undefined
  const refresh = (): void => {
    state.value = active.value?.getState()
    if (active.value)
      drafts.changed(active.value)
  }
  watch(painter, (p) => {
    unbind?.()
    if (!p)
      return
    const sync = (): void => {
      const ids = new Set(p.getDocuments().map(d => d.id))
      for (const [id, session] of sessions) {
        if (!ids.has(id)) {
          drafts.detach(session)
          session.destroy()
          sessions.delete(id)
        }
      }
      const next = sessions.get(p.getActiveDocumentId())
      if (active.value !== next) {
        active.value = next
        next?.resume()
      }
      refresh()
    }
    const guardTool = (tool: string): void => {
      if ((active.value || busy.value) && !['selection', 'drag'].includes(tool)) {
        queueMicrotask(() => {
          if (!disposed && (active.value || busy.value) && !['selection', 'drag'].includes(p.tool))
            p.useTool('selection')
        })
      }
    }
    const pointer = (e: PointerEvent): void => active.value?.pointerDown(e)
    const key = (e: KeyboardEvent): void => {
      if (!canInteract() || (!active.value && !busy.value) || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"],[role="menu"],[role="menubar"]')))
        return
      if (busy.value) {
        e.preventDefault()
        e.stopImmediatePropagation()
        return
      }
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Escape', 'Delete', 'Backspace', 'b', 'e', 'i'].includes(e.key) || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z')) {
        e.preventDefault()
        e.stopImmediatePropagation()
        active.value?.keydown(e)
      }
    }
    p.emitter.on('active-document:change', sync)
    p.emitter.on('documents:change', sync)
    p.emitter.on('tool:change', guardTool)
    p.options.view.addEventListener('pointerdown', pointer, true)
    window.addEventListener('keydown', key, true)
    unbind = () => {
      p.emitter.off('active-document:change', sync)
      p.emitter.off('documents:change', sync)
      p.emitter.off('tool:change', guardTool)
      p.options.view.removeEventListener('pointerdown', pointer, true)
      window.removeEventListener('keydown', key, true)
    }
  }, { immediate: true })

  async function open(input: WatermarkWorkInput, record?: WatermarkDraftRecord, draft?: WatermarkDraft): Promise<void> {
    const p = painter.value
    if (!p || busy.value)
      return
    busy.value = true
    const previous = p.getActiveDocumentId()
    const workspace = new WatermarkWorkspace(p.options.view, input, refresh, report, p)
    pending = workspace
    try {
      await workspace.init()
      if (disposed) {
        workspace.destroy()
        return
      }
      sessions.set(workspace.documentId, workspace)
      active.value = workspace
      workspace.resume()
      if (draft) {
        p.renameDocument(workspace.documentId, draft.name)
        const layer = workspace.getState().layers[draft.selected]
        workspace.select(layer?.id ?? p.document.layers[0]!.id)
      }
      drafts.track(workspace, record)
      p.markDocumentDirty()
      refresh()
    }
    catch (error) {
      workspace.destroy()
      if (disposed)
        return
      if (workspace.documentId)
        p.closeDocument(workspace.documentId)
      p.switchDocument(previous)
      throw error
    }
    finally {
      pending = undefined
      busy.value = false
    }
  }

  async function download(format: 'png' | 'psd' | 'workfile'): Promise<void> {
    const workspace = active.value
    if (!workspace || busy.value)
      return
    busy.value = true
    try {
      workspace.finishTransform()
      const input = { ...workspace.input, placements: workspace.getPlacements() }
      if (format === 'workfile') {
        downloadWatermarkBlob(new Blob([serializeWatermarkWorkfile(input)], { type: 'application/json' }), 'saier-watermark-workfile.json')
        painter.value?.markDocumentSaved(workspace.documentId)
      }
      else if (format === 'psd') {
        const { exportWatermarkPsd } = await import('~/features/watermark/psd-export')
        downloadWatermarkBlob(exportWatermarkPsd(input), 'saier-watermarked.psd')
      }
      else {
        const blob = await new Promise<Blob | null>(resolve => workspace.exportCanvas().toBlob(resolve))
        if (!blob)
          throw new Error('PNG 导出失败')
        downloadWatermarkBlob(blob, 'saier-watermarked.png')
      }
    }
    catch (error) { report(error) }
    finally { busy.value = false }
  }

  function allows(command: SitePainterCommand): boolean {
    return !active.value || ['file:new', 'file:open-project', 'file:save-project', 'file:download', 'file:export-preview', 'edit:undo', 'edit:redo', 'view:reset', 'view:zoom-in', 'view:zoom-out', 'tool:selection', 'tool:drag', 'selection:cancel', 'app:keyboard-shortcuts'].includes(command)
  }
  async function command(command: SitePainterCommand): Promise<boolean> {
    if (!active.value)
      return false
    if (!allows(command)) {
      report(new Error('当前为水印文档，请在水印面板调整，或切换到绘画文档继续绘制'))
      return true
    }
    switch (command) {
      case 'file:save-project':
        await download('workfile')
        return true
      case 'file:download':
      case 'file:export-preview':
        await download('png')
        return true
      case 'edit:undo':
        active.value.undo()
        return true
      case 'edit:redo':
        active.value.redo()
        return true
      case 'view:reset':
        active.value.fitView()
        return true
      default: return false
    }
  }
  function dispose(): void {
    if (disposed)
      return
    drafts.dispose()
    disposed = true
    pending?.destroy()
    unbind?.()
    for (const session of sessions.values())
      session.destroy()
    sessions.clear()
    active.value = undefined
    state.value = undefined
  }
  onBeforeUnmount(dispose)
  return { active, state, busy: computed(() => busy.value || drafts.busy.value), drafts, restoreDraft: (record: WatermarkDraftRecord) => drafts.restore(record, open), dispose, open, download, allows, command, isManaged: (id: string) => sessions.has(id) || busy.value }
}

export type WatermarkDocumentHost = ReturnType<typeof useWatermarkDocuments>

import type { Emitter } from 'mitt'
import type { StrokePatch, SurfaceBackend } from '../types'
import mitt from 'mitt'

export interface UndoManagerEvents {
  'history:change': { canUndo: boolean, canRedo: boolean }
  [key: string]: unknown
  [key: symbol]: unknown
}

export interface UndoManagerOptions {
  /** max retained undo steps; older steps are dropped. Default `25`. */
  capacity?: number
  /** the pixel backend that replays patches; may be attached later */
  backend?: SurfaceBackend
}

/**
 * Stroke-level undo / redo over {@link StrokePatch}es.
 *
 * It never holds pixels itself — it replays patches through
 * `backend.applyPatch` (decision D4: region snapshots, never a full-canvas
 * snapshot). The backend is injected so core stays Pixi-free.
 */
export class UndoManager {
  readonly capacity: number

  private backend: SurfaceBackend | null
  private readonly emitter: Emitter<UndoManagerEvents> = mitt<UndoManagerEvents>()
  private _undoStack: StrokePatch[] = []
  private _redoStack: StrokePatch[] = []

  constructor(options: UndoManagerOptions = {}) {
    this.capacity = options.capacity ?? 25
    this.backend = options.backend ?? null
  }

  on = this.emitter.on
  off = this.emitter.off

  attach(backend: SurfaceBackend): void {
    this.backend = backend
  }

  canUndo(): boolean {
    return this._undoStack.length > 0
  }

  canRedo(): boolean {
    return this._redoStack.length > 0
  }

  /** Push a freshly committed stroke; clears the redo stack. */
  record(patch: StrokePatch): void {
    this._undoStack.push(patch)
    if (this._undoStack.length > this.capacity)
      this._undoStack.splice(0, this._undoStack.length - this.capacity)
    this._redoStack.length = 0
    this.emitChange()
  }

  undo(): void {
    const patch = this._undoStack.pop()
    if (!patch)
      return
    this.requireBackend().applyPatch(patch, 'undo')
    this._redoStack.push(patch)
    this.emitChange()
  }

  redo(): void {
    const patch = this._redoStack.pop()
    if (!patch)
      return
    this.requireBackend().applyPatch(patch, 'redo')
    this._undoStack.push(patch)
    this.emitChange()
  }

  clear(): void {
    this._undoStack.length = 0
    this._redoStack.length = 0
    this.emitChange()
  }

  private requireBackend(): SurfaceBackend {
    if (!this.backend)
      throw new Error('UndoManager has no backend attached')
    return this.backend
  }

  private emitChange(): void {
    this.emitter.emit('history:change', {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    })
  }
}

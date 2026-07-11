import type { Painter } from '../painter'
import consola from 'consola'
import mitt from 'mitt'

export interface PainterAction {
  undo: () => void
  redo: () => void
}

export class PainterHistory {
  painter: Painter
  capacity: number = 25

  undoStack: PainterAction[] = []
  redoStack: PainterAction[] = []
  private readonly emitter = mitt<{
    'history:change': { canUndo: boolean, canRedo: boolean }
  }>()

  on = this.emitter.on
  off = this.emitter.off

  constructor(painter: Painter, options: {
    capacity: number
  } = {
    capacity: 20,
  }) {
    consola.info('PainterHistory Init')

    this.painter = painter
    this.capacity = options.capacity
  }

  record(action: PainterAction) {
    this.undoStack.unshift(action)
    if (this.capacity && this.undoStack.length > this.capacity)
      this.undoStack.splice(this.capacity, Number.POSITIVE_INFINITY)
    this.redoStack.length = 0

    this.painter.emitter.emit('history:record', action)
    this.emitChange()
  }

  clear() {
    this.undoStack.splice(0, this.undoStack.length)
    this.redoStack.splice(0, this.redoStack.length)
    this.emitChange()
  }

  undo() {
    if (this.painter.debug)
      consola.log('%c 🔙 undo', 'color:white;background:#0078D7')

    const action = this.undoStack.shift()
    if (action) {
      action.undo()
      this.redoStack.unshift(action)
      this.emitChange()
    }
  }

  redo() {
    if (this.painter.debug)
      consola.log('%c 🔜 redo', 'color:white;background:#FF8C00')

    const action = this.redoStack.shift()
    if (action) {
      action.redo()
      this.undoStack.unshift(action)
      this.emitChange()
    }
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }

  private emitChange(): void {
    this.emitter.emit('history:change', {
      canUndo: this.canUndo(),
      canRedo: this.canRedo(),
    })
  }
}

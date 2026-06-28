import type { PainterAction } from '../packages/saier/src/features/history'
import type { Painter } from '../packages/saier/src/painter'
import consola from 'consola'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PainterHistory } from '../packages/saier/src/features/history'

function createPainterMock() {
  const emit = vi.fn()

  return {
    debug: false,
    emitter: {
      emit,
    },
  } as unknown as Painter
}

function createAction(): PainterAction {
  return {
    undo: vi.fn(),
    redo: vi.fn(),
  }
}

describe('painter history', () => {
  beforeEach(() => {
    vi.spyOn(consola, 'info').mockImplementation(() => {})
  })

  it('records one undo action and clears redo history', () => {
    const painter = createPainterMock()
    const history = new PainterHistory(painter, { capacity: 3 })
    const staleRedoAction = createAction()
    const action = createAction()

    history.redoStack.unshift(staleRedoAction)
    history.record(action)

    expect(history.undoStack).toEqual([action])
    expect(history.redoStack).toEqual([])
    expect(painter.emitter.emit).toHaveBeenCalledWith('history:record', action)
  })

  it('keeps only the newest actions within capacity', () => {
    const history = new PainterHistory(createPainterMock(), { capacity: 2 })
    const first = createAction()
    const second = createAction()
    const third = createAction()

    history.record(first)
    history.record(second)
    history.record(third)

    expect(history.undoStack).toEqual([third, second])
    expect(history.canUndo()).toBe(true)
  })

  it('moves actions between undo and redo stacks', () => {
    const history = new PainterHistory(createPainterMock(), { capacity: 3 })
    const action = createAction()

    history.record(action)
    history.undo()

    expect(action.undo).toHaveBeenCalledOnce()
    expect(history.canUndo()).toBe(false)
    expect(history.canRedo()).toBe(true)

    history.redo()

    expect(action.redo).toHaveBeenCalledOnce()
    expect(history.canUndo()).toBe(true)
    expect(history.canRedo()).toBe(false)
  })
})

import type { PainterAction } from './features/history'
import type { PainterInputSnapshot } from './input'
import type { EditableLayer } from './layers'
import mitt from 'mitt'

export function createEmitter() {
  const emitter = mitt<{
    // board
    'board:drag': void

    // layer
    'layer:add': EditableLayer

    // brush
    'brush:enter': void
    'brush:up': void
    'brush:out': void

    // eraser
    'eraser:enter': void
    'eraser:up': void
    'eraser:out': void

    // tool
    'tool:change': string

    // history
    'history:record': PainterAction

    // input
    'input:pointer': PainterInputSnapshot

    // document
    'canvas:clear': void
  }>()
  return emitter
}

import type { SaierStrokeCommit } from '@saier/core'
import type { PainterAction } from './features/history'
import type { PainterInputSnapshot } from './input'
import type { EditableLayer } from './layers'
import type { PainterDocumentState, PainterTransformSnapshot, PainterViewportSnapshot } from './painter'
import mitt from 'mitt'

export function createEmitter() {
  const emitter = mitt<{
    // board
    'board:drag': void
    'viewport:change': PainterViewportSnapshot

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

    // transform
    'transform:change': PainterTransformSnapshot | null

    // input
    'input:pointer': PainterInputSnapshot

    // stroke recording
    'stroke:commit': SaierStrokeCommit

    // document
    'canvas:clear': void
    'documents:change': { documents: PainterDocumentState[], activeDocumentId: string }
    'active-document:change': { document: PainterDocumentState, documents: PainterDocumentState[] }
  }>()
  return emitter
}

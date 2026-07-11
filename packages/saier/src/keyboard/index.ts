import type { KeyHandler } from 'hotkeys-js'
import type { Painter } from '../painter'
import consola from 'consola'
import hotkeys from 'hotkeys-js'

export class Keyboard {
  static shortcuts: {
    key: string
    description: string
    method: KeyHandler
  }[] = []

  platform: 'macos' | 'windows'

  painter: Painter
  // code 物理键盘 一致
  keyState = new Map<KeyboardEvent['code'], boolean>()
  private readonly handleKeydown = (event: KeyboardEvent) => this.keydown(event)
  private readonly handleKeyup = (event: KeyboardEvent) => this.keyup(event)

  constructor(painter: Painter) {
    this.painter = painter

    window.addEventListener('keydown', this.handleKeydown)
    window.addEventListener('keyup', this.handleKeyup)

    this.platform = navigator.userAgent.includes('Windows') ? 'windows' : 'macos'

    Keyboard.shortcuts = [
      {
        key: 'esc',
        description: 'Cancel Selection',
        method: () => this.painter.cancelSelection(),
      },
      {
        key: 'enter',
        description: 'Confirm Transform',
        method: () => this.painter.confirmTransform(),
      },
      {
        key: 'delete,backspace',
        description: 'Delete Selected Layer',
        method: () => this.painter.removeSelectedTransformLayer(),
      },
      {
        key: 'left',
        description: 'Nudge Left',
        method: () => this.painter.nudgeTransformSelection(-1, 0),
      },
      {
        key: 'right',
        description: 'Nudge Right',
        method: () => this.painter.nudgeTransformSelection(1, 0),
      },
      {
        key: 'up',
        description: 'Nudge Up',
        method: () => this.painter.nudgeTransformSelection(0, -1),
      },
      {
        key: 'down',
        description: 'Nudge Down',
        method: () => this.painter.nudgeTransformSelection(0, 1),
      },
      {
        key: 'shift+left',
        description: 'Nudge Left 10px',
        method: () => this.painter.nudgeTransformSelection(-10, 0),
      },
      {
        key: 'shift+right',
        description: 'Nudge Right 10px',
        method: () => this.painter.nudgeTransformSelection(10, 0),
      },
      {
        key: 'shift+up',
        description: 'Nudge Up 10px',
        method: () => this.painter.nudgeTransformSelection(0, -10),
      },
      {
        key: 'shift+down',
        description: 'Nudge Down 10px',
        method: () => this.painter.nudgeTransformSelection(0, 10),
      },
      {
        key: 'b',
        description: 'Brush',
        method: () => this.painter.useTool('brush'),
      },
      {
        key: 'd',
        description: 'Drag',
        method: () => this.painter.useTool('drag'),
      },
      {
        key: 'e',
        description: 'Eraser',
        method: () => this.painter.useTool('eraser'),
      },
      {
        key: 's',
        description: 'Selection',
        method: () => this.painter.useTool('selection'),
      },
      {
        key: 'h',
        description: 'Reset To Center',
        method: () => this.painter.board.resetToCenter(),
      },
      {
        key: 'i',
        description: 'Image',
        method: () => this.painter.useTool('image'),
      },
      {
        key: 'ctrl+z',
        description: 'Undo',
        method: () => this.painter.history.undo(),
      },
      {
        key: 'ctrl+shift+z',
        description: 'Redo',
        method: () => this.painter.history.redo(),
      },
      {
        key: '=',
        description: 'Zoom In',
        method: () => this.painter.zoomIn(),
      },
      {
        key: '-',
        description: 'Zoom Out',
        method: () => this.painter.zoomOut(),
      },
      {
        key: '[',
        description: 'Brush Size Down',
        method: () => this.painter.brushSizeDown(),
      },
      {
        key: ']',
        description: 'Brush Size Up',
        method: () => this.painter.brushSizeUp(),
      },
    ]

    Keyboard.shortcuts.forEach(({ key, method }) => {
      hotkeys(key, (e, handler) => {
        // if pointer not in stage, ignore shortcuts
        if (!this.painter.isPointerInStage)
          return

        if (this.painter.debug)
          consola.info(e.code)

        this.keyState.set(e.code, true)
        method(e, handler)
      })
    })
  }

  // initShortcuts() { }

  isPressed(code: KeyboardEvent['code']) {
    return this.keyState.get(code) || false
  }

  keydown(e: KeyboardEvent) {
    // if pointer not in stage, ignore shortcuts
    if (!this.painter.isPointerInStage)
      return

    if (this.painter.debug)
      consola.info(e.code)
    this.keyState.set(e.code, true)
  }

  keyup(e: KeyboardEvent) {
    this.keyState.set(e.code, false)
  }

  destroy() {
    hotkeys.unbind()
    window.removeEventListener('keydown', this.handleKeydown)
    window.removeEventListener('keyup', this.handleKeyup)
  }
}

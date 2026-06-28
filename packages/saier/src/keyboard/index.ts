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

  constructor(painter: Painter) {
    this.painter = painter

    window.addEventListener('keydown', this.keydown.bind(this))
    window.addEventListener('keyup', this.keyup.bind(this))

    this.platform = navigator.userAgent.includes('Windows') ? 'windows' : 'macos'

    Keyboard.shortcuts = [
      {
        key: 'esc',
        description: 'Cancel Selection',
        method: () => this.painter.cancelSelection(),
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
  }

  keyup(e: KeyboardEvent) {
    this.keyState.set(e.code, false)
  }

  destroy() {
    hotkeys.unbind()
    window.removeEventListener('keydown', this.keydown)
    window.removeEventListener('keyup', this.keyup)
  }
}

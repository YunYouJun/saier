import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SitePainterToolbar from './SitePainterToolbar.vue'

const mounted: { unmount: () => void }[] = []

const labels = {
  brush: 'Brush',
  cloudRoom: 'Cloud room',
  cloudSync: 'Cloud sync',
  download: 'Download',
  eraser: 'Eraser',
  exportPreview: 'Preview export',
  image: 'Image',
  importImage: 'Import image',
  newCanvas: 'New canvas',
  openProject: 'Open project',
  pan: 'Pan',
  recordingClear: 'Clear recorded strokes',
  recordingReplay: 'Replay last stroke',
  recordingStart: 'Start stroke recording',
  recordingStop: 'Stop stroke recording',
  redo: 'Redo',
  saveProject: 'Save project',
  selection: 'Selection',
  stabilizer: 'Stabilizer',
  tools: 'Tools',
  undo: 'Undo',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
}

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function mountToolbar(options: {
  canReplayRecording?: boolean
  recordingCount?: number
  recordingEnabled?: boolean
} = {}) {
  const commands: string[] = []
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp({
    setup() {
      return () => h(SitePainterToolbar, {
        'activeTool': 'brush',
        'canRedo': false,
        'canReplayRecording': options.canReplayRecording ?? false,
        'canUndo': false,
        'disabled': false,
        labels,
        'recordingCount': options.recordingCount ?? 0,
        'recordingEnabled': options.recordingEnabled ?? false,
        'stabilizerStrength': 1,
        'onCommand': (command: string) => commands.push(command),
        'onUpdate:stabilizerStrength': vi.fn(),
      })
    },
  })
  app.mount(el)

  const item = {
    commands,
    el,
    unmount: () => {
      app.unmount()
      el.remove()
    },
  }
  mounted.push(item)
  return item
}

function buttonByTitle(root: ParentNode, title: string): HTMLButtonElement {
  const button = [...root.querySelectorAll('button')]
    .find(item => item.getAttribute('title') === title)
  if (!(button instanceof HTMLButtonElement))
    throw new Error(`missing button: ${title}`)
  return button
}

describe('site painter toolbar recording controls', () => {
  it('exposes manual recording commands without enabling replay before strokes exist', async () => {
    const { commands, el } = mountToolbar()

    const start = buttonByTitle(el, 'Start stroke recording')
    const replay = buttonByTitle(el, 'Replay last stroke')
    const clear = buttonByTitle(el, 'Clear recorded strokes')

    expect(start.disabled).toBe(false)
    expect(start.getAttribute('aria-pressed')).toBe('false')
    expect(replay.disabled).toBe(true)
    expect(clear.disabled).toBe(true)

    start.click()
    await nextTick()

    expect(commands).toEqual(['recording:toggle'])
  })

  it('keeps replay and clear available once recorded strokes exist', async () => {
    const { commands, el } = mountToolbar({
      canReplayRecording: true,
      recordingCount: 2,
      recordingEnabled: true,
    })

    const stop = buttonByTitle(el, 'Stop stroke recording')
    const replay = buttonByTitle(el, 'Replay last stroke')
    const clear = buttonByTitle(el, 'Clear recorded strokes')

    expect(stop.getAttribute('aria-pressed')).toBe('true')
    expect(replay.disabled).toBe(false)
    expect(clear.disabled).toBe(false)

    replay.click()
    clear.click()
    await nextTick()

    expect(commands).toEqual(['recording:replay-last', 'recording:clear'])
  })
})

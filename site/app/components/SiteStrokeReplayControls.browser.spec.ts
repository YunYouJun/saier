import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h, nextTick } from 'vue'
import SiteStrokeReplayControls from './SiteStrokeReplayControls.vue'

const mounted: { unmount: () => void }[] = []

const labels = {
  exportLog: 'Export stroke log',
  importLog: 'Import stroke log',
  pause: 'Pause replay',
  play: 'Play replay',
  position: 'Replay position',
  reset: 'Reset replay position',
  speed: 'Replay speed',
  step: 'Step replay',
}

afterEach(() => {
  for (const item of mounted.splice(0))
    item.unmount()
})

function mountControls(options: {
  count?: number
  playing?: boolean
  position?: number
  speed?: number
} = {}) {
  const commands: string[] = []
  const speeds: number[] = []
  const positions: number[] = []
  const el = document.createElement('div')
  document.body.appendChild(el)

  const app = createApp({
    setup() {
      return () => h(SiteStrokeReplayControls, {
        'count': options.count ?? 3,
        'disabled': false,
        labels,
        'playing': options.playing ?? false,
        'position': options.position ?? 1,
        'speed': options.speed ?? 1,
        'onCommand': (command: string) => commands.push(command),
        'onSeek': (position: number) => positions.push(position),
        'onUpdate:speed': (speed: number) => speeds.push(speed),
      })
    },
  })
  app.mount(el)

  const item = {
    commands,
    el,
    positions,
    speeds,
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

describe('site stroke replay controls', () => {
  it('emits import/export and playback commands', async () => {
    const { commands, el } = mountControls()

    buttonByTitle(el, 'Import stroke log').click()
    buttonByTitle(el, 'Export stroke log').click()
    buttonByTitle(el, 'Play replay').click()
    buttonByTitle(el, 'Step replay').click()
    buttonByTitle(el, 'Reset replay position').click()
    await nextTick()

    expect(commands).toEqual([
      'recording:import-log',
      'recording:export-log',
      'recording:play',
      'recording:step-forward',
      'recording:seek-start',
    ])
  })

  it('shows pause while playing and disables forward playback at the end', () => {
    const { el } = mountControls({ count: 2, playing: true, position: 2 })

    expect(buttonByTitle(el, 'Pause replay').disabled).toBe(false)
    expect(buttonByTitle(el, 'Step replay').disabled).toBe(true)
  })
})

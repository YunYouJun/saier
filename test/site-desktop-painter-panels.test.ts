import { describe, expect, it } from 'vitest'
import { createDefaultDesktopPanelGroups } from '~/composables/useDesktopPainterPanels'

describe('desktop painter panel defaults', () => {
  it('shows color controls as an independent bottom-left panel', () => {
    const groups = createDefaultDesktopPanelGroups(1280, 720)
    const controls = groups.find(group => group.id === 'controls')
    const options = groups.find(group => group.id === 'options')

    expect(controls).toMatchObject({
      activePanelId: 'controls',
      anchorX: 'left',
      anchorY: 'bottom',
      collapsed: false,
      panelIds: ['controls'],
      x: 12,
      y: 388,
    })
    expect(options).toMatchObject({
      activePanelId: 'options',
      anchorX: 'left',
      anchorY: 'top',
      panelIds: ['options'],
      x: 12,
      y: 12,
    })
  })

  it('keeps every default panel group expanded and individually draggable', () => {
    const groups = createDefaultDesktopPanelGroups(1280, 720)

    expect(groups).toHaveLength(5)
    expect(groups.every(group => !group.collapsed)).toBe(true)
    expect(groups.every(group => group.panelIds.length === 1)).toBe(true)
  })
})

import type { SiteShortcutPlatform } from '../site/app/constants/painterCommands'
import { describe, expect, it } from 'vitest'
import {
  createDefaultSitePainterShortcutMap,
  formatSiteShortcutChord,
  resolveSitePainterShortcut,
  siteShortcutChordFromEvent,
} from '../site/app/constants/painterCommands'

interface KeyEventOptions {
  altKey?: boolean
  code?: string
  ctrlKey?: boolean
  key: string
  metaKey?: boolean
  shiftKey?: boolean
}

function keyEvent(options: KeyEventOptions): Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'> {
  return {
    altKey: options.altKey ?? false,
    code: options.code ?? '',
    ctrlKey: options.ctrlKey ?? false,
    key: options.key,
    metaKey: options.metaKey ?? false,
    shiftKey: options.shiftKey ?? false,
  }
}

describe('site painter shortcuts', () => {
  it('formats platform modifier keys for display', () => {
    expect(formatSiteShortcutChord('mod+shift+z', 'macos')).toBe('⌘⇧Z')
    expect(formatSiteShortcutChord('mod+shift+z', 'windows')).toBe('Ctrl+Shift+Z')
  })

  it('normalizes platform command chords from keyboard events', () => {
    const cases: [SiteShortcutPlatform, ReturnType<typeof keyEvent>, string][] = [
      ['macos', keyEvent({ key: 'z', code: 'KeyZ', metaKey: true }), 'mod+z'],
      ['windows', keyEvent({ key: 'z', code: 'KeyZ', ctrlKey: true }), 'mod+z'],
      ['windows', keyEvent({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true }), 'mod+shift+z'],
    ]

    for (const [platform, event, expected] of cases)
      expect(siteShortcutChordFromEvent(event, platform)).toBe(expected)
  })

  it('resolves default edit shortcuts per platform', () => {
    const shortcuts = createDefaultSitePainterShortcutMap()

    expect(resolveSitePainterShortcut(
      keyEvent({ key: 'z', code: 'KeyZ', metaKey: true }),
      shortcuts,
      'macos',
    )).toBe('edit:undo')
    expect(resolveSitePainterShortcut(
      keyEvent({ key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true }),
      shortcuts,
      'windows',
    )).toBe('edit:redo')
  })

  it('resolves zoom in from both plus and equal keys', () => {
    const shortcuts = createDefaultSitePainterShortcutMap()

    expect(resolveSitePainterShortcut(
      keyEvent({ key: '+', code: 'Equal', shiftKey: true }),
      shortcuts,
      'windows',
    )).toBe('view:zoom-in')
    expect(resolveSitePainterShortcut(
      keyEvent({ key: '=', code: 'Equal' }),
      shortcuts,
      'windows',
    )).toBe('view:zoom-in')
  })
})

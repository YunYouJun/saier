import type {
  SitePainterCommand,
  SitePainterCommandDefinition,
} from '../types/painter-app'

export type SiteShortcutPlatform = 'macos' | 'windows'

export type SiteShortcutChord = string

export type SitePainterShortcutMap = Partial<Record<SitePainterCommand, readonly SiteShortcutChord[]>>

export const SITE_PAINTER_COMMANDS = [
  { id: 'file:new', category: 'file' },
  { id: 'file:open-project', category: 'file' },
  { id: 'file:save-project', category: 'file' },
  { id: 'file:cloud-sync', category: 'file' },
  { id: 'file:import-image', category: 'file' },
  { id: 'file:export-preview', category: 'file' },
  { id: 'file:download', category: 'file' },
  { id: 'edit:undo', category: 'edit' },
  { id: 'edit:redo', category: 'edit' },
  { id: 'view:zoom-in', category: 'view' },
  { id: 'view:zoom-out', category: 'view' },
  { id: 'view:reset', category: 'view' },
  { id: 'filter:repeat', category: 'filter' },
  { id: 'filter:invert', category: 'filter' },
  { id: 'filter:grayscale', category: 'filter' },
  { id: 'tool:brush', category: 'tools' },
  { id: 'tool:eraser', category: 'tools' },
  { id: 'tool:drag', category: 'tools' },
  { id: 'tool:image', category: 'tools' },
  { id: 'tool:selection', category: 'tools' },
  { id: 'brush:size-down', category: 'brush' },
  { id: 'brush:size-up', category: 'brush' },
  { id: 'selection:cancel', category: 'selection' },
  { id: 'layer:add', category: 'layers' },
  { id: 'layer:add-group', category: 'layers' },
  { id: 'layer:move-up', category: 'layers' },
  { id: 'layer:move-down', category: 'layers' },
  { id: 'layer:remove', category: 'layers' },
  { id: 'app:keyboard-shortcuts', category: 'app' },
] as const satisfies readonly SitePainterCommandDefinition[]

const DEFAULT_SITE_PAINTER_SHORTCUTS = [
  { command: 'file:new', shortcuts: ['mod+n'] },
  { command: 'file:open-project', shortcuts: ['mod+o'] },
  { command: 'file:save-project', shortcuts: ['mod+s'] },
  { command: 'edit:undo', shortcuts: ['mod+z'] },
  { command: 'edit:redo', shortcuts: ['mod+shift+z'] },
  { command: 'view:zoom-in', shortcuts: ['plus', '='] },
  { command: 'view:zoom-out', shortcuts: ['-'] },
  { command: 'view:reset', shortcuts: ['h'] },
  { command: 'tool:brush', shortcuts: ['b'] },
  { command: 'tool:drag', shortcuts: ['d'] },
  { command: 'tool:eraser', shortcuts: ['e'] },
  { command: 'tool:image', shortcuts: ['i'] },
  { command: 'tool:selection', shortcuts: ['s'] },
  { command: 'brush:size-down', shortcuts: ['['] },
  { command: 'brush:size-up', shortcuts: [']'] },
  { command: 'selection:cancel', shortcuts: ['esc'] },
  { command: 'layer:add', shortcuts: ['mod+shift+n'] },
] as const satisfies readonly {
  command: SitePainterCommand
  shortcuts: readonly SiteShortcutChord[]
}[]

export function createDefaultSitePainterShortcutMap(): SitePainterShortcutMap {
  const shortcuts: SitePainterShortcutMap = {}

  for (const definition of SITE_PAINTER_COMMANDS)
    shortcuts[definition.id] = []

  for (const binding of DEFAULT_SITE_PAINTER_SHORTCUTS)
    shortcuts[binding.command] = [...binding.shortcuts]

  return shortcuts
}

export function detectSiteShortcutPlatform(): SiteShortcutPlatform {
  if (typeof navigator === 'undefined')
    return 'windows'

  const platform = navigator.platform.toLowerCase()
  const userAgent = navigator.userAgent.toLowerCase()
  return platform.includes('mac') || userAgent.includes('mac os')
    ? 'macos'
    : 'windows'
}

export function formatSiteShortcutChord(chord: SiteShortcutChord, platform: SiteShortcutPlatform): string {
  const parts = chord.split('+')
  const labels = parts.map(part => formatSiteShortcutPart(part, platform))

  return platform === 'macos'
    ? labels.join('')
    : labels.join('+')
}

export function formatSiteShortcutList(
  shortcuts: readonly SiteShortcutChord[] | undefined,
  platform: SiteShortcutPlatform,
  fallback = '',
): string {
  if (!shortcuts || shortcuts.length === 0)
    return fallback

  return shortcuts
    .map(chord => formatSiteShortcutChord(chord, platform))
    .join(' / ')
}

export function resolveSitePainterShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  shortcuts: SitePainterShortcutMap,
  platform: SiteShortcutPlatform,
): SitePainterCommand | undefined {
  const chord = siteShortcutChordFromEvent(event, platform)
  if (!chord)
    return undefined

  for (const definition of SITE_PAINTER_COMMANDS) {
    if (shortcuts[definition.id]?.includes(chord))
      return definition.id
  }

  return undefined
}

export function siteShortcutChordFromEvent(
  event: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey'>,
  platform: SiteShortcutPlatform,
): SiteShortcutChord | undefined {
  const key = normalizeEventKey(event)
  if (!key)
    return undefined

  const parts: string[] = []
  const hasPlatformMod = platform === 'macos' ? event.metaKey : event.ctrlKey

  if (hasPlatformMod)
    parts.push('mod')
  if (event.ctrlKey && !(platform !== 'macos' && hasPlatformMod))
    parts.push('ctrl')
  if (event.metaKey && !(platform === 'macos' && hasPlatformMod))
    parts.push('meta')
  if (event.altKey)
    parts.push('alt')
  if (event.shiftKey && key !== 'plus')
    parts.push('shift')

  parts.push(key)
  return parts.join('+')
}

function formatSiteShortcutPart(part: string, platform: SiteShortcutPlatform): string {
  if (platform === 'macos') {
    switch (part) {
      case 'mod':
      case 'meta':
        return '⌘'
      case 'shift':
        return '⇧'
      case 'alt':
        return '⌥'
      case 'ctrl':
        return '⌃'
      case 'esc':
        return 'Esc'
      case 'plus':
        return '+'
      default:
        return part.length === 1 ? part.toUpperCase() : part
    }
  }

  switch (part) {
    case 'mod':
    case 'ctrl':
      return 'Ctrl'
    case 'meta':
      return 'Meta'
    case 'shift':
      return 'Shift'
    case 'alt':
      return 'Alt'
    case 'esc':
      return 'Esc'
    case 'plus':
      return '+'
    default:
      return part.length === 1 ? part.toUpperCase() : part
  }
}

function normalizeEventKey(
  event: Pick<KeyboardEvent, 'code' | 'key'>,
): SiteShortcutChord | undefined {
  const key = event.key.toLowerCase()

  switch (key) {
    case 'escape':
    case 'esc':
      return 'esc'
    case ' ':
    case 'spacebar':
      return 'space'
    case '+':
      return 'plus'
    case '=':
    case '-':
    case '[':
    case ']':
      return key
    default:
      if (/^[a-z0-9]$/.test(key))
        return key
  }

  switch (event.code) {
    case 'Equal':
      return '='
    case 'Minus':
      return '-'
    case 'BracketLeft':
      return '['
    case 'BracketRight':
      return ']'
    default:
      return undefined
  }
}

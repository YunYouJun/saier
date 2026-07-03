import type { MaybeRefOrGetter, ShallowRef } from 'vue'
import type {
  SitePainterShortcutMap,
  SiteShortcutPlatform,
} from '~/constants/painterCommands'
import type { SitePainterCommand } from '~/types/painter-app'
import { onBeforeUnmount, onMounted, shallowRef, toValue } from 'vue'
import {
  createDefaultSitePainterShortcutMap,
  detectSiteShortcutPlatform,
  formatSiteShortcutList,
  resolveSitePainterShortcut,
} from '~/constants/painterCommands'

export interface UseSitePainterShortcutsOptions {
  canRunCommand?: (command: SitePainterCommand) => boolean
  disabled?: MaybeRefOrGetter<boolean>
  runCommand: (command: SitePainterCommand) => Promise<void> | void
}

export interface UseSitePainterShortcutsReturn {
  formatCommandShortcuts: (command: SitePainterCommand, fallback?: string) => string
  platform: ShallowRef<SiteShortcutPlatform>
  resetShortcuts: () => void
  shortcutMap: ShallowRef<SitePainterShortcutMap>
}

export function useSitePainterShortcuts(options: UseSitePainterShortcutsOptions): UseSitePainterShortcutsReturn {
  const platform = shallowRef<SiteShortcutPlatform>(detectSiteShortcutPlatform())
  const shortcutMap = shallowRef<SitePainterShortcutMap>(createDefaultSitePainterShortcutMap())

  function onKeydown(event: KeyboardEvent): void {
    if (isEditableEventTarget(event.target))
      return

    const command = resolveSitePainterShortcut(event, shortcutMap.value, platform.value)
    if (!command)
      return

    if (toValue(options.disabled)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    if (options.canRunCommand && !options.canRunCommand(command))
      return

    event.preventDefault()
    event.stopImmediatePropagation()
    void Promise.resolve(options.runCommand(command)).catch((error: unknown) => {
      console.error('Failed to run Saier shortcut command.', error)
    })
  }

  function formatCommandShortcuts(command: SitePainterCommand, fallback = ''): string {
    return formatSiteShortcutList(shortcutMap.value[command], platform.value, fallback)
  }

  function resetShortcuts(): void {
    shortcutMap.value = createDefaultSitePainterShortcutMap()
  }

  onMounted(() => {
    platform.value = detectSiteShortcutPlatform()
    window.addEventListener('keydown', onKeydown, { capture: true })
  })

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeydown, true)
  })

  return {
    formatCommandShortcuts,
    platform,
    resetShortcuts,
    shortcutMap,
  }
}

function isEditableEventTarget(target: EventTarget | null): boolean {
  if (typeof HTMLElement === 'undefined' || !(target instanceof HTMLElement))
    return false

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
}

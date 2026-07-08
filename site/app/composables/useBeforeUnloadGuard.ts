import type { MaybeRefOrGetter } from 'vue'
import type { SitePlatformBeforeUnloadEvent, SitePlatformLifecycleAdapter } from '~/types/platform-adapter'
import { onBeforeUnmount, onMounted, toValue } from 'vue'

export interface UseBeforeUnloadGuardOptions {
  lifecycle?: SitePlatformLifecycleAdapter
  onBeforeUnload?: () => void
}

export function useBeforeUnloadGuard(enabled: MaybeRefOrGetter<boolean>, options: UseBeforeUnloadGuardOptions = {}): void {
  let removeBeforeUnloadListener: (() => void) | undefined

  const handleBeforeUnload = (event: SitePlatformBeforeUnloadEvent) => {
    runBeforeUnloadGuard(event, toValue(enabled), options)
  }

  onMounted(() => {
    if (options.lifecycle) {
      removeBeforeUnloadListener = options.lifecycle.onBeforeUnload(handleBeforeUnload)
      return
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    removeBeforeUnloadListener = () => window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  onBeforeUnmount(() => {
    removeBeforeUnloadListener?.()
  })
}

export function runBeforeUnloadGuard(
  event: SitePlatformBeforeUnloadEvent,
  enabled: boolean,
  options: UseBeforeUnloadGuardOptions = {},
): boolean {
  if (enabled)
    options.onBeforeUnload?.()
  return applyBeforeUnloadGuard(event, enabled)
}

export function applyBeforeUnloadGuard(event: SitePlatformBeforeUnloadEvent, enabled: boolean): boolean {
  if (!enabled)
    return false

  event.preventDefault()
  event.returnValue = ''
  return true
}

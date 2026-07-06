import type { MaybeRefOrGetter } from 'vue'
import { onBeforeUnmount, onMounted, toValue } from 'vue'

export interface UseBeforeUnloadGuardOptions {
  onBeforeUnload?: () => void
}

export function useBeforeUnloadGuard(enabled: MaybeRefOrGetter<boolean>, options: UseBeforeUnloadGuardOptions = {}): void {
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    runBeforeUnloadGuard(event, toValue(enabled), options)
  }

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}

export function runBeforeUnloadGuard(
  event: BeforeUnloadEvent,
  enabled: boolean,
  options: UseBeforeUnloadGuardOptions = {},
): boolean {
  if (enabled)
    options.onBeforeUnload?.()
  return applyBeforeUnloadGuard(event, enabled)
}

export function applyBeforeUnloadGuard(event: BeforeUnloadEvent, enabled: boolean): boolean {
  if (!enabled)
    return false

  event.preventDefault()
  event.returnValue = ''
  return true
}

import type { MaybeRefOrGetter } from 'vue'
import { onBeforeUnmount, onMounted, toValue } from 'vue'

export function useBeforeUnloadGuard(enabled: MaybeRefOrGetter<boolean>): void {
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    applyBeforeUnloadGuard(event, toValue(enabled))
  }

  onMounted(() => {
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })
}

export function applyBeforeUnloadGuard(event: BeforeUnloadEvent, enabled: boolean): boolean {
  if (!enabled)
    return false

  event.preventDefault()
  event.returnValue = ''
  return true
}

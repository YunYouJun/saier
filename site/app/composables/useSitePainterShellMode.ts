import type { ComputedRef } from 'vue'
import type { SitePainterShellMode } from '~/types/painter-shell'
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue'
import { isCapacitorNativeRuntime } from '~/utils/capacitorRuntime'

interface SitePainterShellModeState {
  mode: ComputedRef<SitePainterShellMode>
}

const NARROW_SCREEN_QUERY = '(max-width: 820px)'
const TOUCH_WORKSPACE_QUERY = '(pointer: coarse) and (max-width: 1024px)'

export function useSitePainterShellMode(): SitePainterShellModeState {
  const mode = shallowRef<SitePainterShellMode>('desktop')
  let narrowScreenQuery: MediaQueryList | undefined
  let touchWorkspaceQuery: MediaQueryList | undefined

  function updateMode(): void {
    if (isCapacitorNativeRuntime()) {
      mode.value = 'mobile'
      return
    }

    mode.value = narrowScreenQuery?.matches || touchWorkspaceQuery?.matches
      ? 'mobile'
      : 'desktop'
  }

  onMounted(() => {
    narrowScreenQuery = window.matchMedia(NARROW_SCREEN_QUERY)
    touchWorkspaceQuery = window.matchMedia(TOUCH_WORKSPACE_QUERY)

    updateMode()
    narrowScreenQuery.addEventListener('change', updateMode)
    touchWorkspaceQuery.addEventListener('change', updateMode)
  })

  onBeforeUnmount(() => {
    narrowScreenQuery?.removeEventListener('change', updateMode)
    touchWorkspaceQuery?.removeEventListener('change', updateMode)
  })

  return {
    mode: computed(() => mode.value),
  }
}

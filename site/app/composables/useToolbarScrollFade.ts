import type { ComputedRef, ShallowRef } from 'vue'
import { computed, shallowRef, watch } from 'vue'

/** Track hidden toolbar content as the viewport, controls, and scroll position change. */
export function useToolbarScrollFade(toolbarRef: Readonly<ShallowRef<HTMLElement | null>>): ComputedRef<boolean> {
  const canScrollRight = shallowRef(false)

  watch(toolbarRef, (toolbar, _previous, onCleanup) => {
    if (!toolbar) {
      canScrollRight.value = false
      return
    }

    const updateOverflow = (): void => {
      canScrollRight.value = toolbar.scrollWidth - toolbar.clientWidth - toolbar.scrollLeft > 1
    }

    const observer = new ResizeObserver(updateOverflow)
    observer.observe(toolbar)
    for (const controls of toolbar.children)
      observer.observe(controls)

    toolbar.addEventListener('scroll', updateOverflow, { passive: true })
    updateOverflow()

    onCleanup(() => {
      observer.disconnect()
      toolbar.removeEventListener('scroll', updateOverflow)
    })
  }, { immediate: true, flush: 'post' })

  return computed(() => canScrollRight.value)
}

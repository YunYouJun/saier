import { describe, expect, it, vi } from 'vitest'
import { runBeforeUnloadGuard } from '../site/app/composables/useBeforeUnloadGuard'

function createBeforeUnloadEvent(): BeforeUnloadEvent {
  return {
    preventDefault: vi.fn(),
    returnValue: undefined,
  } as unknown as BeforeUnloadEvent
}

describe('before unload guard', () => {
  it('does nothing when there are no unsaved changes', () => {
    const event = createBeforeUnloadEvent()
    const onBeforeUnload = vi.fn()

    const guarded = runBeforeUnloadGuard(event, false, { onBeforeUnload })

    expect(guarded).toBe(false)
    expect(onBeforeUnload).not.toHaveBeenCalled()
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.returnValue).toBeUndefined()
  })

  it('flushes pending work and requests browser confirmation for unsaved changes', () => {
    const event = createBeforeUnloadEvent()
    const onBeforeUnload = vi.fn()

    const guarded = runBeforeUnloadGuard(event, true, { onBeforeUnload })

    expect(guarded).toBe(true)
    expect(onBeforeUnload).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.returnValue).toBe('')
  })
})

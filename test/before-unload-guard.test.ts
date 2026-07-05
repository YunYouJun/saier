import { describe, expect, it, vi } from 'vitest'
import { applyBeforeUnloadGuard } from '../site/app/composables/useBeforeUnloadGuard'

function createBeforeUnloadEvent(): BeforeUnloadEvent {
  return {
    preventDefault: vi.fn(),
    returnValue: undefined,
  } as unknown as BeforeUnloadEvent
}

describe('before unload guard', () => {
  it('does not block unloading when disabled', () => {
    const event = createBeforeUnloadEvent()

    expect(applyBeforeUnloadGuard(event, false)).toBe(false)

    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(event.returnValue).toBeUndefined()
  })

  it('blocks unloading when enabled', () => {
    const event = createBeforeUnloadEvent()

    expect(applyBeforeUnloadGuard(event, true)).toBe(true)

    expect(event.preventDefault).toHaveBeenCalledTimes(1)
    expect(event.returnValue).toBe('')
  })
})

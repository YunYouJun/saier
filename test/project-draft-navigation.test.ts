import { describe, expect, it, vi } from 'vitest'

import { persistProjectDraftBeforeNavigation } from '../site/app/utils/projectDraftNavigation'

describe('project draft navigation guard', () => {
  it('reports and rethrows storage failures so navigation is aborted', async () => {
    const failure = new Error('quota exceeded')
    const report = vi.fn()

    await expect(persistProjectDraftBeforeNavigation(
      () => Promise.reject(failure),
      report,
    )).rejects.toBe(failure)
    expect(report).toHaveBeenCalledWith(failure)
  })
})

/**
 * Persists a local draft before an operation that leaves the current page.
 * Reporting is kept separate from the write, while failures remain fatal to
 * the pending navigation.
 */
export async function persistProjectDraftBeforeNavigation(
  persist: () => Promise<void>,
  reportFailure: (error: unknown) => void,
): Promise<void> {
  try {
    await persist()
  }
  catch (error) {
    reportFailure(error)
    throw error
  }
}

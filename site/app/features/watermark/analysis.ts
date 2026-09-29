import type { AnalysisSnapshot, WatermarkAnalysisProvider } from './protocol.ts'
import { watermarkObject as object } from './preset-contract.ts'
import { parseAnalysis, sameSnapshot } from './protocol.ts'

export * from './protocol.ts'

/** Connect only to the explicitly paired local companion. Credentials stay in memory. */
export function createLocalCodexProvider(token: string, port = 47831): WatermarkAnalysisProvider {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Invalid companion port')
  return {
    async analyze(request, signal) {
      const response = await fetch(`http://127.0.0.1:${port}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(request),
        signal,
      })
      if (!response.ok) {
        const error: unknown = await response.json()
        throw new Error(object(error) && typeof error.error === 'string' ? error.error : `Codex: HTTP ${response.status}`)
      }
      const result: unknown = await response.json()
      if (!object(result) || !object(result.snapshot)
        || !sameSnapshot(request.snapshot, result.snapshot as unknown as AnalysisSnapshot)) {
        throw new Error('Analysis belongs to a different snapshot')
      }
      return {
        snapshot: { ...request.snapshot },
        analysis: parseAnalysis(result.analysis, request.preset, request.snapshot),
        threadId: typeof result.threadId === 'string' && /^[\w-]{1,100}$/.test(result.threadId) ? result.threadId : undefined,
      }
    },
  }
}

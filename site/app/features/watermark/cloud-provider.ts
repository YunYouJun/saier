import type { WatermarkAnalysisProvider } from './protocol'
import { watermarkObject } from './preset-contract'
import { parseAnalysis, sameSnapshot } from './protocol'

/** Calls the account-owned Runtime; no provider model, tariff or account ID comes from the browser. */
export function createCloudWatermarkProvider(endpoint: string, getToken: () => Promise<string>): WatermarkAnalysisProvider {
  const url = new URL(endpoint)
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/ai/v2/apps/saier/watermark' || url.search || url.hash)
    throw new Error('无效的云乐坊水印服务地址')
  return {
    async analyze(request, signal) {
      if (!request.preset)
        throw new Error('云端布局分析需要先导入水印预设')
      const token = await getToken()
      signal.throwIfAborted()
      const response = await fetch(url, {
        method: 'POST',
        signal,
        credentials: 'omit',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ snapshot: request.snapshot, image: request.image, rules: request.rules, preset: request.preset }),
      })
      const body: unknown = await response.json().catch(() => undefined)
      if (!response.ok) {
        if (response.status === 504)
          throw new Error('云端网关等待超时，原分析可能仍在处理；请稍后检查账单，避免立即重复提交。')
        const code = watermarkObject(body) && watermarkObject(body.error) && typeof body.error.code === 'string' ? body.error.code : `HTTP ${response.status}`
        throw new Error(`云端分析失败：${code}`)
      }
      if (!watermarkObject(body) || !watermarkObject(body.result) || !watermarkObject(body.result.snapshot)
        || !sameSnapshot(request.snapshot, body.result.snapshot as unknown as typeof request.snapshot)
        || !watermarkObject(body.usage) || !Number.isSafeInteger(body.usage.chargedMicroPoints) || Number(body.usage.chargedMicroPoints) < 0) {
        throw new Error('云端结果与当前画作不匹配')
      }
      return {
        snapshot: { ...request.snapshot },
        analysis: parseAnalysis(body.result.analysis, request.preset, request.snapshot),
        chargedMicroPoints: Number(body.usage.chargedMicroPoints),
        operationId: typeof body.operationId === 'string' ? body.operationId : undefined,
      }
    },
  }
}

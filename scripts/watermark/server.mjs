import { Buffer } from 'node:buffer'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { analyzeWithCodex, validateRequest } from './codex.mjs'
import { openCodexThread } from './desktop.mjs'

/** Local companion with an exact origin, per-run pairing secret and one in-flight job. */
export function createWatermarkServer({ origin, token, analyze = analyzeWithCodex, openThread = openCodexThread, timeoutMs = 120_000 }) {
  let busy = false
  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      if (!res.destroyed)
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))
    }
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}` || req.headers.origin !== origin)
      return reply(403, { error: 'Unpaired origin' })
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      return res.writeHead(204).end()
    }
    const actual = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
      return reply(401, { error: 'Pairing code is invalid or expired' })
    if (req.url !== '/analyze' || req.method !== 'POST')
      return reply(404, { error: 'Unknown operation' })
    if (!req.headers['content-type']?.startsWith('application/json'))
      return reply(415, { error: 'Expected JSON' })
    if (busy)
      return reply(409, { error: 'A Codex analysis is already running' })
    busy = true
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('Analysis timed out')), timeoutMs)
    res.on('close', () => controller.abort())
    try {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 6_100_000) {
          reply(413, { error: 'Image request is too large' })
          req.destroy()
          return
        }
        chunks.push(chunk)
      }
      let input
      try {
        input = JSON.parse(Buffer.concat(chunks).toString())
        validateRequest(input)
      }
      catch {
        return reply(400, { error: 'Invalid PNG snapshot or placement rules' })
      }
      const result = await analyze(input, controller.signal)
      controller.signal.throwIfAborted()
      if (input.openDesktop && result.threadId) {
        try {
          await openThread(result.threadId)
        }
        catch {
          result.analysis.warnings = [...result.analysis.warnings.slice(0, 15), '分析已完成，但无法自动打开桌面记录。请使用页面中的 Codex 链接。']
        }
      }
      reply(200, result)
    }
    catch (error) {
      reply(controller.signal.aborted ? 408 : 502, { error: controller.signal.aborted ? 'Analysis cancelled or timed out' : String(error.message).slice(0, 500) })
    }
    finally {
      clearTimeout(timer)
      busy = false
    }
  })
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  return server
}

export function createPairingToken() {
  return randomBytes(32).toString('hex')
}

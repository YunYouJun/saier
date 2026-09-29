import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { createServer } from 'node:http'
import { generateWithCodex, parseRemixInput } from './codex.mjs'

/** Paired loopback endpoint with one active image job and bounded input/time. */
export function createRemixServer({ origin, token, generate = generateWithCodex, timeoutMs = 240_000 }) {
  let active
  const server = createServer(async (req, res) => {
    const reply = (status, body) => {
      if (!res.destroyed)
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end(JSON.stringify(body))
    }
    if (req.headers.host !== `127.0.0.1:${server.address()?.port}` || req.headers.origin !== origin)
      return reply(403, { error: 'Unpaired page origin.' })
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
      return reply(401, { error: 'Invalid or expired pairing code.' })
    if (req.url !== '/generate' || req.method !== 'POST')
      return reply(404, { error: 'Unknown operation.' })
    if (!req.headers['content-type']?.startsWith('application/json'))
      return reply(415, { error: 'Expected JSON.' })
    if (active)
      return reply(409, { error: 'A local image generation is already running.' })
    const controller = new AbortController()
    active = controller
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    res.on('close', () => controller.abort())
    try {
      const chunks = []
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > 3_100_000) {
          reply(413, { error: 'Selection image is too large.' })
          req.destroy()
          return
        }
        chunks.push(chunk)
      }
      let input
      try {
        input = JSON.parse(Buffer.concat(chunks).toString())
        parseRemixInput(input)
      }
      catch {
        return reply(400, { error: 'Invalid selection PNG or effect.' })
      }
      const result = await generate(input, controller.signal)
      controller.signal.throwIfAborted()
      reply(200, result)
    }
    catch {
      reply(controller.signal.aborted ? 408 : 502, {
        error: controller.signal.aborted
          ? 'Generation cancelled or timed out.'
          : 'Codex generation failed. Check local Codex login, image access and available usage.',
      })
    }
    finally {
      clearTimeout(timer)
      active = undefined
    }
  })
  server.on('close', () => active?.abort())
  server.requestTimeout = 15_000
  server.headersTimeout = 10_000
  return server
}

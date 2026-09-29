import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { analyzeWithCodex, validateRequest } from '../scripts/watermark/codex.mjs'
import { createWatermarkServer } from '../scripts/watermark/server.mjs'
import { parseAnalysis, sameSnapshot } from '../site/app/features/watermark/analysis'
import { findWatermarkPlacement } from '../site/app/features/watermark/layout'

async function fixture() {
  const bytes = await readFile(new URL('../site/public/pwa-192x192.png', import.meta.url))
  return {
    snapshot: { documentId: 'a', revision: 1, sha256: createHash('sha256').update(bytes).digest('hex'), width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) },
    image: `data:image/png;base64,${bytes.toString('base64')}`,
    rules: 'avoid faces',
  }
}

describe('watermark analysis boundary', () => {
  it('rejects invalid geometry, excessive output and snapshots with altered bytes', async () => {
    const valid = { regions: [{ label: 'face', x: 0.2, y: 0.1, width: 0.3, height: 0.4 }], warnings: [] }
    expect(parseAnalysis(valid)).toEqual(valid)
    for (const x of [Number.NaN, -0.1, 0.9])
      expect(() => parseAnalysis({ ...valid, regions: [{ ...valid.regions[0], x }] })).toThrow()
    expect(() => parseAnalysis({ regions: Array.from({ length: 65 }).fill(valid.regions[0]), warnings: [] })).toThrow()
    const request = await fixture()
    expect(validateRequest(request).snapshot).toEqual(request.snapshot)
    expect(() => validateRequest({ ...request, snapshot: { ...request.snapshot, width: 1 } })).toThrow()
    expect(() => validateRequest({ ...request, snapshot: { ...request.snapshot, sha256: 'a'.repeat(64) } })).toThrow()
    expect(sameSnapshot(request.snapshot, { ...request.snapshot, revision: 2 })).toBe(false)
  })

  it('maps normalized regions to document space and refuses an entirely protected picture', () => {
    const canvas = { width: 1000, height: 500 }
    const watermark = { width: 100, height: 50 }
    const region = { label: 'face', x: 0.6, y: 0.5, width: 0.4, height: 0.5 }
    const placement = findWatermarkPlacement(canvas, watermark, [region], 0.2)!
    expect(placement.x + placement.width).toBeLessThan(600)
    expect(placement).toEqual(findWatermarkPlacement(canvas, watermark, [region], 0.2))
    expect(findWatermarkPlacement(canvas, watermark, [{ ...region, x: 0, y: 0, width: 1, height: 1 }], 0.2)).toBeUndefined()
  })
})

describe('companion access', () => {
  const cleanups: (() => Promise<void>)[] = []
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map(cleanup => cleanup()))
  })

  it('requires origin and pairing, rejects malformed input, and returns a bound result', async () => {
    let calls = 0
    let opened = ''
    const server = createWatermarkServer({
      origin: 'http://localhost:8080',
      token: 'test-secret',
      openThread: async (id: string) => {
        opened = id
      },
      analyze: async (input: Awaited<ReturnType<typeof fixture>>) => {
        calls++
        return { snapshot: input.snapshot, analysis: { regions: [], warnings: ['fixture'] }, threadId: 'fixture-thread' }
      },
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise(resolve => server.close(() => resolve())))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing server address')
    const url = `http://127.0.0.1:${address.port}/analyze`
    const headers = { 'Origin': 'http://localhost:8080', 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' }
    expect((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://evil.example' } })).status).toBe(403)
    expect((await fetch(url, { method: 'POST', headers: { ...headers, Authorization: 'Bearer wrong' } })).status).toBe(401)
    expect((await fetch(url, { method: 'POST', headers, body: '{}' })).status).toBe(400)
    expect(calls).toBe(0)
    const input = { ...await fixture(), openDesktop: true }
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(input) })
    expect(response.status).toBe(200)
    expect((await response.json()).snapshot).toEqual(input.snapshot)
    expect(calls).toBe(1)
    expect(opened).toBe('fixture-thread')
  })

  it('parses the Codex event stream and final schema output', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'saier-fake-codex-'))
    cleanups.push(() => rm(dir, { recursive: true, force: true }))
    const executable = join(dir, 'codex')
    await writeFile(executable, `#!/usr/bin/env node
const fs = require('fs')
const output = process.argv[process.argv.indexOf('--output-last-message') + 1]
process.stdin.resume()
process.stdin.on('end', () => {
  fs.writeFileSync(output, JSON.stringify({regions:[],warnings:[]}))
  console.log(JSON.stringify({type:'thread.started',thread_id:'fixture-thread'}))
  console.log(JSON.stringify({type:'item.completed',item:{type:'error',message:'Non-fatal startup warning'}}))
  console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'{}'}}))
})
`, { mode: 0o700 })
    const request = await fixture()
    const result = await analyzeWithCodex(request, AbortSignal.timeout(5000), { executable })
    expect(result).toEqual({ snapshot: request.snapshot, analysis: { regions: [], warnings: [] }, threadId: 'fixture-thread' })
  })

  it('limits concurrency and aborts the provider when a request times out', async () => {
    let started: () => void = () => {}
    const running = new Promise<void>((resolve) => {
      started = resolve
    })
    let cancelled = false
    const server = createWatermarkServer({
      origin: 'http://localhost:8080',
      token: 'test-secret',
      timeoutMs: 200,
      analyze: (_input: unknown, signal: AbortSignal) => new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          cancelled = true
          reject(signal.reason)
        }, { once: true })
        started()
      }),
    })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanups.push(() => new Promise(resolve => server.close(() => resolve())))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing server address')
    const url = `http://127.0.0.1:${address.port}/analyze`
    const options = { method: 'POST', headers: { 'Origin': 'http://localhost:8080', 'Authorization': 'Bearer test-secret', 'Content-Type': 'application/json' }, body: JSON.stringify(await fixture()) }
    const pending = fetch(url, options)
    await running
    expect((await fetch(url, options)).status).toBe(409)
    expect((await pending).status).toBe(408)
    expect(cancelled).toBe(true)
  })
})

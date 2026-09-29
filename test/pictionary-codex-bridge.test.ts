import { Buffer } from 'node:buffer'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createCodexRpc, generateWithCodex, parseRemixInput } from '../scripts/ai-remix/codex.mjs'
import { createRemixServer } from '../scripts/ai-remix/server.mjs'

const cleanup: Array<() => Promise<unknown>> = []
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map(fn => fn()))
})

// Header-only transport fixture; image decode is covered in the browser tests.
function png(): string {
  const bytes = Buffer.alloc(33)
  Buffer.from('89504e470d0a1a0a', 'hex').copy(bytes)
  bytes.write('IHDR', 12)
  bytes.writeUInt32BE(512, 16)
  bytes.writeUInt32BE(512, 20)
  return `data:image/png;base64,${bytes.toString('base64')}`
}

function fakeRuntime({ complete = true, savedPath = '', interactive = false } = {}) {
  const calls: Array<{ method: string, params: Record<string, unknown> }> = []
  const child = Object.assign(new EventEmitter(), {
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => {
      queueMicrotask(() => child.emit('close', 0))
      return true
    }),
  })
  const emit = (message: object) => child.stdout.write(`${JSON.stringify(message)}\n`)
  child.stdin.on('data', (chunk) => {
    const request = JSON.parse(chunk.toString())
    if (!request.method)
      return
    calls.push(request)
    if (request.id === undefined)
      return
    queueMicrotask(() => {
      const results: Record<string, object> = {
        'initialize': {},
        'account/read': { requiresOpenaiAuth: true, account: { type: 'chatgpt' } },
        'config/read': { config: { model: 'desktop-only', mcp_servers: { private: { enabled: true } } } },
        'model/list': { data: [{ model: 'available-default', isDefault: true, defaultReasoningEffort: 'medium' }] },
        'thread/start': { thread: { id: 'thread-1' } },
        'turn/start': { turn: { id: 'turn-1' } },
        'turn/interrupt': {},
      }
      emit({ id: request.id, result: results[request.method] })
      if (request.method !== 'turn/start')
        return
      if (interactive) {
        emit({ id: 99, method: 'item/commandExecution/requestApproval', params: { threadId: 'thread-1' } })
      }
      else if (complete) {
        emit({ method: 'item/completed', params: { threadId: 'thread-1', item: {
          id: 'image-1',
          type: 'imageGeneration',
          status: 'completed',
          result: savedPath ? '' : png().split(',')[1],
          savedPath,
        } } })
        emit({ method: 'turn/completed', params: { threadId: 'thread-1', turn: { id: 'turn-1', status: 'completed' } } })
      }
    })
  })
  const spawnProcess = vi.fn(() => child)
  return { calls, child, spawnProcess, createRpc: (options: object) => createCodexRpc({ ...options, spawnProcess }) }
}

describe('codex image companion', () => {
  it('uses the App Server handshake and a fixed image-only turn, then returns image bytes', async () => {
    const runtime = fakeRuntime()
    const result = await generateWithCodex({ imageDataUrl: png(), effect: 'polish', prompt: 'ignored', model: 'ignored' }, new AbortController().signal, runtime)
    expect(result).toEqual({ imageDataUrl: png() })
    expect(runtime.spawnProcess).toHaveBeenCalledWith('codex', expect.arrayContaining(['code_mode_host', 'image_generation']), expect.objectContaining({ shell: false }))
    expect(runtime.calls.map(call => call.method)).toEqual(['initialize', 'initialized', 'account/read', 'config/read', 'model/list', 'thread/start', 'turn/start'])
    const thread = runtime.calls.find(call => call.method === 'thread/start')!.params
    expect(thread).toMatchObject({ ephemeral: true, approvalPolicy: 'never', sandbox: 'read-only', model: 'available-default', config: { 'mcp_servers.private.enabled': false, 'model_reasoning_effort': 'medium' } })
    const turn = runtime.calls.at(-1)!.params
    expect(turn).not.toHaveProperty('model')
    expect(turn.input).toEqual([expect.objectContaining({ type: 'text', text: expect.stringContaining('Clean up the lines') }), expect.objectContaining({ type: 'localImage', path: expect.stringContaining('/selection.png') })])
    expect(runtime.child.kill).toHaveBeenCalled()
  })

  it('interrupts a cancelled turn and closes the runtime', async () => {
    const runtime = fakeRuntime({ complete: false })
    const controller = new AbortController()
    const job = generateWithCodex({ imageDataUrl: png(), effect: 'texture' }, controller.signal, runtime)
    const rejected = expect(job).rejects.toThrow('cancelled')
    await vi.waitFor(() => expect(runtime.calls.at(-1)?.method).toBe('turn/start'))
    controller.abort()
    await rejected
    expect(runtime.calls.at(-1)?.method).toBe('turn/interrupt')
    expect(runtime.child.kill).toHaveBeenCalled()
  })

  it('rejects arbitrary paths and approval requests instead of forwarding capabilities', async () => {
    expect(() => parseRemixInput({ imageDataUrl: 'file:///etc/passwd', effect: 'polish' })).toThrow()
    expect(() => parseRemixInput({ imageDataUrl: png(), effect: 'custom prompt' })).toThrow()
    await expect(generateWithCodex({ imageDataUrl: png(), effect: 'polish' }, new AbortController().signal, fakeRuntime({ interactive: true }))).rejects.toThrow('unsupported interactive')
    await expect(generateWithCodex({ imageDataUrl: png(), effect: 'polish' }, new AbortController().signal, fakeRuntime({ savedPath: '/etc/hosts' }))).rejects.toThrow('outside')
  })

  it('requires pairing and the exact page origin, and rejects concurrent jobs', async () => {
    let finish!: (value: { imageDataUrl: string }) => void
    const generate = vi.fn(() => new Promise((resolve) => {
      finish = resolve
    }))
    const server = createRemixServer({ origin: 'http://localhost:8080', token: 'test-pairing', generate })
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    cleanup.push(async () => {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    })
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing test listener')
    const url = `http://127.0.0.1:${address.port}/generate`
    const headers = { 'Origin': 'http://localhost:8080', 'Authorization': 'Bearer test-pairing', 'Content-Type': 'application/json' }
    const body = JSON.stringify({ effect: 'polish', imageDataUrl: png() })
    expect((await fetch(url, { method: 'POST', headers: { ...headers, Origin: 'https://attacker.invalid' }, body })).status).toBe(403)
    expect((await fetch(url, { method: 'POST', headers: { ...headers, Authorization: 'Bearer wrong' }, body })).status).toBe(401)
    expect(generate).not.toHaveBeenCalled()
    const first = fetch(url, { method: 'POST', headers, body })
    await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce())
    expect((await fetch(url, { method: 'POST', headers, body })).status).toBe(409)
    finish({ imageDataUrl: png() })
    const response = await first
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ imageDataUrl: png() })
  })
})

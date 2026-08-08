import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const rootDir = resolve(import.meta.dirname, '..')

describe('saier realtime runtime', () => {
  it('does not poll the global deadline collection from each container instance', () => {
    const source = readFileSync(resolve(rootDir, 'cloudbase/run/saier-realtime/server.cjs'), 'utf8')

    expect(source).not.toContain('deadlineWorker.scanDue')
    expect(source).not.toContain('deadlineWorker.rebuildAccelerationIndex')
  })

  it('serializes the remaining outbox poll', () => {
    const source = readFileSync(resolve(rootDir, 'cloudbase/run/saier-realtime/server.cjs'), 'utf8')

    expect(source).toContain('if (workerRunning)')
    expect(source).toContain('workerRunning = true')
    expect(source).toContain('workerRunning = false')
  })
})

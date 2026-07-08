import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const cleanupScriptPath = fileURLToPath(new URL('../scripts/cleanup-yunlefun-test-data.mjs', import.meta.url))

describe('yunLeFun cleanup management command', () => {
  it('accepts pnpm argument separators before help flags', () => {
    const output = execFileSync(process.execPath, [cleanupScriptPath, '--', '--help'], {
      encoding: 'utf8',
    })

    expect(output).toContain('pnpm cleanup:yunlefun-test-data')
    expect(output).toContain('--confirm')
    expect(output).toContain('--include-user-storage')
  })
})

import { spawn } from 'node:child_process'
import { once } from 'node:events'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'

const electronDir = path.resolve(fileURLToPath(import.meta.url), '../..')
const repoRoot = path.resolve(electronDir, '../..')
const rendererUrl = process.env.SAIER_ELECTRON_RENDERER_URL || 'http://localhost:8080/'

const children = new Set()

process.on('SIGINT', () => shutdown(130))
process.on('SIGTERM', () => shutdown(143))

spawnCommand('pnpm', ['-C', path.join(repoRoot, 'site'), 'run', 'dev'], {
  cwd: repoRoot,
  env: process.env,
})

await waitForHttp(rendererUrl)

const electron = spawnCommand('pnpm', ['-C', electronDir, 'exec', 'electron', '.'], {
  cwd: repoRoot,
  env: {
    ...process.env,
    SAIER_ELECTRON_RENDERER_URL: rendererUrl,
  },
})

const [code] = await once(electron, 'exit')
shutdown(typeof code === 'number' ? code : 0)

function spawnCommand(command, args, options) {
  const child = spawn(command, args, {
    ...options,
    stdio: 'inherit',
  })
  children.add(child)
  child.on('exit', () => children.delete(child))
  return child
}

async function waitForHttp(url) {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok || response.status < 500)
        return
    }
    catch {}
    await delay(500)
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function shutdown(exitCode) {
  for (const child of children)
    child.kill('SIGTERM')
  process.exit(exitCode)
}

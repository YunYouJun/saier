import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const siteRoot = resolve(repositoryRoot, 'site')
const caddyConfig = resolve(repositoryRoot, 'dev/Caddyfile')
const appOrigin = 'https://saier.yunle.localhost:3452'
const developmentCloudbaseEnv = 'yunlefun-dev-0ge03bdod37093d1'
const developmentSsoOrigin = 'https://www.yunle.localhost:3000'
const developmentSsoExchangeUrl = `${developmentSsoOrigin}/api/sso-ticket`
const children = []
let stopping = false

function probePort(port) {
  return new Promise((resolvePort, rejectPort) => {
    const server = createServer()
    server.once('error', rejectPort)
    server.listen(port, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectPort(new Error('Unable to select a Nuxt loopback port'))
        return
      }
      server.close(error => error ? rejectPort(error) : resolvePort(address.port))
    })
  })
}

async function selectUpstreamPort() {
  try {
    return await probePort(8080)
  }
  catch (error) {
    if (error?.code !== 'EADDRINUSE')
      throw error
    return probePort(0)
  }
}

async function assertCommand(command, installHint) {
  await new Promise((resolveCheck, rejectCheck) => {
    const check = spawn(command, ['version'], { stdio: 'ignore' })
    check.once('error', () => rejectCheck(new Error(`${command} is required. ${installHint}`)))
    check.once('exit', code => code === 0
      ? resolveCheck()
      : rejectCheck(new Error(`${command} version check failed with exit code ${code}`)))
  })
}

function start(label, command, args, options = {}) {
  const child = spawn(command, args, {
    cwd: repositoryRoot,
    env: process.env,
    stdio: 'inherit',
    ...options,
  })
  children.push({ child, label })
  return child
}

function stopChildren(signal = 'SIGTERM') {
  if (stopping)
    return
  stopping = true
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill(signal)
  }
}

function waitForExit(child, label) {
  return new Promise((resolveExit) => {
    child.once('error', error => resolveExit({ label, code: 1, error }))
    child.once('exit', (code, signal) => resolveExit({ label, code, signal }))
  })
}

await access(caddyConfig)
await assertCommand('caddy', 'Install Caddy and ensure the caddy executable is available on PATH.')
const upstreamPort = await selectUpstreamPort()
const upstream = `127.0.0.1:${upstreamPort}`

console.log(`Saier SSO development origin: ${appOrigin}`)
console.log(`SSO Provider: ${process.env.NUXT_PUBLIC_YUNLEFUN_SSO_ORIGIN ?? developmentSsoOrigin}`)
console.log(`Nuxt upstream: http://${upstream}`)

const gateway = start('Caddy HTTPS gateway', 'caddy', [
  'run',
  '--config',
  caddyConfig,
  '--adapter',
  'caddyfile',
], {
  env: {
    ...process.env,
    YUNLE_SAIER_UPSTREAM: upstream,
  },
})
const site = start('Nuxt site', 'pnpm', [
  'exec',
  'nuxt',
  'dev',
  '--host',
  '127.0.0.1',
  '--port',
  String(upstreamPort),
], {
  cwd: siteRoot,
  env: {
    ...process.env,
    NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV: process.env.NUXT_PUBLIC_YUNLEFUN_CLOUDBASE_ENV ?? developmentCloudbaseEnv,
    NUXT_PUBLIC_YUNLEFUN_SSO_CLIENT_ID: 'saier-web',
    NUXT_PUBLIC_YUNLEFUN_SSO_EXCHANGE_URL: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_EXCHANGE_URL ?? developmentSsoExchangeUrl,
    NUXT_PUBLIC_YUNLEFUN_SSO_ORIGIN: process.env.NUXT_PUBLIC_YUNLEFUN_SSO_ORIGIN ?? developmentSsoOrigin,
    NUXT_PUBLIC_YUNLEFUN_SSO_REDIRECT_URI: `${appOrigin}/`,
  },
})
const gatewayExit = waitForExit(gateway, 'Caddy HTTPS gateway')
const siteExit = waitForExit(site, 'Nuxt site')

for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => stopChildren(signal))

const firstExit = await Promise.race([
  gatewayExit,
  siteExit,
])

if (!stopping) {
  const detail = firstExit.error?.message
    ?? (firstExit.signal ? `signal ${firstExit.signal}` : `exit code ${firstExit.code}`)
  console.error(`${firstExit.label} stopped unexpectedly (${detail})`)
  process.exitCode = firstExit.code || 1
  stopChildren()
}

const forceStop = setTimeout(() => {
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null)
      child.kill('SIGKILL')
  }
}, 5_000)

await Promise.all([gatewayExit, siteExit])
clearTimeout(forceStop)

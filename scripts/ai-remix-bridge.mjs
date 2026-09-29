import { randomBytes } from 'node:crypto'
import process from 'node:process'
import { createRemixServer } from './ai-remix/server.mjs'

const origin = new URL(process.env.SAIER_REMIX_ORIGIN ?? 'http://localhost:8080').origin
const port = Number(process.env.SAIER_REMIX_PORT ?? 47832)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid SAIER_REMIX_PORT')
const token = randomBytes(32).toString('hex')
const server = createRemixServer({ origin, token })
server.listen(port, '127.0.0.1', () => {
  console.log(`Saier Codex image bridge: http://127.0.0.1:${port}`)
  console.log(`Allowed page origin: ${origin}`)
  console.log(`Pairing code (this run only): ${token}`)
})
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeAllConnections()
    server.close()
  })
}

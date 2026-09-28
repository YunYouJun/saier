import process from 'node:process'
import { createPairingToken, createWatermarkServer } from './watermark/server.mjs'

const origin = new URL(process.env.SAIER_ANALYSIS_ORIGIN ?? 'http://localhost:8080').origin
const port = Number(process.env.SAIER_ANALYSIS_PORT ?? 47831)
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error('Invalid SAIER_ANALYSIS_PORT')
const token = createPairingToken()
const server = createWatermarkServer({ origin, token })
server.listen(port, '127.0.0.1', () => {
  console.log(`Saier Codex analysis: http://127.0.0.1:${port}`)
  console.log(`Allowed page origin: ${origin}`)
  console.log(`Pairing code (this run only): ${token}`)
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.closeAllConnections()
    server.close()
  })
}

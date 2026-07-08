import { cp, mkdir, rm, stat } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const siteOutputDir = resolve(appDir, '../../site/.output/public')
const mobileWebDir = resolve(appDir, 'www')
const siteIndexFile = resolve(siteOutputDir, 'index.html')

async function pathExists(path) {
  try {
    await stat(path)
    return true
  }
  catch (error) {
    if (error && error.code === 'ENOENT')
      return false

    throw error
  }
}

if (!await pathExists(siteIndexFile)) {
  throw new Error('Missing site static output. Run `pnpm generate:site` before preparing the mobile web bundle.')
}

await rm(mobileWebDir, { force: true, recursive: true })
await mkdir(mobileWebDir, { recursive: true })
await cp(siteOutputDir, mobileWebDir, { recursive: true })

console.log(`Prepared Capacitor web bundle: ${mobileWebDir}`)

import { Buffer } from 'node:buffer'
import { copyFile, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

// The editable SVG is the single source for web, docs and install icons.
// Uses the existing Playwright dependency; no additional graphics tools needed.
const sitePublic = new URL('../site/public/', import.meta.url)
const docsPublic = new URL('../docs/public/', import.meta.url)
const source = new URL('logo.svg', sitePublic)
const svg = await readFile(source, 'utf8')
await copyFile(source, new URL('favicon.svg', sitePublic))
await copyFile(source, new URL('logo.svg', docsPublic))
await copyFile(source, new URL('favicon.svg', docsPublic))

const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ deviceScaleFactor: 1 })

  async function render(size, { maskable = false, opaque = false } = {}) {
    await page.setViewportSize({ width: size, height: size })
    const artwork = maskable
      ? `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><rect width="128" height="128" fill="#fff"/><svg viewBox="0 0 128 128" x="16" y="16" width="96" height="96">${svg.replace(/<svg[^>]*>|<\/svg>/g, '')}</svg></svg>`
      : svg
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:${opaque ? '#fff' : 'transparent'}}body>svg{display:block;width:100%;height:100%}</style>${artwork}`)
    return page.screenshot({ omitBackground: !opaque })
  }

  for (const [filename, size, options] of [
    ['pwa-192x192.png', 192, {}],
    ['pwa-512x512.png', 512, {}],
    ['apple-touch-icon.png', 180, { opaque: true }],
    ['maskable-icon.png', 512, { maskable: true, opaque: true }],
  ]) {
    await writeFile(new URL(filename, sitePublic), await render(size, options))
  }

  // ICO directory containing PNG frames, including a real 16px browser icon.
  const sizes = [16, 32, 48]
  const frames = []
  for (const size of sizes)
    frames.push(await render(size))
  const header = Buffer.alloc(6 + 16 * frames.length)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)
  let offset = header.length
  for (const [index, frame] of frames.entries()) {
    const entry = 6 + 16 * index
    header[entry] = sizes[index]
    header[entry + 1] = sizes[index]
    header.writeUInt16LE(1, entry + 4)
    header.writeUInt16LE(32, entry + 6)
    header.writeUInt32LE(frame.length, entry + 8)
    header.writeUInt32LE(offset, entry + 12)
    offset += frame.length
  }
  await writeFile(new URL('favicon.ico', sitePublic), Buffer.concat([header, ...frames]))
  console.log(`Generated Saier brand assets from ${fileURLToPath(source)}`)
}
finally {
  await browser.close()
}

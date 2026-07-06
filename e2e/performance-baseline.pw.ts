import type { Buffer } from 'node:buffer'
import type { ChildProcessWithoutNullStreams } from 'node:child_process'
import { spawn } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'

interface BaselineSample {
  strokeCount: number
  elapsedMs: number
  totalEstimatedBytes: number
  surfaceEstimatedBytes: number
  undoEstimatedBytes: number
  undoCount: number
  allocatedTileCount: number
  displayTileCount: number
  derivedTileCount: number
}

interface BaselineCase {
  id: string
  label: string
  canvas: {
    width: number
    height: number
    viewportSize: number
  }
  brushSize: number
  strokeCount: number
  inputPointCount: number
  dabCount: number
  drawDurationMs: number
  dabThroughput: number
  uploadCount: number
  tileSize: number
  allocatedTileCount: number
  displayTileCount: number
  derivedTileCount: number
  memory: {
    riskLevel: string
    totalEstimatedBytes: number
    surfaceEstimatedBytes: number
    undoEstimatedBytes: number
    browserBytes?: number
  }
  longSession: {
    samples: BaselineSample[]
    summary: {
      undoCapacity: number
      stableFromStrokeCount: number
      memoryDriftAfterUndoCapacityBytes: number
      maxTotalEstimatedBytes: number
      stableWithinFourTiles: boolean
    }
  }
}

interface BaselineResult {
  schemaVersion: number
  generatedAt: string
  environment: {
    userAgent: string
    devicePixelRatio: number
  }
  cases: BaselineCase[]
}

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const outputDir = resolve(rootDir, 'docs/design/performance-baseline')
const perfServerPort = 51740
const perfServerUrl = `http://127.0.0.1:${perfServerPort}`
let perfServer: ChildProcessWithoutNullStreams | undefined
const perfServerLogs: string[] = []

test.skip(process.env.SAIER_PERF_BASELINE !== '1', 'Run with `pnpm perf:baseline` to update performance baseline artifacts.')

test.beforeAll(async () => {
  if (process.env.SAIER_PERF_BASELINE !== '1')
    return

  perfServer = spawn(
    resolve(rootDir, 'examples/vue/node_modules/.bin/vite'),
    [
      '--config',
      resolve(rootDir, 'examples/vue/vite.perf.config.ts'),
      '--host',
      '127.0.0.1',
      '--port',
      String(perfServerPort),
    ],
    {
      cwd: rootDir,
      env: {
        ...process.env,
        NO_COLOR: '1',
      },
    },
  )

  perfServer.stdout.on('data', chunk => recordServerLog(chunk))
  perfServer.stderr.on('data', chunk => recordServerLog(chunk))

  await waitForServer(`${perfServerUrl}/perf-baseline.html`, 60_000)
})

test.afterAll(async () => {
  if (!perfServer || perfServer.exitCode !== null)
    return

  perfServer.kill('SIGTERM')
  await new Promise<void>((resolveDone) => {
    const timeout = setTimeout(resolveDone, 2_000)
    perfServer?.once('exit', () => {
      clearTimeout(timeout)
      resolveDone()
    })
  })
})

test('records tiled painting performance baseline artifacts', async ({ page }, testInfo) => {
  await page.goto(`${perfServerUrl}/perf-baseline.html`)

  await expect
    .poll(
      () => page.evaluate(() => typeof (globalThis as any).__SAIER_RUN_PERF_BASELINE__),
      { timeout: 15_000, message: 'performance baseline runner should be exposed' },
    )
    .toBe('function')

  const result = await page.evaluate(async () => {
    const run = (globalThis as any).__SAIER_RUN_PERF_BASELINE__
    return await run()
  }) as BaselineResult

  expect(result.schemaVersion).toBe(1)
  expect(result.cases.map(item => item.id)).toEqual(['1024-square', '4096-square'])

  for (const item of result.cases) {
    expect(item.dabCount, `${item.label}: should paint actual dabs`).toBeGreaterThan(0)
    expect(item.dabThroughput, `${item.label}: should record dab throughput`).toBeGreaterThan(0)
    expect(item.allocatedTileCount, `${item.label}: should allocate touched tiles`).toBeGreaterThan(0)
    expect(item.memory.totalEstimatedBytes, `${item.label}: should report memory estimate`).toBeGreaterThan(0)
    expect(item.longSession.samples.length, `${item.label}: should record stability samples`).toBeGreaterThan(1)
    expect(item.longSession.summary.stableFromStrokeCount).toBeGreaterThanOrEqual(
      item.longSession.summary.undoCapacity,
    )

    const fullCanvasTileCount = Math.ceil(item.canvas.width / item.tileSize) * Math.ceil(item.canvas.height / item.tileSize)
    expect(
      item.allocatedTileCount,
      `${item.label}: bounded drawing should stay sparse against full canvas tile count`,
    ).toBeLessThan(fullCanvasTileCount)
  }

  await mkdir(outputDir, { recursive: true })

  const jsonPath = resolve(outputDir, 'latest.json')
  const markdownPath = resolve(outputDir, 'latest.md')
  const screenshotPath = resolve(outputDir, 'latest.png')

  await writeFile(jsonPath, `${JSON.stringify(result, null, 2)}\n`)
  await writeFile(markdownPath, renderMarkdown(result))
  await page.screenshot({ path: screenshotPath, fullPage: true })

  await testInfo.attach('performance-baseline-json', { path: jsonPath, contentType: 'application/json' })
  await testInfo.attach('performance-baseline-markdown', { path: markdownPath, contentType: 'text/markdown' })
  await testInfo.attach('performance-baseline-screenshot', { path: screenshotPath, contentType: 'image/png' })
})

function renderMarkdown(result: BaselineResult): string {
  const rows = formatMarkdownTable(
    ['Case', 'Dabs', 'Duration', 'Dabs/s', 'Tiles', 'Uploads', 'Surface', 'Undo', 'Total', 'Stable Drift'],
    result.cases.map(item => [
      item.label,
      item.dabCount.toString(),
      `${item.drawDurationMs.toFixed(1)} ms`,
      item.dabThroughput.toFixed(1),
      item.allocatedTileCount.toString(),
      item.uploadCount.toString(),
      formatBytes(item.memory.surfaceEstimatedBytes),
      formatBytes(item.memory.undoEstimatedBytes),
      formatBytes(item.memory.totalEstimatedBytes),
      formatBytes(Math.abs(item.longSession.summary.memoryDriftAfterUndoCapacityBytes)),
    ]),
    ['left', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right', 'right'],
  )

  const stability = result.cases
    .map((item) => {
      const samples = formatMarkdownTable(
        ['Strokes', 'Undo Count', 'Tiles', 'Surface', 'Undo', 'Total'],
        item.longSession.samples.map(sample => [
          sample.strokeCount.toString(),
          sample.undoCount.toString(),
          sample.allocatedTileCount.toString(),
          formatBytes(sample.surfaceEstimatedBytes),
          formatBytes(sample.undoEstimatedBytes),
          formatBytes(sample.totalEstimatedBytes),
        ]),
        ['right', 'right', 'right', 'right', 'right', 'right'],
      )

      return [
        `## ${item.label} Stability Samples`,
        '',
        samples,
      ].join('\n')
    })
    .join('\n\n')

  return [
    '---',
    'title: Performance Baseline Latest',
    '---',
    '',
    '# Performance Baseline Latest',
    '',
    `Generated: \`${result.generatedAt}\``,
    '',
    `User agent: \`${result.environment.userAgent}\``,
    '',
    `Device pixel ratio: \`${result.environment.devicePixelRatio}\``,
    '',
    'Run command: `pnpm perf:baseline`',
    '',
    '![Performance baseline screenshot](./latest.png)',
    '',
    '## Summary',
    '',
    rows,
    '',
    stability,
    '',
  ].join('\n')
}

type MarkdownColumnAlign = 'left' | 'right'

function formatMarkdownTable(
  headers: string[],
  rows: string[][],
  align: MarkdownColumnAlign[],
): string {
  const widths = headers.map((header, index) => {
    const minWidth = align[index] === 'right' ? 4 : 3
    return Math.max(
      minWidth,
      header.length,
      ...rows.map(row => row[index]?.length ?? 0),
    )
  })

  return [
    formatMarkdownTableRow(headers, widths, align),
    formatMarkdownTableSeparator(widths, align),
    ...rows.map(row => formatMarkdownTableRow(row, widths, align)),
  ].join('\n')
}

function formatMarkdownTableRow(
  cells: string[],
  widths: number[],
  align: MarkdownColumnAlign[],
): string {
  return `| ${widths
    .map((width, index) => {
      const cell = cells[index] ?? ''
      return align[index] === 'right'
        ? cell.padStart(width)
        : cell.padEnd(width)
    })
    .join(' | ')} |`
}

function formatMarkdownTableSeparator(widths: number[], align: MarkdownColumnAlign[]): string {
  return `| ${widths
    .map((width, index) => {
      if (align[index] === 'right')
        return `${'-'.repeat(width - 1)}:`
      return '-'.repeat(width)
    })
    .join(' | ')} |`
}

function formatBytes(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`

  const units = ['KiB', 'MiB', 'GiB'] as const
  let value = bytes / 1024
  for (const unit of units) {
    if (value < 1024 || unit === 'GiB')
      return `${value.toFixed(value < 10 ? 2 : 1)} ${unit}`
    value /= 1024
  }

  return `${value.toFixed(1)} GiB`
}

function recordServerLog(chunk: Buffer): void {
  const text = chunk.toString()
  perfServerLogs.push(text)
  if (perfServerLogs.length > 30)
    perfServerLogs.splice(0, perfServerLogs.length - 30)
}

async function waitForServer(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  let lastError: unknown

  while (Date.now() < deadline) {
    if (perfServer?.exitCode !== null) {
      throw new Error([
        `Performance Vite server exited before ${url} became reachable.`,
        '',
        perfServerLogs.join(''),
      ].join('\n'))
    }

    try {
      const response = await fetch(url)
      if (response.ok)
        return
    }
    catch (error) {
      lastError = error
    }

    await new Promise(resolveDone => setTimeout(resolveDone, 250))
  }

  throw new Error([
    `Timed out waiting for performance Vite server: ${url}`,
    lastError instanceof Error ? lastError.message : String(lastError ?? ''),
    '',
    perfServerLogs.join(''),
  ].join('\n'))
}

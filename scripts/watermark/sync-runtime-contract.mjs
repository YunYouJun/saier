import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import process from 'node:process'

// Run with the YunLeFun/api checkout path; keep both protocol implementations identical.
const root = process.argv[2]
if (!root)
  throw new Error('Usage: node scripts/watermark/sync-runtime-contract.mjs /path/to/YunLeFun/api')
for (const [source, target] of [['preset-contract', 'saier-watermark-contract'], ['protocol', 'saier-watermark-protocol']]) {
  const text = (await readFile(new URL(`../../site/app/features/watermark/${source}.ts`, import.meta.url), 'utf8'))
    .replaceAll('\'./preset-contract.ts\'', '\'./saier-watermark-contract.js\'')
  await writeFile(resolve(root, `packages/ai-runtime/src/${target}.ts`), text)
}

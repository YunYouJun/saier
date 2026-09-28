import { readFile, writeFile } from 'node:fs/promises'
import { basename, resolve, sep } from 'node:path'
import process from 'node:process'
import { buildPresetPrompt, parsePresetDescriptor, SUBJECT_CROSS_RULES } from '../../site/app/features/watermark/preset-contract.ts'

const directory = resolve(process.argv[2] ?? '')
if (!process.argv[2])
  throw new Error('Usage: node scripts/watermark/pack-preset.mjs /path/to/extracted-assets')
const recipe = JSON.parse(await readFile(resolve(directory, 'watermark-recipe.json'), 'utf8'))
const roles = ['horizontal-ribbon', 'vertical-ribbon', 'vertical-ribbon-short', 'heart-signature', 'small-seal', 'frame-and-footer', 'display-only', 'footer-signature', 'frame', 'repeated-watermark', 'micro-texture']
const assets = []
for (const asset of (recipe.reusableAssets ?? recipe.assets).filter(asset => roles.includes(asset.role))) {
  const path = resolve(directory, asset.file)
  if (!path.startsWith(directory + sep) || !path.endsWith('.png'))
    throw new Error('Invalid asset path')
  assets.push({ id: asset.assetId ?? `layer-${asset.index}`, role: asset.role, width: asset.width, height: asset.height, recolorable: asset.recolorable ?? (asset.role.includes('ribbon') || ['frame', 'footer-signature', 'heart-signature', 'small-seal'].includes(asset.role)), ...(asset.blendMode ? { blendMode: asset.blendMode.replace(' ', '-') } : {}), ...(asset.backdropBlur ? { backdropBlur: asset.backdropBlur } : {}), enabled: asset.enabled !== false, source: `data:image/png;base64,${(await readFile(path)).toString('base64')}` })
}
const preset = { format: 'saier.watermark-preset', version: 1, name: recipe.name, rules: SUBJECT_CROSS_RULES, assets }
parsePresetDescriptor(preset)
const output = resolve(directory, `${basename(directory)}.saier-watermarks.json`)
await writeFile(output, JSON.stringify(preset))
await writeFile(resolve(directory, 'analysis-prompt.zh-CN.txt'), buildPresetPrompt(parsePresetDescriptor(preset), '避开角色的脸部、眼睛、已有签名与重要文字。'))
console.log(output)

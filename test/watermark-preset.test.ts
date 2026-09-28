import { describe, expect, it, vi } from 'vitest'
import { createCloudWatermarkProvider } from '../site/app/features/watermark/cloud-provider'
import { fitPlacement } from '../site/app/features/watermark/editing'
import { buildPresetPrompt, parsePresetDescriptor, parsePresetPlacements } from '../site/app/features/watermark/preset-contract'

const preset = parsePresetDescriptor({ version: 1, name: 'test', rules: '', assets: [{ id: 'ribbon', role: 'horizontal-ribbon', width: 100, height: 20, recolorable: true }] })
const placement = { assetId: 'ribbon', x: 0.1, y: 0.1, width: 0.5, rotation: 0, color: '#ffffff', opacity: 0.6 }

describe('whole-preset contract', () => {
  it('keeps manual scaling centered without applying the offset twice to a drag result', () => {
    const image = { width: 4800, height: 4300 }
    const asset = { ...preset.assets[0]!, width: 324, height: 280 }
    const start = { ...placement, x: 0.236, y: 0.352, width: 0.1, rotation: 0 }
    const smaller = fitPlacement(start, asset, image, { width: 0.07 })
    expect(smaller.x + smaller.width / 2).toBeCloseTo(start.x + start.width / 2)
    expect(smaller.y + smaller.width * image.width / image.height * asset.height / asset.width / 2).toBeCloseTo(start.y + start.width * image.width / image.height * asset.height / asset.width / 2)
    expect(fitPlacement(start, asset, image, smaller)).toEqual(smaller)
    expect(parsePresetPlacements([smaller], { ...preset, assets: [asset] }, image)).toEqual([smaller])
  })

  it('constrains rotated manual transforms on non-square images to valid bounds', () => {
    for (const image of [{ width: 4800, height: 4300 }, { width: 200, height: 800 }]) {
      for (const rotation of [-180, -90, -45, 0, 35, 90, 180]) {
        for (const edge of [-2, 2]) {
          const next = fitPlacement(placement, preset.assets[0]!, image, { x: edge, y: edge, width: 0.9, rotation })
          expect(() => parsePresetPlacements([next], preset, image)).not.toThrow()
        }
      }
    }
  })

  it('preserves aspect ratio and rejects rotated overflow, unknown assets and invalid styles', () => {
    expect(parsePresetPlacements([placement], preset, { width: 100, height: 100 })).toEqual([placement])
    for (const patch of [{ assetId: 'other' }, { x: 0.9 }, { rotation: 90, y: 0 }, { opacity: 2 }, { color: 'url(x)' }, { width: Number.NaN }])
      expect(() => parsePresetPlacements([{ ...placement, ...patch }], preset, { width: 100, height: 100 })).toThrow()
    expect(() => parsePresetDescriptor({ ...preset, assets: [...preset.assets, ...preset.assets] })).toThrow()
    expect(buildPresetPrompt(preset, 'protect eyes')).toContain('不生图')
  })

  it('sends the bounded request to the account Runtime and binds its result to the snapshot', async () => {
    const snapshot = { documentId: 'image', revision: 2, sha256: 'a'.repeat(64), width: 100, height: 100 }
    const request = { snapshot, preset, image: 'data:image/png;base64,AA==', rules: 'avoid faces', openDesktop: true }
    const fetcher = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ result: { snapshot, analysis: { regions: [], placements: [placement], warnings: [] } }, usage: { chargedMicroPoints: 120 }, operationId: 'op-1' })))
    try {
      const provider = createCloudWatermarkProvider('https://runtime.example/ai/v2/apps/saier/watermark', async () => 'account-session')
      expect(await provider.analyze(request, new AbortController().signal)).toMatchObject({ chargedMicroPoints: 120, analysis: { placements: [placement] } })
      const init = fetcher.mock.calls[0]![1]!
      expect(init.headers).toMatchObject({ Authorization: 'Bearer account-session' })
      expect(JSON.parse(String(init.body))).toEqual({ snapshot, preset, image: request.image, rules: request.rules })
      expect(String(init.body)).not.toContain('openDesktop')
      fetcher.mockResolvedValue(new Response(JSON.stringify({ result: { snapshot: { ...snapshot, revision: 1 } }, usage: { chargedMicroPoints: 0 } })))
      await expect(provider.analyze(request, new AbortController().signal)).rejects.toThrow('不匹配')
      fetcher.mockResolvedValue(new Response('<html>Gateway Timeout</html>', { status: 504 }))
      await expect(provider.analyze(request, new AbortController().signal)).rejects.toThrow('原分析可能仍在处理')
      expect(() => createCloudWatermarkProvider('http://runtime.example/ai/v2/apps/saier/watermark', async () => '')).toThrow()
    }
    finally {
      fetcher.mockRestore()
    }
  })

  it('validates full-canvas roles without applying the tile aspect ratio as the coverage boundary', () => {
    const tiled = parsePresetDescriptor({ ...preset, assets: [{ ...preset.assets[0], role: 'repeated-watermark', width: 10, height: 1000, blendMode: 'linear-light' }] })
    const p = { ...placement, x: 0, y: 0, color: '' }
    expect(parsePresetPlacements([p], tiled, { width: 1000, height: 100 })).toEqual([p])
    for (const patch of [{ x: 0.1 }, { rotation: 1 }, { width: 0.001 }])
      expect(() => parsePresetPlacements([{ ...p, ...patch }], tiled, { width: 100, height: 100 })).toThrow()
    for (const patch of [{ blendMode: 'screen' }, { backdropBlur: 1 }, { backdropBlur: Number.NaN }])
      expect(() => parsePresetDescriptor({ ...tiled, assets: [{ ...tiled.assets[0], ...patch }] })).toThrow()
  })
})

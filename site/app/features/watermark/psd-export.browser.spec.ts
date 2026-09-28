import type { WatermarkWorkInput } from './workfile'
import { readPsd } from 'ag-psd'
import { expect, it } from 'vitest'
import { compositePreset } from './preset'
import { createWatermarkPsd, exportWatermarkPsd } from './psd-export'

function canvas(width: number, height: number, color: string): HTMLCanvasElement {
  const result = document.createElement('canvas')
  result.width = width
  result.height = height
  const context = result.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  return result
}

it('writes independent rotated pixels, blend modes, opacity, masks and an exact composite into PSD', async () => {
  const artwork = canvas(120, 100, '#446688')
  artwork.getContext('2d')!.clearRect(0, 0, 10, 10)
  const mark = canvas(40, 16, '#ffcc9980')
  const tile = canvas(4, 4, '#bbbbbb80')
  const input: WatermarkWorkInput = {
    artwork,
    preset: { name: 'PSD fixture', rules: '', assets: [
      { id: 'ribbon', role: 'horizontal-ribbon', width: 40, height: 16, enabled: true, recolorable: true, image: mark, source: mark.toDataURL(), backdropBlur: 0.013 },
      { id: 'tile', role: 'repeated-watermark', width: 4, height: 4, enabled: true, recolorable: false, image: tile, source: tile.toDataURL(), blendMode: 'linear-light' },
      { id: 'texture', role: 'micro-texture', width: 4, height: 4, enabled: true, recolorable: false, image: tile, source: tile.toDataURL(), blendMode: 'overlay' },
    ] },
    placements: [
      { assetId: 'ribbon', x: 0.3, y: 0.3, width: 0.4, rotation: 20, opacity: 0.6, color: '#304050' },
      { assetId: 'tile', x: 0, y: 0, width: 0.1, rotation: 0, opacity: 1, color: '' },
      { assetId: 'texture', x: 0, y: 0, width: 0.1, rotation: 0, opacity: 105 / 255, color: '' },
    ],
    regions: [{ label: 'face', x: 0.4, y: 0.35, width: 0.1, height: 0.1 }],
  }
  const before = artwork.toDataURL()
  const blob = exportWatermarkPsd(input)
  const bytes = await blob.arrayBuffer()
  expect(new TextDecoder().decode(bytes.slice(0, 4))).toBe('8BPS')
  const psd = readPsd(bytes, { useImageData: true, skipThumbnail: true })
  expect([psd.width, psd.height, psd.bitsPerChannel]).toEqual([120, 100, 8])
  expect(psd.children).toHaveLength(5)
  const [original, blur, ribbon, repeated, micro] = psd.children!
  expect(original!.name).toBe('原图')
  expect(original!.imageData!.data[3]).toBe(0)
  expect(blur!.name).toContain('背景柔化')
  expect([ribbon!.blendMode, repeated!.blendMode, micro!.blendMode]).toEqual(['normal', 'linear light', 'overlay'])
  expect(ribbon!.opacity).toBeCloseTo(0.6, 5)
  expect(micro!.opacity).toBeCloseTo(105 / 255, 5)
  expect(ribbon!.left).toBeGreaterThan(0)
  expect(ribbon!.imageData!.width).toBeLessThan(120)
  const center = (Math.floor(40 - ribbon!.top!) * ribbon!.imageData!.width + Math.floor(53 - ribbon!.left!)) * 4
  // Protection stays reversible in a separate mask, and opacity is not baked twice.
  expect(ribbon!.imageData!.data[center + 3]).toBe(128)
  expect(ribbon!.mask!.imageData!.data[center]).toBe(0)
  expect(repeated!.mask!.imageData!.data[0]).toBe(255)
  const expected = compositePreset(artwork, input.preset, input.placements, input.regions)
  expect(psd.imageData!.data).toEqual(expected.getContext('2d')!.getImageData(0, 0, 120, 100).data)
  expect(artwork.toDataURL()).toBe(before)
  expect(() => createWatermarkPsd({ ...input, placements: [{ ...input.placements[0]!, opacity: 2 }] })).toThrow()
})

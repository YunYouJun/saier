import type { LoadedPreset } from './preset'
import { expect, it } from 'vitest'
import { compositePreset, describePreset, readWatermarkPreset, serializePreset } from './preset'
import { compositeLinearLight } from './preset-render'

function canvas(width: number, height: number, color: string) {
  const value = document.createElement('canvas')
  value.width = width
  value.height = height
  const context = value.getContext('2d')!
  context.fillStyle = color
  context.fillRect(0, 0, width, height)
  return value
}

it('composes multiple rotated marks while preserving protected pixels and the original', async () => {
  const source = canvas(100, 100, '#ff0000')
  const image = canvas(20, 20, '#0000ff')
  const preset: LoadedPreset = { name: 'test', rules: '', assets: [{ id: 'a', role: 'small-seal', width: 20, height: 20, recolorable: false, enabled: true, image, source: image.toDataURL() }] }
  const imported = await readWatermarkPreset(new File([serializePreset(preset)], 'preset.json'))
  expect(describePreset(imported)).toEqual(describePreset(preset))
  const result = compositePreset(source, imported, [
    { assetId: 'a', x: 0.3, y: 0.3, width: 0.4, rotation: 45, opacity: 1, color: '' },
    { assetId: 'a', x: 0.8, y: 0.8, width: 0.2, rotation: 0, opacity: 1, color: '' },
  ], [{ label: 'face', x: 0.45, y: 0.45, width: 0.1, height: 0.1 }])
  const pixel = (c: HTMLCanvasElement, x: number, y: number) => Array.from(c.getContext('2d')!.getImageData(x, y, 1, 1).data)
  expect(pixel(result, 50, 50)).toEqual([255, 0, 0, 255])
  expect(pixel(result, 90, 90)).toEqual([0, 0, 255, 255])
  expect(pixel(source, 90, 90)).toEqual([255, 0, 0, 255])
  const bad = JSON.parse(serializePreset(preset))
  bad.assets[0].source = 'https://example.com/private.png'
  await expect(readWatermarkPreset(new File([JSON.stringify(bad)], 'preset.json'))).rejects.toThrow('内嵌')
  bad.assets[0].source = image.toDataURL()
  bad.assets[0].width = 1
  await expect(readWatermarkPreset(new File([JSON.stringify(bad)], 'preset.json'))).rejects.toThrow('尺寸')
})

it('repeats patterns across the whole image with PSD linear-light blending and fresh face protection', () => {
  const source = canvas(100, 60, 'rgb(100,100,100)')
  const image = canvas(10, 10, 'rgb(160,160,160)')
  const preset: LoadedPreset = { name: 'pattern', rules: '', assets: [{ id: 'tile', role: 'repeated-watermark', width: 10, height: 10, recolorable: false, blendMode: 'linear-light', enabled: true, image, source: image.toDataURL() }] }
  const result = compositePreset(source, preset, [{ assetId: 'tile', x: 0, y: 0, width: 0.1, rotation: 0, opacity: 1, color: '' }], [{ label: 'face', x: 0.4, y: 0.3, width: 0.2, height: 0.2 }])
  const pixel = (x: number, y: number) => Array.from(result.getContext('2d')!.getImageData(x, y, 1, 1).data)
  expect(pixel(99, 59)).toEqual([165, 165, 165, 255])
  expect(pixel(0, 0)).toEqual([165, 165, 165, 255])
  expect(pixel(50, 25)).toEqual([100, 100, 100, 255])
  expect(describePreset(preset).assets[0]!.blendMode).toBe('linear-light')

  const translucent = canvas(1, 1, 'rgba(100,100,100,0.5)')
  compositeLinearLight(translucent.getContext('2d')!, canvas(1, 1, 'rgb(160,160,160)'), 0.5)
  const rgba = translucent.getContext('2d')!.getImageData(0, 0, 1, 1).data
  expect(rgba[3]).toBeCloseTo(192, 0)
  expect(rgba[0]).toBeGreaterThan(140)
  expect(rgba[0]).toBeLessThan(144)
})

it('blurs only the watermark backdrop, preserves crossings, and restores protected RGBA', () => {
  const source = canvas(100, 100, '#000000')
  source.getContext('2d')!.fillStyle = '#ffffff'
  source.getContext('2d')!.fillRect(50, 0, 50, 100)
  source.getContext('2d')!.clearRect(45, 45, 10, 10)
  const image = canvas(20, 20, '#00000000')
  const preset: LoadedPreset = { name: 'blur', rules: '', assets: [{ id: 'heart', role: 'heart-signature', width: 20, height: 20, recolorable: false, backdropBlur: 0.03, enabled: true, image, source: image.toDataURL() }] }
  const result = compositePreset(source, preset, [{ assetId: 'heart', x: 0.2, y: 0.2, width: 0.6, rotation: 0, opacity: 1, color: '' }], [{ label: 'face', x: 0.45, y: 0.45, width: 0.1, height: 0.1 }])
  const pixel = (x: number, y: number) => Array.from(result.getContext('2d')!.getImageData(x, y, 1, 1).data)
  expect(pixel(49, 30)[0]).toBeGreaterThan(0)
  expect(pixel(49, 30)[0]).toBeLessThan(255)
  expect(pixel(49, 0)).toEqual([0, 0, 0, 255])
  expect(pixel(50, 50)).toEqual([0, 0, 0, 0])
  expect(Array.from(source.getContext('2d')!.getImageData(49, 30, 1, 1).data)).toEqual([0, 0, 0, 255])
})

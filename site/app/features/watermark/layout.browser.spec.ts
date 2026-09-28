import { expect, it } from 'vitest'
import { compositeWatermark, suggestWatermarkStyle, tintWatermark } from './layout'

it('only composites in the selected rectangle and never changes the source canvas', () => {
  const source = document.createElement('canvas')
  source.width = source.height = 8
  const ctx = source.getContext('2d')!
  ctx.fillStyle = '#ff0000'
  ctx.fillRect(0, 0, 8, 8)
  const before = ctx.getImageData(0, 0, 8, 8).data.slice()
  const watermark = document.createElement('canvas')
  watermark.width = watermark.height = 2
  const wctx = watermark.getContext('2d')!
  wctx.fillStyle = '#0000ff'
  wctx.fillRect(0, 0, 2, 2)
  const result = compositeWatermark(source, watermark, { x: 6, y: 6, width: 2, height: 2 }, 1)
  expect(Array.from(result.getContext('2d')!.getImageData(6, 6, 1, 1).data)).toEqual([0, 0, 255, 255])
  expect(Array.from(result.getContext('2d')!.getImageData(0, 0, 1, 1).data)).toEqual([255, 0, 0, 255])
  expect(ctx.getImageData(0, 0, 8, 8).data).toEqual(before)
})

it('recolors translucent linework without changing alpha or the source', () => {
  const source = document.createElement('canvas')
  source.width = 3
  source.height = 1
  const context = source.getContext('2d')!
  context.putImageData(new ImageData(new Uint8ClampedArray([50, 100, 200, 255, 50, 100, 200, 128, 0, 0, 0, 0]), 3, 1), 0, 0)
  const before = context.getImageData(0, 0, 3, 1).data.slice()
  const recolored = tintWatermark(source, '#ff0080').getContext('2d')!.getImageData(0, 0, 3, 1).data
  expect([recolored[3], recolored[7], recolored[11]]).toEqual([255, 128, 0])
  expect(Array.from(recolored.slice(0, 4))).toEqual([255, 0, 128, 255])
  expect(context.getImageData(0, 0, 3, 1).data).toEqual(before)
  expect(() => tintWatermark(source, 'url(example)')).toThrow()
})

it('suggests lighter linework for dark backgrounds and darker linework for light backgrounds', () => {
  const source = document.createElement('canvas')
  source.width = source.height = 20
  const context = source.getContext('2d')!
  const placement = { x: 0, y: 0, width: 20, height: 20 }
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, 20, 20)
  const onWhite = suggestWatermarkStyle(source, placement)
  context.fillStyle = '#000000'
  context.fillRect(0, 0, 20, 20)
  const onBlack = suggestWatermarkStyle(source, placement)
  expect(onWhite.opacity).toBe(0.6)
  expect(onBlack.opacity).toBe(0.7)
  expect(Number.parseInt(onBlack.color.slice(1, 3), 16)).toBeGreaterThan(Number.parseInt(onWhite.color.slice(1, 3), 16))
})

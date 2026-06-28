import type { PixelData, Psd } from 'ag-psd'
import { writePsd } from 'ag-psd'
import { describe, expect, it } from 'vitest'
import { readPsdDocument } from '../src'

describe('psd format import', () => {
  it('reads composite pixels and flattens bitmap layers into saier layer order', () => {
    const psd: Psd = {
      width: 2,
      height: 2,
      imageData: pixels(2, 2, [
        255,
        0,
        0,
        255,
        0,
        0,
        255,
        255,
        255,
        0,
        0,
        255,
        255,
        0,
        0,
        255,
      ]),
      children: [
        {
          name: 'Ink',
          left: 1,
          top: 0,
          opacity: 0.5,
          blendMode: 'multiply',
          imageData: pixels(1, 2, [
            0,
            0,
            255,
            128,
            0,
            0,
            0,
            0,
          ]),
        },
        {
          name: 'Paper',
          left: 0,
          top: 0,
          imageData: pixels(2, 2, [
            255,
            0,
            0,
            255,
            255,
            0,
            0,
            255,
            255,
            0,
            0,
            255,
            255,
            0,
            0,
            255,
          ]),
        },
      ],
    }

    const document = readPsdDocument(writePsd(psd, { noBackground: true }))

    expect(document).toMatchObject({
      format: 'psd',
      width: 2,
      height: 2,
      warnings: [],
    })
    expect(document.composite).toMatchObject({ width: 2, height: 2 })
    expect([...document.composite!.pixels.slice(0, 8)]).toEqual([
      255,
      0,
      0,
      255,
      0,
      0,
      255,
      255,
    ])

    expect(document.layers.map(layer => layer.name)).toEqual(['Paper', 'Ink'])
    expect(document.layers[0]).toMatchObject({
      id: 'psd-layer-1',
      name: 'Paper',
      left: 0,
      top: 0,
      width: 2,
      height: 2,
      visible: true,
      opacity: 1,
      blendMode: 'normal',
    })
    expect([...document.layers[0]!.pixels.slice(0, 4)]).toEqual([255, 0, 0, 255])

    expect(document.layers[1]).toMatchObject({
      id: 'psd-layer-2',
      name: 'Ink',
      left: 1,
      top: 0,
      width: 1,
      height: 2,
      visible: true,
      blendMode: 'multiply',
    })
    expect(document.layers[1]!.opacity).toBeCloseTo(0.5, 2)
    expect([...document.layers[1]!.pixels.slice(0, 8)]).toEqual([
      0,
      0,
      255,
      128,
      0,
      0,
      0,
      0,
    ])
  })
})

function pixels(width: number, height: number, data: number[]): PixelData {
  return {
    width,
    height,
    data: new Uint8ClampedArray(data),
  }
}

import { describe, expect, it } from 'vitest'
import { object2Plain, plain2Object } from '../packages/shodo/src/utils'

describe('shodo history serialization', () => {
  it('parses stroke, brush, ink, and color operations', () => {
    expect(plain2Object('1,2,3,800,600|0;10,20,30,0.5;40.5,50.25,60,1|1;2|2;plenty|3;16711935')).toEqual({
      v: '1',
      dpi: 2,
      pv: 3,
      w: 800,
      h: 600,
      sh: [
        {
          O: 0,
          D: [
            { X: 10, Y: 20, T: 30, P: 0.5 },
            { X: 40.5, Y: 50.25, T: 60, P: 1 },
          ],
        },
        { O: 1, D: 2 },
        { O: 2, D: 'plenty' },
        { O: 3, D: 16711935 },
      ],
    })
  })

  it('serializes history with normalized point precision', () => {
    const plain = object2Plain({
      v: '1',
      dpi: 2,
      pv: 3,
      w: 800,
      h: 600,
      sh: [
        {
          O: 0,
          D: [
            { X: 1.234, Y: 5.678, T: 9, P: 0.4 },
          ],
        },
        { O: 1, D: 2 },
        { O: 2, D: 'less' },
      ],
    })

    expect(plain).toBe('1,2,3,800,600|0;1.23,5.68,9,1|1;2|2;less')
    expect(plain2Object(plain).sh[0]).toEqual({
      O: 0,
      D: [
        { X: 1.23, Y: 5.68, T: 9, P: 1 },
      ],
    })
  })
})

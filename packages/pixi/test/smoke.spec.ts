import { describe, expect, it } from 'vitest'
import { RenderTextureBackend } from '../src'

describe('@saier/pixi scaffold', () => {
  it('exposes a public entry', () => {
    expect(RenderTextureBackend).toBeTypeOf('function')
  })
})

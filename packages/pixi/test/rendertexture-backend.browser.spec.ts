import type { BrushDab, DirtyRect } from '@saier/core'
import { Application, Container, Rectangle, Sprite } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'

import { RenderTextureBackend } from '../src'

interface Fixture {
  app: Application
  stage: Container
  backend: RenderTextureBackend
}

const fixtures: Fixture[] = []

afterEach(() => {
  for (const { app, backend } of fixtures.splice(0)) {
    backend.destroy()
    app.destroy(true)
  }
})

async function createFixture(): Promise<Fixture> {
  const app = new Application()
  await app.init({
    width: 64,
    height: 64,
    backgroundAlpha: 0,
    preference: 'webgl',
    useBackBuffer: true,
  })

  const stage = new Container()
  app.stage.addChild(stage)

  const backend = new RenderTextureBackend({
    renderer: app.renderer,
    stage,
    width: 64,
    height: 64,
  })

  const fixture = { app, stage, backend }
  fixtures.push(fixture)
  return fixture
}

function dab(
  x: number,
  y: number,
  radius = 3,
  color: BrushDab['color'] = { r: 1, g: 0, b: 0, a: 1 },
  overrides: Partial<BrushDab> = {},
): BrushDab {
  return {
    x,
    y,
    radius,
    opacity: 1,
    color,
    ...overrides,
  }
}

function readPixels(app: Application, sprite: Sprite, rect: DirtyRect): Uint8Array {
  const { pixels } = app.renderer.extract.pixels({
    target: sprite,
    frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
  })

  return new Uint8Array(pixels)
}

function readTargetPixels(app: Application, target: Container | Sprite, rect: DirtyRect): Uint8Array {
  const { pixels } = app.renderer.extract.pixels({
    target,
    frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
  })

  return new Uint8Array(pixels)
}

function countNonTransparent(pixels: Uint8Array): number {
  let count = 0
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] > 0)
      count++
  }
  return count
}

function pixelAt(pixels: Uint8Array, width: number, x: number, y: number): Uint8Array {
  const offset = (y * width + x) * 4
  return pixels.slice(offset, offset + 4)
}

describe('renderTextureBackend', () => {
  it('creates a display sprite for each layer', async () => {
    const { backend, stage } = await createFixture()

    stage.position.set(4, 6)
    stage.scale.set(2)
    backend.createLayer('ink')

    const handle = backend.getDisplayHandle('ink')
    expect(handle).toBeInstanceOf(Sprite)
    expect(stage.children).toContain(handle)
    expect((handle as Sprite).getGlobalPosition()).toMatchObject({ x: 4, y: 6 })
    expect((handle as Sprite).toGlobal({ x: 1, y: 0 }).x).toBe(6)
  })

  it('keeps scene graph size stable across 5000 dabs', async () => {
    const { backend, stage } = await createFixture()

    backend.createLayer('ink')
    backend.beginStroke('ink')
    const childCountAfterBegin = stage.children.length

    for (let i = 0; i < 5000; i++) {
      backend.paintDab(
        'ink',
        dab(8 + (i % 48), 8 + (Math.floor(i / 48) % 48), 1),
        'normal',
      )
    }

    expect(stage.children.length).toBe(childCountAfterBegin)

    const patch = backend.endStroke('ink')
    expect(stage.children.length).toBe(1)
    expect(patch.rect.width).toBeGreaterThan(0)
    expect(patch.rect.height).toBeGreaterThan(0)
  })

  it('keeps scene graph size stable across 5000 erase dabs', async () => {
    const { backend, stage } = await createFixture()

    backend.createLayer('ink')
    backend.beginStroke('ink')
    backend.paintDab('ink', dab(32, 32, 20), 'normal')
    backend.endStroke('ink')

    backend.beginStroke('ink')
    const childCountAfterBegin = stage.children.length

    for (let i = 0; i < 5000; i++) {
      backend.paintDab(
        'ink',
        dab(8 + (i % 48), 8 + (Math.floor(i / 48) % 48), 1),
        'erase',
      )
    }

    expect(stage.children.length).toBe(childCountAfterBegin)

    const patch = backend.endStroke('ink')
    expect(stage.children.length).toBe(1)
    expect(patch.rect.width).toBeGreaterThan(0)
    expect(patch.rect.height).toBeGreaterThan(0)
  })

  it('commits dirty pixels and round-trips undo/redo patches', async () => {
    const { app, backend } = await createFixture()

    backend.createLayer('ink')
    backend.beginStroke('ink')
    backend.paintDab('ink', dab(20, 22, 5), 'normal')
    backend.paintDab('ink', dab(28, 26, 4), 'normal')

    const patch = backend.endStroke('ink')
    const sprite = backend.getDisplayHandle('ink') as Sprite
    const afterCommit = readPixels(app, sprite, patch.rect)

    expect(countNonTransparent(patch.before as Uint8Array)).toBe(0)
    expect(countNonTransparent(afterCommit)).toBeGreaterThan(0)
    expect(afterCommit).toEqual(patch.after)

    backend.applyPatch(patch, 'undo')
    expect(readPixels(app, sprite, patch.rect)).toEqual(patch.before)

    backend.applyPatch(patch, 'redo')
    expect(readPixels(app, sprite, patch.rect)).toEqual(patch.after)
  })

  it('erases to transparent pixels and round-trips undo/redo patches', async () => {
    const { app, backend } = await createFixture()

    backend.createLayer('ink')
    backend.beginStroke('ink')
    backend.paintDab('ink', dab(32, 32, 10), 'normal')
    backend.endStroke('ink')

    backend.beginStroke('ink')
    backend.paintDab('ink', dab(32, 32, 5), 'erase')
    const patch = backend.endStroke('ink')

    const sprite = backend.getDisplayHandle('ink') as Sprite
    const erasedCenter = readPixels(app, sprite, { x: 32, y: 32, width: 1, height: 1 })

    expect(countNonTransparent(patch.before as Uint8Array)).toBeGreaterThan(0)
    expect(erasedCenter[3]).toBe(0)

    backend.applyPatch(patch, 'undo')
    expect(readPixels(app, sprite, patch.rect)).toEqual(patch.before)

    backend.applyPatch(patch, 'redo')
    expect(readPixels(app, sprite, patch.rect)).toEqual(patch.after)
    expect(readPixels(app, sprite, { x: 32, y: 32, width: 1, height: 1 })[3]).toBe(0)
  })

  it('reveals lower layer color instead of painting white', async () => {
    const { app, backend, stage } = await createFixture()

    backend.createLayer('paper')
    backend.beginStroke('paper')
    backend.paintDab('paper', dab(32, 32, 14, { r: 0, g: 0, b: 1, a: 1 }), 'normal')
    backend.endStroke('paper')

    backend.createLayer('ink')
    backend.beginStroke('ink')
    backend.paintDab('ink', dab(32, 32, 14), 'normal')
    backend.endStroke('ink')

    backend.beginStroke('ink')
    backend.paintDab('ink', dab(32, 32, 6), 'erase')
    backend.endStroke('ink')

    const pixels = readTargetPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 })
    const [r, g, b, a] = pixelAt(pixels, 1, 0, 0)

    expect(r).toBeLessThan(20)
    expect(g).toBeLessThan(20)
    expect(b).toBeGreaterThan(200)
    expect(a).toBe(255)
  })

  it('syncs layer visibility, opacity, blend mode and order to display sprites', async () => {
    const { app, backend, stage } = await createFixture()

    backend.createLayer('red')
    backend.beginStroke('red')
    backend.paintDab('red', dab(32, 32, 14, { r: 1, g: 0, b: 0, a: 1 }), 'normal')
    backend.endStroke('red')

    backend.createLayer('blue')
    backend.beginStroke('blue')
    backend.paintDab('blue', dab(32, 32, 14, { r: 0, g: 0, b: 1, a: 1 }), 'normal')
    backend.endStroke('blue')

    const blueTop = pixelAt(readTargetPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(blueTop[2]).toBeGreaterThan(blueTop[0])

    backend.reorderLayers(['blue', 'red'])
    const redTop = pixelAt(readTargetPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(redTop[0]).toBeGreaterThan(redTop[2])

    backend.setLayerState('red', { visible: false })
    const redHidden = pixelAt(readTargetPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(redHidden[2]).toBeGreaterThan(redHidden[0])

    backend.setLayerState('red', { visible: true, opacity: 0.5 })
    const redHalf = pixelAt(readTargetPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(redHalf[0]).toBeGreaterThan(80)
    expect(redHalf[2]).toBeGreaterThan(80)

    backend.setLayerState('red', { opacity: 1, blendMode: 'multiply' })
    expect((backend.getDisplayHandle('red') as Sprite).blendMode).toBe('multiply')
  })

  it('renders dab tips with distinct hard and soft edges', async () => {
    const hardFixture = await createFixture()

    hardFixture.backend.createLayer('hard')
    hardFixture.backend.beginStroke('hard')
    hardFixture.backend.paintDab('hard', dab(32, 32, 12, { r: 1, g: 0, b: 0, a: 1 }, {
      hardness: 0,
      tipId: 'round-hard',
    }), 'normal')
    hardFixture.backend.endStroke('hard')

    const softFixture = await createFixture()
    softFixture.backend.createLayer('soft')
    softFixture.backend.beginStroke('soft')
    softFixture.backend.paintDab('soft', dab(32, 32, 12, { r: 1, g: 0, b: 0, a: 1 }, {
      hardness: 0.75,
      tipId: 'round-soft',
    }), 'normal')
    softFixture.backend.endStroke('soft')

    const hard = readPixels(hardFixture.app, hardFixture.backend.getDisplayHandle('hard') as Sprite, { x: 41, y: 32, width: 1, height: 1 })
    const soft = readPixels(softFixture.app, softFixture.backend.getDisplayHandle('soft') as Sprite, { x: 41, y: 32, width: 1, height: 1 })

    expect(hard[3]).toBeGreaterThan(soft[3])
    expect(soft[3]).toBeGreaterThan(0)
  })

  it('uses max-alpha accumulation for marker dabs within one stroke', async () => {
    const { app, backend } = await createFixture()
    const marker = dab(32, 32, 12, { r: 0, g: 0, b: 0, a: 1 }, {
      opacity: 0.25,
      hardness: 0.16,
      tipId: 'marker-chisel',
      blendMode: 'max-alpha',
    })

    backend.createLayer('ink')
    backend.beginStroke('ink')
    for (let i = 0; i < 20; i++)
      backend.paintDab('ink', marker, 'normal')
    backend.endStroke('ink')

    const sprite = backend.getDisplayHandle('ink') as Sprite
    const single = readPixels(app, sprite, { x: 32, y: 32, width: 1, height: 1 })[3]
    expect(single).toBeLessThanOrEqual(80)

    backend.beginStroke('ink')
    for (let i = 0; i < 20; i++)
      backend.paintDab('ink', marker, 'normal')
    backend.endStroke('ink')

    expect(readPixels(app, sprite, { x: 32, y: 32, width: 1, height: 1 })[3])
      .toBeGreaterThan(single)
  })
})

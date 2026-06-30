import type { BrushDab, DirtyRect } from '@saier/core'
import { Application, Container, Rectangle } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'

import { PixiTileTextureBackend } from '../src'

interface Fixture {
  app: Application
  backend: PixiTileTextureBackend
  stage: Container
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
  const backend = new PixiTileTextureBackend({
    renderer: app.renderer,
    stage,
    width: 64,
    height: 64,
    tileSize: 16,
    autoFlush: false,
  })
  const fixture = { app, backend, stage }
  fixtures.push(fixture)
  return fixture
}

function dab(
  x: number,
  y: number,
  radius = 4,
  color: BrushDab['color'] = { r: 1, g: 0, b: 0, a: 1 },
): BrushDab {
  return {
    x,
    y,
    radius,
    opacity: 1,
    color,
  }
}

function readPixels(app: Application, target: Container, rect: DirtyRect): Uint8Array {
  const { pixels } = app.renderer.extract.pixels({
    target,
    frame: new Rectangle(rect.x, rect.y, rect.width, rect.height),
  })

  return new Uint8Array(pixels)
}

function pixelAt(pixels: Uint8Array, width: number, x: number, y: number): Uint8Array {
  const offset = (y * width + x) * 4
  return pixels.slice(offset, offset + 4)
}

function alphaAt(app: Application, target: Container, x: number, y: number): number {
  return readPixels(app, target, { x, y, width: 1, height: 1 })[3]
}

describe('pixiTileTextureBackend', () => {
  it('creates sparse tile sprites after flushing dirty pixels', async () => {
    const { app, backend, stage } = await createFixture()

    backend.createLayer('ink')
    const layer = backend.getDisplayHandle('ink') as Container
    expect(stage.children).toEqual([layer])
    expect(layer.children).toHaveLength(0)

    backend.beginStroke('ink')
    backend.paintDab('ink', dab(8, 8), 'normal')
    backend.endStroke('ink')

    expect(layer.children).toHaveLength(0)
    backend.flushUploads()

    expect(layer.children).toHaveLength(1)
    expect(alphaAt(app, layer, 8, 8)).toBeGreaterThan(0)
  })

  it('uploads each dirty tile once per flush, not once per dab', async () => {
    const { backend } = await createFixture()

    backend.createLayer('ink')
    backend.beginStroke('ink')
    for (let i = 0; i < 100; i++)
      backend.paintDab('ink', dab(8 + (i % 2), 8, 2), 'normal')
    backend.endStroke('ink')

    backend.flushUploads()
    expect(backend.__uploadsThisFrame).toBe(1)

    backend.flushUploads()
    expect(backend.__uploadsThisFrame).toBe(0)
  })

  it('samples straight RGBA from CPU tile pixels before GPU upload', async () => {
    const { backend } = await createFixture()

    backend.createLayer('ink')
    backend.beginStroke('ink')
    backend.paintDab('ink', dab(16, 16, 6, { r: 1, g: 0, b: 0, a: 1 }), 'normal')
    backend.paintDab('ink', dab(24, 16, 6, { r: 0, g: 0, b: 1, a: 1 }), 'normal')
    backend.endStroke('ink')

    const color = backend.sampleRegion('ink', { x: 12, y: 10, width: 16, height: 12 })

    expect(color.r).toBeGreaterThan(0.2)
    expect(color.b).toBeGreaterThan(0.2)
    expect(color.a).toBeGreaterThan(0.2)
  })

  it('reports tile memory from allocated buffers and uploaded textures', async () => {
    const { backend } = await createFixture()
    const bytesPerTile = 16 * 16 * 4

    backend.createLayer('ink')
    backend.beginStroke('ink')
    backend.paintDab('ink', dab(8, 8), 'normal')
    backend.endStroke('ink')

    let snapshot = backend.getMemorySnapshot()
    expect(snapshot.totalEstimatedBytes).toBe(bytesPerTile)
    expect(snapshot.metadata).toMatchObject({
      allocatedTileCount: 1,
      displayTileCount: 0,
    })

    backend.flushUploads()
    snapshot = backend.getMemorySnapshot()
    expect(snapshot.totalEstimatedBytes).toBe(bytesPerTile * 2)
    expect(snapshot.entries).toEqual([
      expect.objectContaining({ id: 'surface:tiled-cpu-buffers', bytes: bytesPerTile, count: 1 }),
      expect.objectContaining({ id: 'surface:tiled-gpu-textures', bytes: bytesPerTile, count: 1 }),
    ])
  })

  it('erases transparent pixels and round-trips tile patches', async () => {
    const { app, backend } = await createFixture()

    backend.createLayer('ink')
    const layer = backend.getDisplayHandle('ink') as Container

    backend.beginStroke('ink')
    backend.paintDab('ink', dab(8, 8, 6), 'normal')
    const paintPatch = backend.endStroke('ink')
    backend.flushUploads()
    expect(alphaAt(app, layer, 8, 8)).toBe(255)

    backend.beginStroke('ink')
    backend.paintDab('ink', dab(8, 8, 3), 'erase')
    const erasePatch = backend.endStroke('ink')
    backend.flushUploads()
    expect(alphaAt(app, layer, 8, 8)).toBe(0)

    backend.applyPatch(erasePatch, 'undo')
    backend.flushUploads()
    expect(alphaAt(app, layer, 8, 8)).toBe(255)

    backend.applyPatch(erasePatch, 'redo')
    backend.flushUploads()
    expect(alphaAt(app, layer, 8, 8)).toBe(0)

    backend.applyPatch(paintPatch, 'undo')
    backend.flushUploads()
    expect(alphaAt(app, layer, 8, 8)).toBe(0)
  })

  it('keeps tile sprites proportional to touched tiles across 5000 dabs', async () => {
    const { backend } = await createFixture()

    backend.createLayer('ink')
    const layer = backend.getDisplayHandle('ink') as Container
    backend.beginStroke('ink')
    for (let i = 0; i < 5000; i++)
      backend.paintDab('ink', dab(8 + (i % 4), 8 + (Math.floor(i / 4) % 4), 1), 'normal')
    backend.endStroke('ink')
    backend.flushUploads()

    expect(layer.children).toHaveLength(1)
    expect(backend.__uploadsThisFrame).toBe(1)
  })

  it('syncs layer visibility, opacity, blend mode and order to display containers', async () => {
    const { app, backend, stage } = await createFixture()

    backend.createLayer('red')
    backend.beginStroke('red')
    backend.paintDab('red', dab(32, 32, 8, { r: 1, g: 0, b: 0, a: 1 }), 'normal')
    backend.endStroke('red')

    backend.createLayer('blue')
    backend.beginStroke('blue')
    backend.paintDab('blue', dab(32, 32, 8, { r: 0, g: 0, b: 1, a: 1 }), 'normal')
    backend.endStroke('blue')
    backend.flushUploads()

    const blueTop = pixelAt(readPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(blueTop[2]).toBeGreaterThan(blueTop[0])

    backend.reorderLayers(['blue', 'red'])
    const redTop = pixelAt(readPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(redTop[0]).toBeGreaterThan(redTop[2])

    backend.setLayerState('red', { visible: false })
    const redHidden = pixelAt(readPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(redHidden[2]).toBeGreaterThan(redHidden[0])

    backend.setLayerState('red', { visible: true, opacity: 0.5 })
    const redHalf = pixelAt(readPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(redHalf[0]).toBeGreaterThan(80)
    expect(redHalf[2]).toBeGreaterThan(80)

    backend.setLayerState('red', { opacity: 1, blendMode: 'multiply' })
    const multiplied = pixelAt(readPixels(app, stage, { x: 32, y: 32, width: 1, height: 1 }), 1, 0, 0)
    expect(multiplied[0]).toBeLessThan(40)
    expect(multiplied[2]).toBeLessThan(40)
  })
})

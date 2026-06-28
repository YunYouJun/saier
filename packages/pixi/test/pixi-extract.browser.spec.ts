import { Application, Graphics, Rectangle } from 'pixi.js'
import { afterEach, describe, expect, it } from 'vitest'

const apps: Application[] = []

afterEach(() => {
  for (const app of apps.splice(0))
    app.destroy(true)
})

describe('pixi browser extract', () => {
  it('renders with WebGL and extracts non-empty pixels', async () => {
    const app = new Application()
    apps.push(app)

    await app.init({
      width: 32,
      height: 32,
      backgroundAlpha: 0,
      preference: 'webgl',
    })

    const marker = new Graphics()
      .rect(8, 10, 12, 9)
      .fill(0xFF0000)

    app.stage.addChild(marker)
    app.renderer.render(app.stage)

    expect(app.renderer.constructor.name).toBe('WebGLRenderer')

    const { pixels, width, height } = app.renderer.extract.pixels({
      target: app.stage,
      frame: new Rectangle(0, 0, 32, 32),
    })
    const alphaValues = []

    for (let i = 3; i < pixels.length; i += 4) {
      if (pixels[i] > 0)
        alphaValues.push(pixels[i])
    }

    expect(width).toBe(32)
    expect(height).toBe(32)
    expect(alphaValues.length).toBeGreaterThan(0)
  })
})

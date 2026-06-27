import { Application, Container } from 'pixi.js'
import { Tablet } from './tablet'
import 'pixi.js/unsafe-eval'

export interface ShodoOptions {
  canvas: HTMLCanvasElement
}

/**
 * Create a new Shodo instance.
 */
export async function createShodo(options: Partial<ShodoOptions> = {}) {
  const app = new Application()
  await app.init({
    resizeTo: window,
    canvas: options.canvas,
    preserveDrawingBuffer: true,
    background: '#ffffff',
  })

  // Append the application canvas to the document body
  if (!options.canvas) {
    document.body.appendChild(app.canvas)
  }

  const container = new Container()
  const tablet = new Tablet(app.renderer)
  container.addChild(tablet)
  tablet.start()

  app.stage.addChild(container)
}

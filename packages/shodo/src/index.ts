import type { BrushInputPoint } from '@saier/core'
import { CalligraphyEngine } from '@saier/core'
import { RenderTextureBackend } from '@saier/pixi'
import { Application, Container } from 'pixi.js'
import 'pixi.js/unsafe-eval'

export interface ShodoOptions {
  canvas: HTMLCanvasElement
  color?: number
  size?: number
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
  app.stage.addChild(container)

  const backend = new RenderTextureBackend({
    renderer: app.renderer,
    stage: container,
    width: app.renderer.width,
    height: app.renderer.height,
  })
  const layerId = 'shodo-layer'
  backend.createLayer(layerId)

  const engine = new CalligraphyEngine({
    bufferSize: 4,
    pressureVelocity: 1.4,
    taperOutSteps: 4,
  })

  let activePointerId: number | null = null
  let active = false

  const drawPoint = (event: PointerEvent) => {
    const point = toInputPoint(app.canvas, app.renderer.width, app.renderer.height, event)
    for (const dab of engine.addPoint(point))
      backend.paintDab(layerId, dab, 'normal')
  }

  const onPointerDown = (event: PointerEvent) => {
    if (activePointerId !== null)
      return
    event.preventDefault()
    activePointerId = event.pointerId
    active = true
    app.canvas.setPointerCapture?.(event.pointerId)
    engine.beginStroke({
      color: colorToRGBA(options.color ?? 0x000000),
      baseSize: options.size ?? 28,
    })
    backend.beginStroke(layerId)
    drawPoint(event)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (!active || activePointerId !== event.pointerId)
      return
    event.preventDefault()
    drawPoint(event)
  }

  const onPointerUp = (event: PointerEvent) => {
    if (!active || activePointerId !== event.pointerId)
      return
    event.preventDefault()
    for (const dab of engine.endStroke())
      backend.paintDab(layerId, dab, 'normal')
    backend.endStroke(layerId)
    app.canvas.releasePointerCapture?.(event.pointerId)
    active = false
    activePointerId = null
  }

  app.canvas.addEventListener('pointerdown', onPointerDown)
  app.canvas.addEventListener('pointermove', onPointerMove)
  app.canvas.addEventListener('pointerup', onPointerUp)
  app.canvas.addEventListener('pointercancel', onPointerUp)

  return {
    app,
    backend,
    destroy() {
      app.canvas.removeEventListener('pointerdown', onPointerDown)
      app.canvas.removeEventListener('pointermove', onPointerMove)
      app.canvas.removeEventListener('pointerup', onPointerUp)
      app.canvas.removeEventListener('pointercancel', onPointerUp)
      backend.destroy()
      app.destroy(true)
    },
  }
}

function toInputPoint(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  event: PointerEvent,
): BrushInputPoint {
  const rect = canvas.getBoundingClientRect()
  const x = (event.clientX - rect.left) * (width / rect.width)
  const y = (event.clientY - rect.top) * (height / rect.height)
  const pressure = event.pressure || 0

  return {
    x,
    y,
    pressure,
    hasPressure: event.pointerType !== 'mouse' && pressure > 0,
    pointerType: event.pointerType,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    time: event.timeStamp,
  }
}

function colorToRGBA(color: number) {
  return {
    r: ((color & 0xFF0000) >> 16) / 255,
    g: ((color & 0x00FF00) >> 8) / 255,
    b: (color & 0x0000FF) / 255,
    a: 1,
  }
}

import { useEffect, useRef } from 'react'
import { createPainter } from 'saier'

export function PixiPainter() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  let painter: ReturnType<typeof createPainter>

  useEffect(() => {
    const width = containerRef.current!.clientWidth
    const height = containerRef.current!.clientHeight

    // console.log('width', width, height)

    // canvas gl once
    if (!painter) {
      painter = createPainter({
        debug: import.meta.env.DEV,
        view: canvasRef.current!,
        size: {
          width,
          height,
        },
      })
      painter.init()
    }

    // return () => {
    //   painter.destroy()
    // }
  }, [])

  return (
    <div ref={containerRef} className="pixi-painter-container">
      <canvas className="pixi-painter-canvas h-full w-full" ref={canvasRef} id="canvas" width="1000" height="800" />
    </div>
  )
}

// dom eventListener

import type { Painter } from '../painter'

export function addImageDropListener(
  painter: Painter,
  canvas: HTMLCanvasElement,
  callback?: (file: File) => void,
) {
  canvas.addEventListener('dragover', (e) => {
    e.preventDefault()

    canvas.style.cursor = 'copy'
    canvas.style.opacity = '0.5'
  })
  function onDragLeave(e: DragEvent) {
    e.preventDefault()

    canvas.style.cursor = 'default'
    canvas.style.opacity = '1'
  }
  canvas.addEventListener('dragleave', onDragLeave)
  canvas.addEventListener('dragend', onDragLeave)
  canvas.addEventListener('drop', async (e) => {
    e.preventDefault()
    const file = e.dataTransfer?.files[0]

    if (file) {
      painter.loadImage(
        URL.createObjectURL(file),
      )

      callback?.(file)
    }

    onDragLeave(e)
  })
}

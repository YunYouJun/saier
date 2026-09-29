import type { Painter } from 'saier'

export interface ImageExportOptions {
  format: 'png' | 'jpeg'
  background: string | null
  quality: number
}

/** Export the document pixels, independent of the viewport, theme and display DPR. */
export async function exportDocumentImage(painter: Painter, options: ImageExportOptions): Promise<Blob> {
  painter.confirmTransform()
  const source = await painter.extractCanvas('canvas', { mode: 'content' }) as HTMLCanvasElement
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d')
  if (!context)
    throw new Error('Canvas 2D is unavailable')
  if (options.background || options.format === 'jpeg') {
    context.fillStyle = options.background || '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
  }
  context.drawImage(source, 0, 0)
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Image encoding failed')), `image/${options.format}`, options.quality)
  })
}

/** Use a safe basename while retaining dots inside the artwork title. */
export function imageExportName(name: string, format: ImageExportOptions['format']): string {
  return `${name.replace(/\.(?:png|jpe?g)$/i, '').replaceAll(/[\\/:*?"<>|]/g, '-').trim() || 'saier'}.${format === 'jpeg' ? 'jpg' : 'png'}`
}

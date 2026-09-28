import type { Painter } from '../src'
import { afterEach, describe, expect, it } from 'vitest'
import { exportDocumentImage } from '../../../site/app/features/image-files/export'
import { createPainter, ImageImportSizeError, importImagePixels } from '../src'

const painters: Painter[] = []
afterEach(() => {
  for (const painter of painters.splice(0))
    painter.destroy()
})

async function fixture(): Promise<Painter> {
  const painter = createPainter({
    view: document.createElement('canvas'),
    size: { width: 200, height: 150 },
    boardSize: { width: 32, height: 32 },
    resolution: 2,
    pixiOptions: { backgroundAlpha: 0 },
    imageDrop: false,
  })
  await painter.init()
  painters.push(painter)
  return painter
}

function image(width: number, height: number, format = 'image/png'): string {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')!
  context.fillStyle = '#ff0000'
  context.fillRect(0, 0, width / 2, height)
  return canvas.toDataURL(format, 1)
}

async function decode(blob: Blob): Promise<ImageData> {
  const bitmap = await createImageBitmap(blob)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const context = canvas.getContext('2d')!
  context.drawImage(bitmap, 0, 0)
  bitmap.close()
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

describe('image document workflow', () => {
  it('keeps host previews display-only and restores native layers when cleared or switching documents', async () => {
    const painter = await fixture()
    const before = painter.exportProject()
    const preview = document.createElement('canvas')
    preview.width = preview.height = 8
    preview.getContext('2d')!.fillRect(0, 0, 8, 8)
    painter.setDocumentPreview(preview)
    expect(painter.canvas.documentsContainer.visible).toBe(false)
    expect(painter.exportProject()).toEqual(before)
    painter.setDocumentPreview(null)
    expect(painter.canvas.documentsContainer.visible).toBe(true)
    painter.setDocumentPreview(preview)
    const original = painter.getActiveDocumentId()
    painter.createDocument({ width: 16, height: 16 })
    expect(painter.canvas.documentsContainer.visible).toBe(true)
    painter.switchDocument(original)
    expect(painter.canvas.documentsContainer.visible).toBe(true)
    expect(painter.exportProject()).toEqual(before)
  })

  it('opens original pixels in a new document and exports independent of DPR and zoom', async () => {
    const painter = await fixture()
    const previous = painter.getActiveDocumentId()
    const opened = await painter.openImage(image(800, 400), { name: 'art.png' })
    expect(opened).toMatchObject({ width: 800, height: 400, name: 'art.png', active: true })
    expect(painter.getDocuments()).toHaveLength(2)
    expect(painter.document.layers).toHaveLength(1)
    expect(painter.getViewportSnapshot().scale).toBeLessThan(0.3)
    painter.zoomViewportAt({ x: 50, y: 50 }, 2)
    const pixels = await decode(await exportDocumentImage(painter, { format: 'png', background: null, quality: 1 }))
    expect([pixels.width, pixels.height]).toEqual([800, 400])
    expect([...pixels.data.slice(0, 4)]).toEqual([255, 0, 0, 255])
    expect(pixels.data[(799 * 4) + 3]).toBe(0)
    painter.switchDocument(previous)
    expect(painter.document.width).toBe(32)
  })

  it('places a layer without changing document dimensions and can undo it', async () => {
    const painter = await fixture()
    const id = painter.getActiveDocumentId()
    await painter.loadImage(image(80, 40), { label: 'signature.png' })
    expect(painter.getActiveDocumentId()).toBe(id)
    expect(painter.getTransformSelection()).toMatchObject({ width: 32, height: 16 })
    expect(painter.document.layers.at(-1)?.label).toBe('signature.png')
    painter.history.undo()
    expect(painter.document.layers).toHaveLength(1)
  })

  it('keeps the old document and history on decode error, cancellation and size rejection', async () => {
    const painter = await fixture()
    const before = painter.exportProject()
    const controller = new AbortController()
    controller.abort()
    await expect(painter.openImage(image(80, 40), { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })
    await expect(painter.openImage('data:image/png;base64,AA==')).rejects.toThrow('Failed to load image')
    await expect(painter.openImage(image(80, 40), { limits: { maxDimension: 50, maxPixels: 1000 } })).rejects.toBeInstanceOf(ImageImportSizeError)
    expect(painter.exportProject()).toEqual(before)
    expect(painter.getDocuments()).toHaveLength(1)
    expect(painter.history.canUndo()).toBe(false)
    const resized = await painter.openImage(image(80, 40), { limits: { maxDimension: 50, maxPixels: 1000 }, resizeToFit: true })
    expect(resized.width * resized.height).toBeLessThanOrEqual(1000)
    expect(resized.width).toBeLessThanOrEqual(50)
  })

  it('applies EXIF orientation once before choosing the new document dimensions', async () => {
    const jpeg = new Uint8Array(await (await fetch(image(80, 40, 'image/jpeg'))).arrayBuffer())
    // APP1, Exif TIFF, little-endian IFD0 with Orientation = 6 (90° clockwise).
    const exif = new Uint8Array([
      0xFF,
      0xE1,
      0,
      34,
      0x45,
      0x78,
      0x69,
      0x66,
      0,
      0,
      0x49,
      0x49,
      42,
      0,
      8,
      0,
      0,
      0,
      1,
      0,
      0x12,
      1,
      3,
      0,
      1,
      0,
      0,
      0,
      6,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
    ])
    const url = URL.createObjectURL(new Blob([jpeg.slice(0, 2), exif, jpeg.slice(2)], { type: 'image/jpeg' }))
    try {
      const decoded = await importImagePixels(url)
      expect([decoded.width, decoded.height]).toEqual([40, 80])
      expect(decoded.pixels[0]).toBeGreaterThan(240)
      expect(decoded.pixels[(79 * 40 * 4)]).toBeLessThan(20)
    }
    finally {
      URL.revokeObjectURL(url)
    }
  })

  it('fills transparent pixels with the chosen JPEG background and emits the right MIME type', async () => {
    const painter = await fixture()
    await painter.openImage(image(80, 40))
    const blob = await exportDocumentImage(painter, { format: 'jpeg', background: '#00ff00', quality: 1 })
    expect(blob.type).toBe('image/jpeg')
    const pixels = await decode(blob)
    expect([pixels.width, pixels.height]).toEqual([80, 40])
    const offset = (20 * 80 + 70) * 4
    expect(pixels.data[offset + 1]).toBeGreaterThan(245)
    expect(pixels.data[offset + 3]).toBe(255)
  })
})

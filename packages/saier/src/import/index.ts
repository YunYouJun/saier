import { Sprite, Texture } from 'pixi.js'

export {
  type ImportedRasterDocument,
  type ImportedRasterImage,
  type ImportedRasterLayer,
  isPsdBuffer,
  readPsdDocument,
  type ReadPsdDocumentOptions,
} from '@saier/core'

export interface ImportImageSpriteOptions {
  /** Maximum rendered width in document pixels. Images are never upscaled. */
  maxWidth?: number
  /** Maximum rendered height in document pixels. Images are never upscaled. */
  maxHeight?: number
}

export interface ImportedImagePixels {
  /** Premultiplied RGBA pixels, row-major. */
  pixels: Uint8Array
  width: number
  height: number
}

/** Import an image URL as a Pixi sprite, optionally fitting it to a document. */
export function importImageSprite(
  src: string,
  options: ImportImageSpriteOptions = {},
): Promise<Sprite> {
  const img = new Image()
  img.decoding = 'async'

  return new Promise<Sprite>((resolve, reject) => {
    const cleanup = () => {
      img.onload = null
      img.onerror = null
    }
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const width = img.naturalWidth
        const height = img.naturalHeight
        if (width <= 0 || height <= 0)
          throw new Error('Loaded image has invalid dimensions')

        const maxWidth = normalizeMaximum(options.maxWidth)
        const maxHeight = normalizeMaximum(options.maxHeight)
        const scale = Math.min(1, maxWidth / width, maxHeight / height)
        const texture = Texture.from(img)
        const sprite = new Sprite(texture)
        sprite.scale.set(scale)
        sprite.anchor.set(0.5)
        sprite.eventMode = 'static'
        sprite.accessibleType = 'img'
        sprite.accessibleTitle = 'Image Sprite'
        cleanup()
        resolve(sprite)
      }
      catch (error) {
        cleanup()
        reject(error)
      }
    }
    img.onerror = () => {
      cleanup()
      reject(new Error('Failed to load image'))
    }
    img.src = src
  })
}

/** Decode an image URL into fitted, premultiplied RGBA pixels. */
export function importImagePixels(
  src: string,
  options: ImportImageSpriteOptions = {},
): Promise<ImportedImagePixels> {
  const img = new Image()
  img.decoding = 'async'

  return new Promise<ImportedImagePixels>((resolve, reject) => {
    const cleanup = () => {
      img.onload = null
      img.onerror = null
    }
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const sourceWidth = img.naturalWidth
        const sourceHeight = img.naturalHeight
        if (sourceWidth <= 0 || sourceHeight <= 0)
          throw new Error('Loaded image has invalid dimensions')

        const scale = Math.min(
          1,
          normalizeMaximum(options.maxWidth) / sourceWidth,
          normalizeMaximum(options.maxHeight) / sourceHeight,
        )
        const width = Math.max(1, Math.round(sourceWidth * scale))
        const height = Math.max(1, Math.round(sourceHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context)
          throw new Error('Canvas 2D is unavailable for image import')

        context.drawImage(img, 0, 0, width, height)
        const straight = context.getImageData(0, 0, width, height).data
        const pixels = premultiplyPixels(straight)
        cleanup()
        resolve({ pixels, width, height })
      }
      catch (error) {
        cleanup()
        reject(error)
      }
    }
    img.onerror = () => {
      cleanup()
      reject(new Error('Failed to load image'))
    }
    img.src = src
  })
}

function normalizeMaximum(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : Number.POSITIVE_INFINITY
}

function premultiplyPixels(pixels: Uint8ClampedArray): Uint8Array {
  const out = new Uint8Array(pixels.length)
  for (let offset = 0; offset < pixels.length; offset += 4) {
    const alpha = pixels[offset + 3] ?? 0
    out[offset + 3] = alpha
    out[offset] = Math.round((pixels[offset]! * alpha) / 255)
    out[offset + 1] = Math.round((pixels[offset + 1]! * alpha) / 255)
    out[offset + 2] = Math.round((pixels[offset + 2]! * alpha) / 255)
  }
  return out
}

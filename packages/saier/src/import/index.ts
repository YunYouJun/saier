import { Sprite, Texture } from 'pixi.js'
import { PainterBoard } from '../board'

export {
  type ImportedRasterDocument,
  type ImportedRasterImage,
  type ImportedRasterLayer,
  isPsdBuffer,
  readPsdDocument,
  type ReadPsdDocumentOptions,
} from '@saier/core'

/**
 * import image as PIXI.Sprite
 * blob url
 */
export async function importImageSprite(src: string) {
  const img = new Image()
  return new Promise<Sprite>((resolve) => {
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const texture = Texture.from(img)
      const sprite = new Sprite(texture)
      // auto scale for drag img
      if (img.width > PainterBoard.size.width || img.height > PainterBoard.size.height) {
        const scale = Math.min(PainterBoard.size.width / img.width, PainterBoard.size.height / img.height)
        sprite.scale.set(scale)
      }
      sprite.anchor.set(0.5)
      sprite.eventMode = 'static'
      sprite.accessibleType = 'img'
      sprite.accessibleTitle = 'Image Sprite'
      resolve(sprite)
    }
    img.src = src
  })
}

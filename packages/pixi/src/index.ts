import 'pixi.js/advanced-blend-modes'

/**
 * `@saier/pixi` — the PixiJS bridge for saier.
 *
 * This is the single seam where `@saier/core`'s {@link SurfaceBackend} contract
 * meets PixiJS: surface backends (RenderTexture in P1, tiled in P2), the layer
 * renderer, and the viewport / overlay reuse of the existing Pixi display layer.
 *
 * P1 starts with `RenderTextureBackend`: each raster layer is a Pixi
 * RenderTexture, while dabs render into a scratch stroke RenderTexture and are
 * committed as bbox-scoped undo patches.
 */

export {
  createDabTexture,
  createRoundDabTexture,
  dabTextureKey,
  type DabTextureOptions,
  DEFAULT_DAB_TEXTURE_SIZE,
} from './dab-cache'

export {
  PixiTileTextureBackend,
} from './PixiTileTextureBackend'

export type {
  PixiTileTextureBackendOptions,
} from './PixiTileTextureBackend'

export {
  PixiViewport,
} from './PixiViewport'

export type {
  PixiViewportOptions,
  ViewportPoint,
} from './PixiViewport'

export {
  RenderTextureBackend,
} from './RenderTextureBackend'

export type {
  RenderTextureBackendOptions,
} from './RenderTextureBackend'

export {
  TouchGestureRouter,
} from './TouchGestureRouter'

export type {
  GestureViewport,
  PointerGestureEventLike,
  TouchGestureRouterOptions,
} from './TouchGestureRouter'

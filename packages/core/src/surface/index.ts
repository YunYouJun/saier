export {
  compositeLockAlphaRegion,
  rasterizeDab,
} from './rasterizer'

export {
  Tile,
  type TileOptions,
} from './Tile'

export {
  type TileCoord,
  type TileDocOrigin,
  TiledSurface,
  type TiledSurfaceDirtySnapshot,
  type TiledSurfaceOptions,
  tileKey,
  type TileVisitor,
} from './TiledSurface'

export {
  assertTilePatches,
  TilePatchRecorder,
  type TilePatchRecorderOptions,
} from './TilePatchRecorder'

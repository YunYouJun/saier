import type { PresetAssetDescriptor, PresetPlacement } from './preset-contract'
import { isPatternAsset, placementBounds } from './preset-contract'

export const WATERMARK_ROLE_NAMES: Record<PresetAssetDescriptor['role'], string> = {
  'horizontal-ribbon': '横向缎带',
  'vertical-ribbon': '纵向缎带',
  'vertical-ribbon-short': '短缎带',
  'heart-signature': '心形签名',
  'small-seal': '小印章',
  'frame-and-footer': '边框与署名',
  'display-only': 'FOR DISPLAY ONLY 主标题',
  'footer-signature': '底部署名',
  'frame': '自适应边框',
  'repeated-watermark': '满屏小字与图案（线性光）',
  'micro-texture': '满屏细纹理（叠加）',
}

export function isMovableAsset(asset: PresetAssetDescriptor): boolean {
  return asset.role !== 'frame' && !isPatternAsset(asset)
}

/** Keep manual transforms in bounds, preserving the center when resizing or rotating. */
export function fitPlacement(p: PresetPlacement, asset: PresetAssetDescriptor, image: { width: number, height: number }, patch: Partial<PresetPlacement>): PresetPlacement {
  const next = { ...p, ...patch }
  if (!isMovableAsset(asset))
    return next
  const heightRatio = image.width * asset.height / asset.width / image.height
  if (patch.width !== undefined) {
    if (patch.x === undefined)
      next.x += (p.width - next.width) / 2
    if (patch.y === undefined)
      next.y += (p.width - next.width) * heightRatio / 2
  }
  let b = placementBounds(next, asset, image)
  const scale = Math.min(1, 1 / b.width, 1 / b.height, 1 / next.width, 1 / (next.width * heightRatio))
  if (scale < 1) {
    next.x += next.width * (1 - scale) / 2
    next.y += next.width * heightRatio * (1 - scale) / 2
    next.width *= scale
    b = placementBounds(next, asset, image)
  }
  // The contract also requires the pre-rotation top-left to be non-negative.
  next.x += Math.max(-next.x, -b.x, Math.min(0, 1 - b.x - b.width))
  next.y += Math.max(-next.y, -b.y, Math.min(0, 1 - b.y - b.height))
  return next
}

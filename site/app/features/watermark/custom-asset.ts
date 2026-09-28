import type { LoadedPreset, LoadedPresetAsset } from './preset'
import type { PresetAssetDescriptor } from './preset-contract'
import { parsePresetDescriptor } from './preset-contract'

export const WATERMARK_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
export const MAX_WATERMARK_BYTES = 25_000_000

/** Rasterize user uploads into self-contained PNGs; never retain remote capabilities. */
export async function readCustomWatermark(file: File, role: PresetAssetDescriptor['role'], recolorable: boolean, preset?: LoadedPreset): Promise<LoadedPresetAsset> {
  if (!WATERMARK_IMAGE_TYPES.includes(file.type) || !file.size || file.size > MAX_WATERMARK_BYTES)
    throw new Error('请选择 25 MB 以内的 PNG / JPEG / WebP 水印')
  if ((preset?.assets.length ?? 0) >= 12)
    throw new Error('每套预设最多包含 12 个素材')
  const bitmap = await createImageBitmap(file)
  try {
    const pixels = (preset?.assets ?? []).reduce((sum, asset) => sum + asset.width * asset.height, 0)
    if (bitmap.width * bitmap.height + pixels > 32_000_000 || Math.max(bitmap.width, bitmap.height) > 8192)
      throw new Error('素材最长边不能超过 8192px，预设总像素不能超过 3200 万')
    const image = document.createElement('canvas')
    image.width = bitmap.width
    image.height = bitmap.height
    image.getContext('2d')!.drawImage(bitmap, 0, 0)
    const source = image.toDataURL('image/png')
    if (source.length > 24_000_000)
      throw new Error('转换后的 PNG 太大，请先缩小素材')
    if (source.length + (preset?.assets ?? []).reduce((sum, asset) => sum + asset.source.length, 0) > 60 * 1024 * 1024)
      throw new Error('素材包过大，请先缩小部分素材')
    const descriptor = parsePresetDescriptor({ version: 1, name: '我的水印', rules: '', assets: [{ id: crypto.randomUUID(), role, recolorable, width: image.width, height: image.height, blendMode: role === 'micro-texture' ? 'overlay' : role === 'repeated-watermark' ? 'linear-light' : 'normal' }] }).assets[0]!
    return { ...descriptor, name: file.name.trim().slice(0, 120) || '自定义水印', image, source, enabled: true }
  }
  finally {
    bitmap.close()
  }
}

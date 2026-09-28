import type { LoadedPreset } from './preset'
import type { PresetPlacement } from './preset-contract'
import type { ProtectedRegion } from './protocol'
import { describePreset, readWatermarkPreset, serializePreset } from './preset'
import { watermarkObject } from './preset-contract'
import { parseAnalysis } from './protocol'

export interface WatermarkWorkInput {
  artwork: HTMLCanvasElement
  preset: LoadedPreset
  placements: PresetPlacement[]
  regions: ProtectedRegion[]
}

/** Portable local handoff for the watermark editor; not a saier.project file. */
export function serializeWatermarkWorkfile(input: WatermarkWorkInput): string {
  return JSON.stringify({
    format: 'saier.watermark-workfile',
    version: 1,
    artwork: input.artwork.toDataURL('image/png'),
    preset: JSON.parse(serializePreset(input.preset)),
    analysis: { placements: input.placements, regions: input.regions, warnings: [] },
  })
}

/** Decode and validate the entire file before replacing any active work. */
export async function readWatermarkWorkfile(file: File): Promise<WatermarkWorkInput> {
  if (file.size > 100 * 1024 * 1024)
    throw new Error('水印工作文件不能超过 100 MiB')
  const value: unknown = JSON.parse(await file.text())
  if (!watermarkObject(value) || value.format !== 'saier.watermark-workfile' || value.version !== 1
    || typeof value.artwork !== 'string' || value.artwork.length > 40_000_000
    || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.artwork)) {
    throw new Error('请选择 Saier 水印工作文件')
  }
  const blob = await (await fetch(value.artwork)).blob()
  const header = new DataView(await blob.slice(0, 24).arrayBuffer())
  if (header.byteLength !== 24 || header.getUint32(0) !== 0x89504E47 || header.getUint32(4) !== 0x0D0A1A0A)
    throw new Error('工作文件中的原图无效')
  const width = header.getUint32(16)
  const height = header.getUint32(20)
  if (!width || !height || Math.max(width, height) > 8192 || width * height > 32_000_000)
    throw new Error('原图超过尺寸限制')
  const preset = await readWatermarkPreset(new File([JSON.stringify(value.preset)], 'preset.json'))
  const analysis = parseAnalysis(value.analysis, describePreset(preset), { width, height })
  const bitmap = await createImageBitmap(blob)
  try {
    if (bitmap.width !== width || bitmap.height !== height)
      throw new Error('原图尺寸与文件头不一致')
    const artwork = document.createElement('canvas')
    artwork.width = width
    artwork.height = height
    artwork.getContext('2d')!.drawImage(bitmap, 0, 0)
    return { artwork, preset, placements: analysis.placements!, regions: analysis.regions }
  }
  finally {
    bitmap.close()
  }
}

export function downloadWatermarkBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

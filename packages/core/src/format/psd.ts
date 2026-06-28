import type {
  PixelArray,
  PixelData,
  BlendMode as PsdBlendMode,
  Layer as PsdLayer,
} from 'ag-psd'
import type { BlendMode } from '../document'
import { initializeCanvas, readPsd } from 'ag-psd'

export interface ImportedRasterImage {
  width: number
  height: number
  pixels: Uint8ClampedArray
}

export interface ImportedRasterLayer extends ImportedRasterImage {
  id: string
  name: string
  left: number
  top: number
  visible: boolean
  opacity: number
  blendMode: BlendMode
  sourceBlendMode: PsdBlendMode | undefined
  groupPath: string[]
}

export interface ImportedRasterDocument {
  format: 'psd'
  width: number
  height: number
  layers: ImportedRasterLayer[]
  composite?: ImportedRasterImage
  warnings: string[]
}

export interface ReadPsdDocumentOptions {
  includeComposite?: boolean
}

const PSD_SIGNATURE = '8BPS'

export function isPsdBuffer(input: ArrayBuffer | Uint8Array): boolean {
  const bytes = toUint8Array(input)
  if (bytes.byteLength < PSD_SIGNATURE.length)
    return false
  return String.fromCharCode(...bytes.subarray(0, PSD_SIGNATURE.length)) === PSD_SIGNATURE
}

export function readPsdDocument(
  input: ArrayBuffer | Uint8Array,
  options: ReadPsdDocumentOptions = {},
): ImportedRasterDocument {
  if (!isPsdBuffer(input))
    throw new Error('Unsupported raster document: expected a PSD file')

  ensureImageDataFactory()

  const includeComposite = options.includeComposite ?? true
  const warnings: string[] = []
  const psd = readPsd(input, {
    useImageData: true,
    skipThumbnail: true,
    skipCompositeImageData: !includeComposite,
    logMissingFeatures: false,
  })

  const psdLayers = flattenLayers(psd.children ?? [], [], warnings)
  const layers = psdLayers
    .reverse()
    .map((layer, index) => convertLayer(layer, index + 1, warnings))

  return {
    format: 'psd',
    width: psd.width,
    height: psd.height,
    layers,
    composite: includeComposite && psd.imageData
      ? toImportedImage(psd.imageData)
      : undefined,
    warnings,
  }
}

interface FlattenedPsdLayer {
  layer: PsdLayer
  groupPath: string[]
}

function flattenLayers(
  layers: PsdLayer[],
  groupPath: string[],
  warnings: string[],
): FlattenedPsdLayer[] {
  const out: FlattenedPsdLayer[] = []

  for (const layer of layers) {
    const name = layer.name ?? 'Layer'
    if (layer.children) {
      out.push(...flattenLayers(layer.children, [...groupPath, name], warnings))
      continue
    }

    if (!layer.imageData) {
      warnings.push(`Skipped PSD layer without bitmap data: ${name}`)
      continue
    }

    out.push({ layer, groupPath })
  }

  return out
}

function convertLayer(
  item: FlattenedPsdLayer,
  index: number,
  warnings: string[],
): ImportedRasterLayer {
  const { layer, groupPath } = item
  const image = toImportedImage(layer.imageData!)
  const sourceBlendMode = layer.blendMode
  return {
    id: `psd-layer-${index}`,
    name: layer.name ?? `Layer ${index}`,
    left: layer.left ?? 0,
    top: layer.top ?? 0,
    width: image.width,
    height: image.height,
    pixels: image.pixels,
    visible: layer.hidden !== true,
    opacity: clamp01(layer.opacity ?? 1),
    blendMode: toSaierBlendMode(sourceBlendMode, warnings),
    sourceBlendMode,
    groupPath,
  }
}

function toImportedImage(imageData: PixelData): ImportedRasterImage {
  return {
    width: imageData.width,
    height: imageData.height,
    pixels: toUint8ClampedPixels(imageData.data),
  }
}

function toSaierBlendMode(
  blendMode: PsdBlendMode | undefined,
  warnings: string[],
): BlendMode {
  switch (blendMode) {
    case undefined:
    case 'normal':
    case 'multiply':
    case 'screen':
    case 'overlay':
    case 'darken':
    case 'lighten':
      return blendMode ?? 'normal'
    case 'linear dodge':
      return 'add'
    default:
      warnings.push(`Mapped unsupported PSD blend mode "${blendMode}" to "normal"`)
      return 'normal'
  }
}

function toUint8ClampedPixels(data: PixelArray): Uint8ClampedArray {
  if (data instanceof Uint8ClampedArray)
    return new Uint8ClampedArray(data)
  if (data instanceof Uint8Array)
    return new Uint8ClampedArray(data)
  if (data instanceof Uint16Array) {
    const out = new Uint8ClampedArray(data.length)
    for (let i = 0; i < data.length; i++)
      out[i] = Math.round((data[i] ?? 0) / 257)
    return out
  }

  const out = new Uint8ClampedArray(data.length)
  for (let i = 0; i < data.length; i++)
    out[i] = Math.round(clamp01(data[i] ?? 0) * 255)
  return out
}

function toUint8Array(input: ArrayBuffer | Uint8Array): Uint8Array {
  return input instanceof Uint8Array ? input : new Uint8Array(input)
}

function clamp01(value: number): number {
  if (value < 0)
    return 0
  if (value > 1)
    return 1
  return value
}

let imageDataFactoryReady = false

function ensureImageDataFactory(): void {
  if (imageDataFactoryReady || typeof document !== 'undefined')
    return

  initializeCanvas(createCanvas, createImageData)
  imageDataFactoryReady = true
}

function createImageData(width: number, height: number): ImageData {
  return {
    width,
    height,
    colorSpace: 'srgb',
    data: new Uint8ClampedArray(width * height * 4),
  } as ImageData
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined')
    return new OffscreenCanvas(width, height) as unknown as HTMLCanvasElement

  return {
    width,
    height,
    getContext: () => ({
      createImageData,
      drawImage: () => {},
      getImageData: (_x: number, _y: number, w: number, h: number) => createImageData(w, h),
      putImageData: () => {},
    }),
  } as unknown as HTMLCanvasElement
}

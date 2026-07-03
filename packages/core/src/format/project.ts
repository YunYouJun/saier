import type { BlendMode, LayerMaskRef, LayerNode, RasterLayer } from '../document'
import type { LayerTransform } from '../math'
import { Document } from '../document'
import { TiledSurface } from '../surface'

export const SAIER_PROJECT_FORMAT = 'saier.project'
export const SAIER_PROJECT_VERSION = 2

export type SaierProjectMetadataValue = string | number | boolean | null
export type SaierProjectMetadata = Record<string, SaierProjectMetadataValue>

export interface SaierProjectTile {
  tileX: number
  tileY: number
  encoding: 'base64'
  data: string
}

export interface SaierProjectSurface {
  id: string
  width: number
  height: number
  tileSize: number
  tiles: SaierProjectTile[]
}

export interface SaierProjectLayer {
  type?: 'raster'
  id: string
  label: string
  visible: boolean
  opacity: number
  blendMode: BlendMode
  lockAlpha: boolean
  clip: boolean
  transform?: LayerTransform
  mask?: LayerMaskRef
}

export interface SaierProjectLayerGroup {
  type: 'group'
  id: string
  label: string
  visible: boolean
  collapsed: boolean
  children: SaierProjectLayerNode[]
}

export type SaierProjectLayerNode = SaierProjectLayer | SaierProjectLayerGroup

export interface SaierProjectFile {
  format: typeof SAIER_PROJECT_FORMAT
  version: 1 | typeof SAIER_PROJECT_VERSION
  width: number
  height: number
  tileSize: number
  activeLayerId: string | null
  metadata?: SaierProjectMetadata
  layerTree?: SaierProjectLayerNode[]
  layers: SaierProjectLayer[]
  surfaces: SaierProjectSurface[]
}

export interface SerializeSaierProjectOptions {
  document: Document
  resolveSurface: (surfaceId: string) => TiledSurface | undefined
  metadata?: SaierProjectMetadata
}

export interface DeserializedSaierProject {
  document: Document
  surfaces: Map<string, TiledSurface>
  metadata: SaierProjectMetadata
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function serializeSaierProject(options: SerializeSaierProjectOptions): SaierProjectFile {
  const layers = options.document.layers
  const surfaceIds = collectSurfaceIds(layers)
  const surfaces = surfaceIds.map((id) => {
    const surface = options.resolveSurface(id)
    if (!surface)
      throw new Error(`Cannot serialize project: missing surface "${id}"`)
    return serializeSurface(id, surface)
  })
  const tileSize = surfaces[0]?.tileSize ?? 256

  return {
    format: SAIER_PROJECT_FORMAT,
    version: SAIER_PROJECT_VERSION,
    width: options.document.width,
    height: options.document.height,
    tileSize,
    activeLayerId: options.document.activeLayerId,
    ...(options.metadata ? { metadata: { ...options.metadata } } : {}),
    layerTree: serializeLayerNodes(options.document.layerTree),
    layers: layers.map(serializeLayer),
    surfaces,
  }
}

export function deserializeSaierProject(project: SaierProjectFile): DeserializedSaierProject {
  assertProjectFile(project)

  const document = new Document({ width: project.width, height: project.height })
  if (project.layerTree)
    deserializeLayerNodes(project.layerTree, document, null)
  else
    deserializeLayers(project.layers, document, null)

  if (project.activeLayerId)
    document.setActive(project.activeLayerId)

  const surfaces = new Map<string, TiledSurface>()
  for (const surfaceFile of project.surfaces)
    surfaces.set(surfaceFile.id, deserializeSurface(surfaceFile))

  for (const id of collectSurfaceIds(document.layers)) {
    if (!surfaces.has(id)) {
      surfaces.set(id, new TiledSurface({
        width: project.width,
        height: project.height,
        tileSize: project.tileSize,
      }))
    }
  }

  return {
    document,
    surfaces,
    metadata: project.metadata ? { ...project.metadata } : {},
  }
}

function serializeLayer(layer: RasterLayer): SaierProjectLayer {
  return {
    type: 'raster',
    id: layer.id,
    label: layer.label,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    lockAlpha: layer.lockAlpha,
    clip: layer.clip,
    ...(layer.transform ? { transform: { ...layer.transform } } : {}),
    ...(layer.mask ? { mask: { ...layer.mask } } : {}),
  }
}

function serializeLayerNodes(nodes: LayerNode[]): SaierProjectLayerNode[] {
  return nodes.map((node): SaierProjectLayerNode => {
    if (node.type === 'raster')
      return serializeLayer(node)
    return {
      type: 'group',
      id: node.id,
      label: node.label,
      visible: node.visible,
      collapsed: node.collapsed,
      children: serializeLayerNodes(node.children),
    }
  })
}

function deserializeLayerNodes(nodes: SaierProjectLayerNode[], document: Document, parentId: string | null): void {
  for (const node of nodes) {
    if (node.type === 'group') {
      document.addGroup({
        id: node.id,
        label: node.label,
        visible: node.visible,
        collapsed: node.collapsed,
        parentId,
      })
      deserializeLayerNodes(node.children, document, node.id)
      continue
    }

    deserializeLayer(node, document, parentId)
  }
}

function deserializeLayers(layers: SaierProjectLayer[], document: Document, parentId: string | null): void {
  for (const layer of layers)
    deserializeLayer(layer, document, parentId)
}

function deserializeLayer(layer: SaierProjectLayer, document: Document, parentId: string | null): void {
  document.addLayer({
    id: layer.id,
    label: layer.label,
    visible: layer.visible,
    opacity: layer.opacity,
    blendMode: layer.blendMode,
    lockAlpha: layer.lockAlpha,
    clip: layer.clip,
    parentId,
    ...(layer.transform ? { transform: { ...layer.transform } } : {}),
  })
  if (layer.mask) {
    document.attachMask(layer.id, layer.mask.id)
    document.setMaskEnabled(layer.id, layer.mask.enabled)
  }
}

function serializeSurface(id: string, surface: TiledSurface): SaierProjectSurface {
  const tiles = surface.allocatedTiles
    .filter(tile => tile.hasVisiblePixels())
    .sort((a, b) => a.tileY - b.tileY || a.tileX - b.tileX)
    .map(tile => ({
      tileX: tile.tileX,
      tileY: tile.tileY,
      encoding: 'base64' as const,
      data: encodeBytesBase64(tile.cloneData()),
    }))

  return {
    id,
    width: surface.width,
    height: surface.height,
    tileSize: surface.tileSize,
    tiles,
  }
}

function deserializeSurface(surfaceFile: SaierProjectSurface): TiledSurface {
  const surface = new TiledSurface({
    width: normalizePositiveInteger(surfaceFile.width, 'surface width'),
    height: normalizePositiveInteger(surfaceFile.height, 'surface height'),
    tileSize: normalizePositiveInteger(surfaceFile.tileSize, 'surface tileSize'),
  })

  for (const tile of surfaceFile.tiles) {
    if (tile.encoding !== 'base64')
      throw new Error(`Unsupported tile encoding: ${tile.encoding}`)
    surface.writeTileData(tile.tileX, tile.tileY, decodeBytesBase64(tile.data))
  }
  surface.flushDirty()
  return surface
}

function collectSurfaceIds(layers: RasterLayer[]): string[] {
  const ids: string[] = []
  for (const layer of layers) {
    ids.push(layer.id)
    if (layer.mask)
      ids.push(layer.mask.id)
  }
  return ids
}

function assertProjectFile(project: SaierProjectFile): void {
  if (project.format !== SAIER_PROJECT_FORMAT)
    throw new Error(`Unsupported project format: ${project.format}`)
  if (project.version !== 1 && project.version !== SAIER_PROJECT_VERSION)
    throw new Error(`Unsupported project version: ${project.version}`)
  normalizePositiveInteger(project.width, 'project width')
  normalizePositiveInteger(project.height, 'project height')
  normalizePositiveInteger(project.tileSize, 'project tileSize')
}

function normalizePositiveInteger(value: number, label: string): number {
  if (!Number.isFinite(value))
    throw new Error(`${label} must be finite`)
  const next = Math.round(value)
  if (next <= 0)
    throw new Error(`${label} must be positive`)
  return next
}

function encodeBytesBase64(bytes: Uint8Array | Uint8ClampedArray): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0
    const b = bytes[i + 1] ?? 0
    const c = bytes[i + 2] ?? 0
    const hasB = i + 1 < bytes.length
    const hasC = i + 2 < bytes.length
    const triplet = (a << 16) | (b << 8) | c

    out += BASE64_ALPHABET[(triplet >> 18) & 63]
    out += BASE64_ALPHABET[(triplet >> 12) & 63]
    out += hasB ? BASE64_ALPHABET[(triplet >> 6) & 63] : '='
    out += hasC ? BASE64_ALPHABET[triplet & 63] : '='
  }
  return out
}

function decodeBytesBase64(input: string): Uint8ClampedArray {
  const normalized = input.replace(/\s/g, '')
  if (normalized.length === 0)
    return new Uint8ClampedArray()
  if (normalized.length % 4 !== 0)
    throw new Error('Invalid base64 length')

  const bytes: number[] = []
  for (let i = 0; i < normalized.length; i += 4) {
    const c0 = normalized[i]!
    const c1 = normalized[i + 1]!
    const c2 = normalized[i + 2]!
    const c3 = normalized[i + 3]!
    const pad2 = c2 === '='
    const pad3 = c3 === '='
    const triplet = (decodeBase64Char(c0) << 18)
      | (decodeBase64Char(c1) << 12)
      | ((pad2 ? 0 : decodeBase64Char(c2)) << 6)
      | (pad3 ? 0 : decodeBase64Char(c3))

    bytes.push((triplet >> 16) & 255)
    if (!pad2)
      bytes.push((triplet >> 8) & 255)
    if (!pad3)
      bytes.push(triplet & 255)
  }
  return new Uint8ClampedArray(bytes)
}

function decodeBase64Char(char: string): number {
  const value = BASE64_ALPHABET.indexOf(char)
  if (value === -1)
    throw new Error(`Invalid base64 character: ${char}`)
  return value
}

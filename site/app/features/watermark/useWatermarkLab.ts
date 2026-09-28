import type { AnalysisSnapshot, ProtectedRegion, WatermarkAnalysisProvider } from './analysis'
import type { LoadedPreset } from './preset'
import type { PresetAssetDescriptor, PresetPlacement } from './preset-contract'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { createLocalCodexProvider, sameSnapshot } from './analysis'
import { readCustomWatermark } from './custom-asset'
import { fitPlacement, isMovableAsset } from './editing'
import { compositeWatermark, findWatermarkPlacement, suggestWatermarkStyle, tintWatermark } from './layout'
import { compositePreset, describePreset, readWatermarkPreset, serializePreset } from './preset'
import { isPatternAsset, parsePresetPlacements } from './preset-contract'
import { readWatermarkWorkfile } from './workfile'

async function decode(file: File): Promise<HTMLCanvasElement> {
  if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 25_000_000)
    throw new Error('请选择 25 MB 以内的 PNG / JPEG')
  const image = await createImageBitmap(file)
  try {
    if (image.width * image.height > 32_000_000 || Math.max(image.width, image.height) > 8192)
      throw new Error('测试入口支持最长边 8192px、总像素 3200 万以内的图片')
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    canvas.getContext('2d')!.drawImage(image, 0, 0)
    return canvas
  }
  finally {
    image.close()
  }
}

/** Own source images, snapshot identity, cancellation, and preview state for the integration lab. */
export function useWatermarkLab(cloudProvider?: WatermarkAnalysisProvider) {
  const artwork = shallowRef<HTMLCanvasElement>()
  const preset = shallowRef<LoadedPreset>()
  const placements = ref<PresetPlacement[]>([])
  const selectedPlacement = ref(-1)
  const busy = ref(false)
  const loading = ref(false)
  const past = shallowRef<PresetPlacement[][]>([])
  const future = shallowRef<PresetPlacement[][]>([])
  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)

  function resetHistory(): void {
    past.value = []
    future.value = []
    selectedPlacement.value = placements.value.length ? 0 : -1
  }

  function commitPlacements(next: PresetPlacement[]): void {
    if (JSON.stringify(next) === JSON.stringify(placements.value))
      return
    past.value = [...past.value.slice(-49), placements.value.map(p => ({ ...p }))]
    future.value = []
    placements.value = next
    selectedPlacement.value = Math.min(selectedPlacement.value, next.length - 1)
  }

  function undo(): void {
    if (!canUndo.value || busy.value || loading.value)
      return
    future.value = [...future.value, placements.value.map(p => ({ ...p }))]
    placements.value = past.value.at(-1)!
    past.value = past.value.slice(0, -1)
    selectedPlacement.value = Math.min(Math.max(0, selectedPlacement.value), placements.value.length - 1)
  }

  function redo(): void {
    if (!canRedo.value || busy.value || loading.value)
      return
    past.value = [...past.value, placements.value.map(p => ({ ...p }))]
    placements.value = future.value.at(-1)!
    future.value = future.value.slice(0, -1)
    selectedPlacement.value = Math.min(Math.max(0, selectedPlacement.value), placements.value.length - 1)
  }
  const chargedMicroPoints = ref<number>()
  const operationId = ref('')
  const watermark = shallowRef<HTMLCanvasElement>()
  const sourceUrl = ref('')
  const previewUrl = ref('')
  const regions = ref<ProtectedRegion[]>([])
  const warnings = ref<string[]>([])
  const error = ref('')
  const pairingCode = ref('')
  const openDesktop = ref(true)
  const rules = ref('避开所有角色的脸部、眼睛，以及画面中已有的签名和重要文字。')
  const provider = ref<'manual' | 'codex' | 'cloud'>('codex')
  const widthRatio = ref(0.2)
  const opacity = ref(0.65)
  const recolor = ref(false)
  const color = ref('#5d94d9')
  const threadId = ref('')
  let documentId = ''
  let revision = 0
  let loadRevision = 0
  let controller: AbortController | undefined
  let disposed = false

  const presetDescriptor = computed(() => preset.value?.assets.some(a => a.enabled) ? describePreset(preset.value) : undefined)
  const placement = computed(() => !preset.value && artwork.value && watermark.value
    ? findWatermarkPlacement(artwork.value, watermark.value, regions.value, widthRatio.value)
    : undefined)

  const canDownload = computed(() => !!artwork.value && (preset.value ? placements.value.length > 0 : !!placement.value))

  const styledWatermark = computed(() => watermark.value && recolor.value
    ? tintWatermark(watermark.value, color.value)
    : watermark.value)

  function suggestStyle(): void {
    if (!artwork.value || !placement.value)
      return
    const suggestion = suggestWatermarkStyle(artwork.value, placement.value)
    color.value = suggestion.color
    opacity.value = suggestion.opacity
    recolor.value = true
  }

  function cancel(): void {
    controller?.abort()
    controller = undefined
    busy.value = false
  }

  async function load(file: File, kind: 'artwork' | 'watermark'): Promise<void> {
    const version = ++loadRevision
    cancel()
    loading.value = true
    error.value = ''
    try {
      const image = await decode(file)
      if (disposed || version !== loadRevision)
        return
      if (kind === 'artwork') {
        revision++
        documentId = crypto.randomUUID()
        placements.value = []
        resetHistory()
        chargedMicroPoints.value = undefined
        artwork.value = image
        sourceUrl.value = image.toDataURL('image/png')
        regions.value = []
        warnings.value = []
        threadId.value = ''
      }
      else {
        preset.value = undefined
        placements.value = []
        resetHistory()
        watermark.value = image
      }
    }
    catch (reason) {
      if (!disposed && version === loadRevision)
        error.value = reason instanceof Error ? reason.message : '读取图片失败'
    }
    finally {
      if (version === loadRevision)
        loading.value = false
    }
  }

  function invalidate(): void {
    cancel()
    revision++
    placements.value = []
    resetHistory()
    regions.value = []
    warnings.value = []
    threadId.value = ''
    operationId.value = ''
    chargedMicroPoints.value = undefined
  }

  async function loadPreset(file: File): Promise<void> {
    const version = ++loadRevision
    invalidate()
    loading.value = true
    error.value = ''
    try {
      const value = await readWatermarkPreset(file)
      if (!disposed && version === loadRevision) {
        preset.value = value
        watermark.value = undefined
      }
    }
    catch (reason) {
      if (!disposed && version === loadRevision)
        error.value = reason instanceof Error ? reason.message : '预设导入失败'
    }
    finally {
      if (version === loadRevision)
        loading.value = false
    }
  }

  async function addCustomAsset(file: File, role: PresetAssetDescriptor['role'], recolorable: boolean): Promise<void> {
    if (loading.value)
      return
    const version = ++loadRevision
    cancel()
    loading.value = true
    error.value = ''
    try {
      const asset = await readCustomWatermark(file, role, recolorable, preset.value)
      if (disposed || version !== loadRevision)
        return
      revision++
      preset.value = { name: '我的水印', rules: rules.value, ...preset.value, assets: [...(preset.value?.assets ?? []), asset] }
      watermark.value = undefined
      // Appending an asset preserves the current layout and its undo history.
      loading.value = false
      if (artwork.value && placements.value.length < 12)
        addPlacement(asset.id)
    }
    catch (reason) {
      if (!disposed && version === loadRevision)
        error.value = reason instanceof Error ? reason.message : '自定义水印导入失败'
    }
    finally {
      if (version === loadRevision)
        loading.value = false
    }
  }

  async function loadWorkfile(file: File): Promise<boolean> {
    const version = ++loadRevision
    cancel()
    loading.value = true
    error.value = ''
    try {
      const input = await readWatermarkWorkfile(file)
      if (disposed || version !== loadRevision)
        return false
      revision++
      documentId = crypto.randomUUID()
      artwork.value = input.artwork
      sourceUrl.value = input.artwork.toDataURL('image/png')
      preset.value = input.preset
      watermark.value = undefined
      placements.value = input.placements
      regions.value = input.regions
      warnings.value = []
      operationId.value = ''
      chargedMicroPoints.value = undefined
      threadId.value = ''
      resetHistory()
      return true
    }
    catch (reason) {
      if (!disposed && version === loadRevision)
        error.value = reason instanceof Error ? reason.message : '工作文件打开失败'
      return false
    }
    finally {
      if (version === loadRevision)
        loading.value = false
    }
  }

  function applyWorkspaceLayout(value: PresetPlacement[]): void {
    if (!artwork.value || !presetDescriptor.value)
      return
    const valid = parsePresetPlacements(value, presetDescriptor.value, artwork.value)
    cancel()
    revision++
    commitPlacements(valid)
  }

  function toggleAsset(id: string, enabled: boolean): void {
    if (!preset.value)
      return
    invalidate()
    preset.value = { ...preset.value, assets: preset.value.assets.map(a => a.id === id ? { ...a, enabled } : a) }
  }

  function updatePlacement(index: number, patch: Partial<PresetPlacement>): void {
    if (!artwork.value || !presetDescriptor.value || busy.value || loading.value || !placements.value[index])
      return
    try {
      const current = placements.value[index]!
      const asset = presetDescriptor.value.assets.find(a => a.id === current.assetId)!
      const next = fitPlacement(current, asset, artwork.value, patch)
      commitPlacements(parsePresetPlacements(placements.value.map((p, i) => i === index ? next : p), presetDescriptor.value, artwork.value))
      error.value = ''
    }
    catch (reason) {
      error.value = reason instanceof Error ? reason.message : '水印位置无效'
    }
  }

  function removePlacement(index: number): void {
    if (!busy.value && !loading.value)
      commitPlacements(placements.value.filter((_, i) => i !== index))
  }

  function addPlacement(id: string): void {
    const image = artwork.value
    const descriptor = presetDescriptor.value
    const asset = descriptor?.assets.find(a => a.id === id)
    if (!image || !asset || !descriptor || busy.value || loading.value)
      return
    try {
      if (placements.value.length >= 12)
        throw new Error('每张画作最多放置 12 处水印')
      const pattern = isPatternAsset(asset)
      let width = asset.role === 'frame' ? 1 : pattern ? 0.15 : Math.min(0.2, image.height / image.width * asset.width / asset.height * 0.8)
      let x = 0
      let y = 0
      if (isMovableAsset(asset)) {
        const position = findWatermarkPlacement(image, asset, regions.value, width)
        if (!position)
          throw new Error('没有足够的安全空间，请先缩小或移除其他水印')
        x = position.x / image.width
        y = position.y / image.height
        width = position.width / image.width
      }
      commitPlacements(parsePresetPlacements([...placements.value, { assetId: id, x, y, width, rotation: 0, opacity: asset.role === 'micro-texture' ? 105 / 255 : 1, color: '' }], descriptor, image))
      selectedPlacement.value = placements.value.length - 1
      error.value = ''
    }
    catch (reason) {
      error.value = reason instanceof Error ? reason.message : '添加水印失败'
    }
  }

  function exportPreset(): void {
    if (preset.value)
      saveBlob(new Blob([serializePreset(preset.value)], { type: 'application/json' }), 'saier-watermarks.json')
  }

  async function analyze(): Promise<void> {
    const source = artwork.value
    if (!source || busy.value || loading.value || provider.value === 'manual')
      return
    const currentRevision = revision
    const currentRules = rules.value
    const currentPreset = presetDescriptor.value
    const selectedProvider = provider.value
    const abort = new AbortController()
    controller = abort
    busy.value = true
    error.value = ''
    try {
      const snapshotImage = document.createElement('canvas')
      let ratio = Math.min(1, 1024 / Math.max(source.width, source.height))
      let image = ''
      let blob: Blob
      do {
        snapshotImage.width = Math.max(1, Math.round(source.width * ratio))
        snapshotImage.height = Math.max(1, Math.round(source.height * ratio))
        snapshotImage.getContext('2d')!.drawImage(source, 0, 0, snapshotImage.width, snapshotImage.height)
        image = snapshotImage.toDataURL('image/png')
        blob = await (await fetch(image)).blob()
        ratio *= 0.8
      } while (blob.size > 1_048_576 && Math.max(snapshotImage.width, snapshotImage.height) > 256)
      if (blob.size > 1_048_576)
        throw new Error('分析缩略图过大')
      const hash = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer())
      const snapshot: AnalysisSnapshot = {
        documentId,
        revision: currentRevision,
        sha256: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, '0')).join(''),
        width: snapshotImage.width,
        height: snapshotImage.height,
      }
      abort.signal.throwIfAborted()
      const client = selectedProvider === 'cloud' ? cloudProvider : createLocalCodexProvider(pairingCode.value.trim())
      if (!client)
        throw new Error('云端分析尚未配置')
      const result = await client.analyze({ snapshot, image, rules: currentRules, ...(currentPreset ? { preset: currentPreset } : {}), openDesktop: openDesktop.value }, AbortSignal.any([abort.signal, AbortSignal.timeout(120_000)]))
      if (disposed || abort.signal.aborted || revision !== currentRevision || !sameSnapshot(snapshot, result.snapshot))
        return
      regions.value = result.analysis.regions
      warnings.value = result.analysis.warnings
      threadId.value = result.threadId ?? ''
      placements.value = result.analysis.placements ?? []
      resetHistory()
      chargedMicroPoints.value = result.chargedMicroPoints
      operationId.value = result.operationId ?? ''
      if (currentPreset && !placements.value.length)
        warnings.value = [...warnings.value, '本次没有可用布局；可调整规则或启用的素材后重试。']
    }
    catch (reason) {
      if (!abort.signal.aborted)
        error.value = reason instanceof Error ? reason.message : '分析失败'
    }
    finally {
      if (controller === abort) {
        controller = undefined
        busy.value = false
      }
    }
  }

  function render(): HTMLCanvasElement | undefined {
    if (artwork.value && preset.value && placements.value.length)
      return compositePreset(artwork.value, preset.value, placements.value, regions.value)
    return artwork.value && styledWatermark.value && placement.value
      ? compositeWatermark(artwork.value, styledWatermark.value, placement.value, opacity.value)
      : undefined
  }

  async function download(): Promise<void> {
    const canvas = render()
    if (!canvas)
      return
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
    if (!blob) {
      error.value = 'PNG 导出失败'
      return
    }
    saveBlob(blob, 'saier-watermarked.png')
  }

  function saveBlob(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  watch([artwork, styledWatermark, placement, opacity, preset, placements, regions], () => {
    previewUrl.value = render()?.toDataURL('image/png') ?? ''
  })
  watch([rules, provider], () => {
    // Editing analysis preferences must cancel stale responses, not discard manual work.
    if (!preset.value) {
      invalidate()
      return
    }
    cancel()
    revision++
  }, { flush: 'sync' })
  onBeforeUnmount(() => {
    disposed = true
    loadRevision++
    cancel()
  })
  return { addCustomAsset, loadWorkfile, applyWorkspaceLayout, selectedPlacement, canUndo, canRedo, undo, redo, addPlacement, preset, presetDescriptor, placements, chargedMicroPoints, operationId, canDownload, loadPreset, toggleAsset, updatePlacement, removePlacement, exportPreset, sourceUrl, previewUrl, artwork, watermark, regions, warnings, error, busy, loading, pairingCode, openDesktop, rules, provider, widthRatio, opacity, recolor, color, suggestStyle, threadId, placement, load, analyze, cancel, download }
}

<script lang="ts" setup>
import type { BrushPresetId, PainterBrushState } from '@saier/core'
import type { Painter } from 'saier'
import { computed, onBeforeUnmount, shallowRef, watch } from 'vue'
import BrushPresetPicker from './BrushPresetPicker.vue'
import PainterCheckbox from './PainterCheckbox.vue'
import PainterSlider from './PainterSlider.vue'

type BrushPresetLabelMap = Partial<Record<BrushPresetId, string>>

interface PainterOptionsBarLabels {
  pressure: string
  stabilizer: string
  size: string
  opacity: string
  spacing: string
  hardness: string
  flow: string
  smudge: string
  colorAmount: string
  dilution: string
  persistence: string
  wetEdge: string
  density: string
  paperTexture: string
  paperTextureStrength: string
  requiresTileBackend: string
  unavailablePreset: string
  addBrush: string
  removeBrush: string
  presetLabels: BrushPresetLabelMap
}

const props = defineProps<{
  painter: Painter
  labels?: Partial<PainterOptionsBarLabels>
  stabilizerStrength?: number
}>()

const emit = defineEmits<{
  'update:stabilizerStrength': [strength: number]
}>()

const DEFAULT_LABELS: PainterOptionsBarLabels = {
  pressure: 'Pressure',
  stabilizer: 'Stabilizer',
  size: 'Size',
  opacity: 'Opacity',
  spacing: 'Spacing',
  hardness: 'Hard',
  flow: 'Flow',
  smudge: 'Pickup',
  colorAmount: 'Color',
  dilution: 'Dilution',
  persistence: 'Persistence',
  wetEdge: 'Wet edge',
  density: 'Density',
  paperTexture: 'Paper',
  paperTextureStrength: 'Grain',
  requiresTileBackend: 'Requires tiled backend',
  unavailablePreset: 'Preset unavailable for the current backend',
  addBrush: 'Save current brush',
  removeBrush: 'Remove custom brush',
  presetLabels: {},
}

const text = computed(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
}))

const initialBrush = props.painter.controller.getState().brush
const presetId = shallowRef<BrushPresetId>(initialBrush.presetId)
const presets = shallowRef(initialBrush.presets)
const size = shallowRef(initialBrush.size)
const opacity = shallowRef(initialBrush.opacity)
const spacing = shallowRef(initialBrush.spacing)
const hardness = shallowRef(initialBrush.hardness)
const flow = shallowRef(initialBrush.flow)
const smudge = shallowRef(initialBrush.smudge)
const colorAmount = shallowRef(initialBrush.colorAmount)
const dilution = shallowRef(initialBrush.dilution)
const persistence = shallowRef(initialBrush.persistence)
const wetEdge = shallowRef(initialBrush.wetEdge)
const density = shallowRef(initialBrush.density)
const paperTextureId = shallowRef(initialBrush.paperTextureId)
const paperTextureStrength = shallowRef(initialBrush.paperTextureStrength)
const paperEnabled = shallowRef(Boolean(initialBrush.paperTextureId && initialBrush.paperTextureStrength > 0))
const enablePressure = shallowRef(true)
const stabilizerStrength = shallowRef(normalizeStabilizerStrength(
  props.stabilizerStrength ?? props.painter.brush.getStabilizerStrength(),
))

const activePreset = computed(() => presets.value.find(preset => preset.id === presetId.value))
const showMixingControls = computed(() => activePreset.value?.supportsMixingControls ?? activePreset.value?.engine === 'smudge')
const canRemoveActivePreset = computed(() => Boolean(activePreset.value?.custom))
const disabledPresetIds = computed(() => presets.value
  .filter(preset => preset.engineAvailable === false || (requiresSurfaceSampler(preset) && !props.painter.surface.sampleRegion))
  .map(preset => preset.id))

function requiresSurfaceSampler(preset: PainterBrushState['presets'][number]): boolean {
  return preset.requiresSurfaceSampler ?? preset.engine === 'smudge'
}

function handleBrushChange(brush: PainterBrushState) {
  presetId.value = brush.presetId
  presets.value = brush.presets
  size.value = brush.size
  opacity.value = brush.opacity
  spacing.value = brush.spacing
  hardness.value = brush.hardness
  flow.value = brush.flow
  smudge.value = brush.smudge
  colorAmount.value = brush.colorAmount
  dilution.value = brush.dilution
  persistence.value = brush.persistence
  wetEdge.value = brush.wetEdge
  density.value = brush.density
  paperTextureId.value = brush.paperTextureId
  paperTextureStrength.value = brush.paperTextureStrength
  paperEnabled.value = Boolean(brush.paperTextureId && brush.paperTextureStrength > 0)
}

props.painter.controller.on('brush:change', handleBrushChange)

onBeforeUnmount(() => {
  props.painter.controller.off('brush:change', handleBrushChange)
})

watch(presetId, (value) => {
  if (value !== props.painter.controller.getState().brush.presetId)
    props.painter.brush.setPreset(value)
})

watch(size, (value) => {
  if (value !== props.painter.controller.getState().brush.size)
    props.painter.brush.setSize(value)
})

watch(opacity, (value) => {
  if (value !== props.painter.controller.getState().brush.opacity)
    props.painter.brush.setOpacity(value)
})

watch(spacing, (value) => {
  if (value !== props.painter.controller.getState().brush.spacing)
    props.painter.brush.setSpacing(value)
})

watch(hardness, (value) => {
  if (value !== props.painter.controller.getState().brush.hardness)
    props.painter.brush.setHardness(value)
})

watch(flow, (value) => {
  if (value !== props.painter.controller.getState().brush.flow)
    props.painter.brush.setFlow(value)
})

watch(smudge, (value) => {
  if (value !== props.painter.controller.getState().brush.smudge)
    props.painter.brush.setSmudge(value)
})

watch(colorAmount, (value) => {
  if (value !== props.painter.controller.getState().brush.colorAmount)
    props.painter.brush.setColorAmount(value)
})

watch(dilution, (value) => {
  if (value !== props.painter.controller.getState().brush.dilution)
    props.painter.brush.setDilution(value)
})

watch(persistence, (value) => {
  if (value !== props.painter.controller.getState().brush.persistence)
    props.painter.brush.setPersistence(value)
})

watch(wetEdge, (value) => {
  if (value !== props.painter.controller.getState().brush.wetEdge)
    props.painter.brush.setWetEdge(value)
})

watch(density, (value) => {
  if (value !== props.painter.controller.getState().brush.density)
    props.painter.brush.setDensity(value)
})

watch(paperEnabled, (value) => {
  const brush = props.painter.controller.getState().brush
  if (value) {
    const textureId = brush.paperTextureId ?? paperTextureId.value ?? 'cold-press'
    props.painter.brush.setPaperTextureId(textureId)
    if (brush.paperTextureStrength <= 0)
      props.painter.brush.setPaperTextureStrength(0.45)
  }
  else if (brush.paperTextureStrength !== 0) {
    props.painter.brush.setPaperTextureStrength(0)
  }
})

watch(paperTextureStrength, (value) => {
  if (value !== props.painter.controller.getState().brush.paperTextureStrength)
    props.painter.brush.setPaperTextureStrength(value)
})

watch(enablePressure, (value) => {
  props.painter.brush.setPressureEnabled(value)
  props.painter.eraser.setPressureEnabled(value)
})

watch(() => props.stabilizerStrength, (value) => {
  if (typeof value !== 'number')
    return

  const next = normalizeStabilizerStrength(value)
  if (next !== stabilizerStrength.value)
    stabilizerStrength.value = next
})

watch(stabilizerStrength, (value) => {
  const next = normalizeStabilizerStrength(value)
  if (next !== value) {
    stabilizerStrength.value = next
    return
  }

  if (props.painter.brush.getStabilizerStrength() !== next)
    props.painter.brush.setStabilizerStrength(next)
  if (props.painter.eraser.getStabilizerStrength() !== next)
    props.painter.eraser.setStabilizerStrength(next)

  emit('update:stabilizerStrength', next)
})

function formatFlow(value: number): string {
  return `${Math.round(value)}/s`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatSize(value: number): string {
  return `${Math.round(value)} px`
}

function formatLevel(value: number): string {
  return String(Math.round(value))
}

function handleCreateCustomPreset(): void {
  const preset = props.painter.brush.createCustomPreset({
    name: nextCustomBrushName(),
    group: 'Custom',
    select: true,
  })
  presetId.value = preset.id
}

function handleRemoveActivePreset(): void {
  const preset = activePreset.value
  if (!preset?.custom)
    return

  props.painter.brush.removePreset(preset.id)
}

function nextCustomBrushName(): string {
  const used = new Set(presets.value.map(preset => preset.name))
  let index = 1
  let name = 'Custom Brush'
  while (used.has(name)) {
    index += 1
    name = `Custom Brush ${index}`
  }
  return name
}

function normalizeStabilizerStrength(strength: number): number {
  return Number.isFinite(strength) ? Math.max(0, Math.min(15, Math.round(strength))) : 0
}
</script>

<template>
  <div bg="dark-100" flex="~ col" gap="2" p="2" rounded-lg text-white>
    <BrushPresetPicker
      :presets="presets"
      :active-preset-id="presetId"
      :disabled-preset-ids="disabledPresetIds"
      :disabled-title="text.unavailablePreset || text.requiresTileBackend"
      :preset-labels="text.presetLabels"
      :add-title="text.addBrush"
      :remove-title="text.removeBrush"
      :can-remove-active="canRemoveActivePreset"
      @create-custom="handleCreateCustomPreset"
      @remove-active="handleRemoveActivePreset"
      @select="presetId = $event"
    />

    <div class="painter-options__params">
      <PainterCheckbox v-model="enablePressure" class="painter-options__pressure" :label="text.pressure" />
      <PainterSlider v-model="stabilizerStrength" :label="text.stabilizer" :min="0" :max="15" :step="1" :format-value="formatLevel" />
      <PainterSlider v-model="size" :label="text.size" :min="1" :max="100" :step="1" :format-value="formatSize" />
      <PainterSlider v-model="opacity" :label="text.opacity" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="spacing" :label="text.spacing" :min="0.05" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="hardness" :label="text.hardness" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="flow" :label="text.flow" :min="1" :max="80" :step="1" :format-value="formatFlow" />
    </div>

    <div v-if="showMixingControls" class="painter-options__params">
      <PainterSlider v-model="smudge" :label="text.smudge" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="persistence" :label="text.persistence" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="colorAmount" :label="text.colorAmount" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="density" :label="text.density" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="dilution" :label="text.dilution" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterSlider v-model="wetEdge" :label="text.wetEdge" :min="0" :max="1" :step="0.01" :format-value="formatPercent" />
      <PainterCheckbox v-model="paperEnabled" :label="text.paperTexture" />
      <PainterSlider
        v-model="paperTextureStrength"
        :disabled="!paperEnabled"
        :label="text.paperTextureStrength"
        :min="0"
        :max="1"
        :step="0.01"
        :format-value="formatPercent"
      />
    </div>
  </div>
</template>

<style lang="scss">
.painter-options__params {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(104px, 1fr));
  gap: 8px 10px;
  align-items: end;
}

.painter-options__pressure {
  min-height: 34px;
  align-self: end;
}
</style>

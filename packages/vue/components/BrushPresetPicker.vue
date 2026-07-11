<script lang="ts" setup>
import type { BrushPresetId, BrushPresetSummary } from '@saier/core'
import type { CSSProperties } from 'vue'
import { computed, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  addTitle?: string
  addGroupTitle?: string
  activeGroupLabel?: string
  brushGroupsLabel?: string
  brushHardness?: number
  brushOpacity?: number
  brushPresetsLabel?: string
  brushSize?: number
  canCreateCustom?: boolean
  canRemoveActive?: boolean
  customBadgeLabel?: string
  customGroups?: string[]
  disabledPresetIds?: BrushPresetId[]
  disabledPresetTitles?: Partial<Record<BrushPresetId, string>>
  disabledTitle?: string
  groupLabels?: Partial<Record<string, string>>
  presetLabels?: Partial<Record<BrushPresetId, string>>
  presets: BrushPresetSummary[]
  activePresetId: BrushPresetId
  removeGroupTitle?: string
  removeTitle?: string
}>(), {
  addTitle: 'Save current brush',
  addGroupTitle: 'New brush group',
  brushGroupsLabel: 'Brush groups',
  brushHardness: 0,
  brushOpacity: 1,
  brushPresetsLabel: 'Brush presets',
  brushSize: 10,
  canCreateCustom: true,
  canRemoveActive: false,
  customBadgeLabel: 'Custom',
  customGroups: () => [],
  disabledPresetIds: () => [],
  disabledPresetTitles: () => ({}),
  disabledTitle: '',
  groupLabels: () => ({}),
  presetLabels: () => ({}),
  removeGroupTitle: 'Remove brush group',
  removeTitle: 'Remove brush',
})

const emit = defineEmits<{
  'createCustom': [groupLabel: string]
  'createGroup': []
  'removeActive': []
  'removeGroup': [groupLabel: string]
  'select': [id: BrushPresetId]
  'selectDisabled': [id: BrushPresetId]
  'update:activeGroupLabel': [groupLabel: string]
}>()

interface PresetGroup {
  id: string
  label: string
  displayLabel: string
  presets: BrushPresetSummary[]
  custom: boolean
}

const groups = computed<PresetGroup[]>(() => {
  const byId = new Map<string, PresetGroup>()
  for (const preset of props.presets) {
    const label = preset.group ?? preset.engineLabel ?? String(preset.engine)
    const group = ensureGroup(byId, label, Boolean(preset.custom))
    group.presets.push(preset)
  }

  for (const label of props.customGroups) {
    ensureGroup(byId, label, true)
  }
  return [...byId.values()]
})

const activeGroupId = shallowRef(groupIdForPreset(props.presets.find(preset => preset.id === props.activePresetId)))
const previewPresetId = shallowRef<BrushPresetId>()

watch(() => [props.activePresetId, props.activeGroupLabel, groups.value] as const, () => {
  const requestedGroupId = props.activeGroupLabel ? groupIdForLabel(props.activeGroupLabel) : undefined
  if (requestedGroupId && groups.value.some(group => group.id === requestedGroupId)) {
    activeGroupId.value = requestedGroupId
    return
  }

  const currentActivePreset = props.presets.find(preset => preset.id === props.activePresetId)
  const activeGroup = groupIdForPreset(currentActivePreset)
  if (activeGroup)
    activeGroupId.value = activeGroup
  else if (!groups.value.some(group => group.id === activeGroupId.value))
    activeGroupId.value = groups.value[0]?.id
}, { immediate: true })

const activeGroup = computed(() => groups.value.find(group => group.id === activeGroupId.value) ?? groups.value[0])
const visiblePresets = computed(() => activeGroup.value?.presets ?? [])
const activePreset = computed(() => props.presets.find(preset => preset.id === props.activePresetId))
const canRemoveActiveGroup = computed(() => Boolean(activeGroup.value?.custom))
const previewPreset = computed(() => {
  return props.presets.find(preset => preset.id === previewPresetId.value)
    ?? activePreset.value
    ?? visiblePresets.value[0]
})
const previewLabel = computed(() => previewPreset.value ? presetLabel(previewPreset.value) : '')
const previewMetrics = computed(() => {
  const preset = previewPreset.value
  if (!preset)
    return []

  return [
    formatSize(sizeForPreset(preset)),
    formatPercent(opacityForPreset(preset)),
  ]
})
const previewDotStyle = computed<CSSProperties>(() => {
  const preset = previewPreset.value
  const diameter = diameterForSize(preset ? sizeForPreset(preset) : props.brushSize)
  const opacity = preset ? opacityForPreset(preset) : props.brushOpacity
  const hardness = preset ? hardnessForPreset(preset) : props.brushHardness

  return {
    filter: `blur(${Math.round((1 - clamp(hardness, 0, 1)) * 1.5)}px)`,
    width: `${diameter}px`,
    height: `${diameter}px`,
    opacity: String(clamp(opacity, 0.18, 1)),
  }
})
const previewStrokeStyle = computed<CSSProperties>(() => {
  const preset = previewPreset.value
  const diameter = diameterForSize(preset ? sizeForPreset(preset) : props.brushSize)
  const opacity = preset ? opacityForPreset(preset) : props.brushOpacity

  return {
    height: `${Math.max(3, Math.round(diameter / 7))}px`,
    opacity: String(clamp(opacity, 0.24, 1)),
  }
})

function presetLabel(preset: BrushPresetSummary): string {
  return props.presetLabels[preset.id] ?? preset.name
}

function isDisabled(preset: BrushPresetSummary): boolean {
  return props.disabledPresetIds.includes(preset.id)
}

function disabledTitle(preset: BrushPresetSummary): string {
  return props.disabledPresetTitles[preset.id] ?? props.disabledTitle
}

function handleSelect(preset: BrushPresetSummary): void {
  if (isDisabled(preset)) {
    emit('selectDisabled', preset.id)
    return
  }

  const groupLabel = groupLabelForPreset(preset)
  if (groupLabel)
    emit('update:activeGroupLabel', groupLabel)
  emit('select', preset.id)
}

function handleSelectGroup(group: PresetGroup): void {
  activeGroupId.value = group.id
  emit('update:activeGroupLabel', group.label)
}

function handleCreateCustom(): void {
  const label = activeGroup.value?.label ?? 'Custom'
  emit('createCustom', label)
}

function handleCreateGroup(event: MouseEvent): void {
  closeActionMenu(event)
  emit('createGroup')
}

function handleRemoveGroup(): void {
  const group = activeGroup.value
  if (group?.custom)
    emit('removeGroup', group.label)
}

function handleRemoveGroupFromMenu(event: MouseEvent): void {
  closeActionMenu(event)
  handleRemoveGroup()
}

function handleRemoveActive(event: MouseEvent): void {
  closeActionMenu(event)
  emit('removeActive')
}

function handlePreviewLeave(id: BrushPresetId): void {
  if (previewPresetId.value === id)
    previewPresetId.value = undefined
}

function closeActionMenu(event: MouseEvent): void {
  const details = (event.currentTarget as HTMLElement).closest('details')
  details?.removeAttribute('open')
}

function groupIdForPreset(preset: BrushPresetSummary | undefined): string | undefined {
  const label = groupLabelForPreset(preset)
  return label ? groupIdForLabel(label) : undefined
}

function groupLabelForPreset(preset: BrushPresetSummary | undefined): string | undefined {
  return preset?.group ?? preset?.engineLabel ?? (preset ? String(preset.engine) : undefined)
}

function groupIdForLabel(label: string): string {
  return label.trim().toLowerCase()
}

function ensureGroup(groupsById: Map<string, PresetGroup>, label: string, custom: boolean): PresetGroup {
  const normalizedLabel = label.trim() || 'Custom'
  const id = groupIdForLabel(normalizedLabel)
  const group = groupsById.get(id)
  if (group) {
    group.custom = group.custom && custom
    return group
  }

  const next = {
    id,
    label: normalizedLabel,
    displayLabel: groupDisplayLabel(normalizedLabel),
    presets: [],
    custom,
  }
  groupsById.set(id, next)
  return next
}

function groupDisplayLabel(label: string): string {
  return props.groupLabels[label] ?? label
}

function sizeForPreset(preset: BrushPresetSummary): number {
  if (preset.id === props.activePresetId)
    return props.brushSize
  return preset.size ?? props.brushSize
}

function opacityForPreset(preset: BrushPresetSummary): number {
  if (preset.id === props.activePresetId)
    return props.brushOpacity
  return preset.opacity ?? props.brushOpacity
}

function hardnessForPreset(preset: BrushPresetSummary): number {
  if (preset.id === props.activePresetId)
    return props.brushHardness
  return preset.hardness ?? props.brushHardness
}

function diameterForSize(size: number): number {
  return Math.round(clamp(size * 0.72, 10, 54))
}

function iconStyle(preset: BrushPresetSummary): CSSProperties {
  const iconSize = Math.round(clamp(sizeForPreset(preset) * 0.45 + 9, 12, 30))
  return {
    '--brush-icon-size': `${iconSize}px`,
    '--brush-icon-opacity': String(clamp(opacityForPreset(preset), 0.36, 1)),
  } as CSSProperties
}

function presetIconClass(preset: BrushPresetSummary): Record<string, boolean> {
  const id = String(preset.id)
  return {
    'brush-preset-icon--round': preset.tipId === 'round-hard' || preset.tipId === 'round-soft',
    'brush-preset-icon--pencil': preset.tipId === 'pencil-grain',
    'brush-preset-icon--marker': preset.tipId === 'marker-chisel',
    'brush-preset-icon--airbrush': preset.tipId === 'airbrush-soft',
    'brush-preset-icon--calligraphy': preset.tipId === 'calligraphy-round' || preset.engine === 'calligraphy',
    'brush-preset-icon--smudge': preset.engine === 'smudge' && id !== 'watercolor' && id !== 'blender',
    'brush-preset-icon--blender': id === 'blender',
    'brush-preset-icon--watercolor': id === 'watercolor',
    'brush-preset-icon--custom': Boolean(preset.custom),
  }
}

function formatSize(value: number): string {
  return `${Math.round(value)} px`
}

function formatPercent(value: number): string {
  return `${Math.round(clamp(value, 0, 1) * 100)}%`
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value))
    return min
  return Math.max(min, Math.min(max, value))
}
</script>

<template>
  <div class="brush-preset-picker">
    <div class="brush-preset-header">
      <div class="brush-preset-groups" role="tablist" :aria-label="props.brushGroupsLabel">
        <button
          v-for="group in groups"
          :key="group.id"
          type="button"
          class="brush-preset-group"
          :class="{ 'is-active': group.id === activeGroup?.id }"
          :aria-selected="group.id === activeGroup?.id"
          role="tab"
          @click="handleSelectGroup(group)"
        >
          <span class="brush-preset-group__label">{{ group.displayLabel }}</span>
          <span class="brush-preset-group__count">{{ group.presets.length }}</span>
        </button>
      </div>

      <div class="brush-preset-actions">
        <button
          type="button"
          class="brush-preset-action brush-preset-action--primary"
          :disabled="!props.canCreateCustom"
          :title="props.addTitle"
          :aria-label="props.addTitle"
          @click="handleCreateCustom"
        >
          <span class="i-ph-plus" aria-hidden="true" />
        </button>

        <details class="brush-preset-actions__menu">
          <summary
            class="brush-preset-action brush-preset-action--menu"
            :title="props.addGroupTitle"
            :aria-label="props.addGroupTitle"
          >
            <span class="i-ph-dots-three-vertical" aria-hidden="true" />
          </summary>

          <div class="brush-preset-menu" role="menu">
            <button
              type="button"
              class="brush-preset-menu__item"
              :title="props.addGroupTitle"
              :aria-label="props.addGroupTitle"
              role="menuitem"
              @click="handleCreateGroup"
            >
              <span class="i-ph-folder-plus" aria-hidden="true" />
              <span class="brush-preset-menu__label">{{ props.addGroupTitle }}</span>
            </button>
            <button
              type="button"
              class="brush-preset-menu__item"
              :disabled="!canRemoveActiveGroup"
              :title="props.removeGroupTitle"
              :aria-label="props.removeGroupTitle"
              role="menuitem"
              @click="handleRemoveGroupFromMenu"
            >
              <span class="i-ph-folder-minus" aria-hidden="true" />
              <span class="brush-preset-menu__label">{{ props.removeGroupTitle }}</span>
            </button>
            <button
              type="button"
              class="brush-preset-menu__item"
              :disabled="!props.canRemoveActive || !activePreset?.custom"
              :title="props.removeTitle"
              :aria-label="props.removeTitle"
              role="menuitem"
              @click="handleRemoveActive"
            >
              <span class="i-ph-trash" aria-hidden="true" />
              <span class="brush-preset-menu__label">{{ props.removeTitle }}</span>
            </button>
          </div>
        </details>
      </div>
    </div>

    <div class="brush-preset-body">
      <div class="brush-preset-list brush-preset-grid" role="listbox" :aria-label="props.brushPresetsLabel">
        <button
          v-for="preset in visiblePresets"
          :key="preset.id"
          type="button"
          class="brush-preset-card"
          :class="{ 'is-active': preset.id === props.activePresetId, 'is-disabled': isDisabled(preset) }"
          :aria-disabled="isDisabled(preset)"
          :aria-label="presetLabel(preset)"
          :aria-selected="preset.id === props.activePresetId"
          role="option"
          :title="isDisabled(preset) ? disabledTitle(preset) : presetLabel(preset)"
          @blur="handlePreviewLeave(preset.id)"
          @click="handleSelect(preset)"
          @focus="previewPresetId = preset.id"
          @pointerenter="previewPresetId = preset.id"
          @pointerleave="handlePreviewLeave(preset.id)"
        >
          <span
            class="brush-preset-card__icon"
            :class="presetIconClass(preset)"
            :style="iconStyle(preset)"
            aria-hidden="true"
          />
          <span class="brush-preset-card__name">{{ presetLabel(preset) }}</span>
          <span class="brush-preset-card__meta">{{ formatSize(sizeForPreset(preset)) }}</span>
          <span v-if="preset.custom" class="brush-preset-card__badge">{{ props.customBadgeLabel }}</span>
        </button>
      </div>

      <aside v-if="previewPreset" class="brush-preset-preview" :aria-label="previewLabel">
        <div class="brush-preset-preview__surface" aria-hidden="true">
          <span class="brush-preset-preview__dot" :style="previewDotStyle" />
          <span class="brush-preset-preview__stroke" :style="previewStrokeStyle" />
        </div>
        <div class="brush-preset-preview__text">
          <span class="brush-preset-preview__name">{{ previewLabel }}</span>
          <span class="brush-preset-preview__metrics">
            <span
              v-for="metric in previewMetrics"
              :key="metric"
              class="brush-preset-preview__metric"
            >
              {{ metric }}
            </span>
          </span>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.brush-preset-picker {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 4px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: linear-gradient(180deg, rgb(255 255 255 / 5%), transparent 42%), rgb(0 0 0 / 20%);
}

.brush-preset-header {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 3px;
  align-items: end;
}

.brush-preset-groups {
  position: relative;
  display: flex;
  min-width: 0;
  gap: 0;
  overflow-x: auto;
  overflow-y: hidden;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  mask-image: linear-gradient(90deg, transparent 0, black 9px, black calc(100% - 12px), transparent 100%);
  padding: 0 10px 0 7px;
  scrollbar-width: none;
}

.brush-preset-groups::-webkit-scrollbar {
  display: none;
}

.brush-preset-group {
  position: relative;
  display: grid;
  height: 27px;
  min-width: 62px;
  max-width: 104px;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 4px;
  margin-bottom: -1px;
  border: 1px solid transparent;
  border-bottom-color: rgb(255 255 255 / 10%);
  border-radius: 5px 5px 0 0;
  background: transparent;
  color: rgb(255 255 255 / 62%);
  font-size: 11px;
  line-height: 1;
  padding: 0 7px;
  text-align: left;
}

.brush-preset-group.is-active {
  border-color: rgb(96 165 250 / 40%);
  border-bottom-color: rgb(18 18 22 / 95%);
  background: linear-gradient(180deg, rgb(96 165 250 / 16%), rgb(255 255 255 / 5%)), rgb(18 18 22 / 95%);
  color: white;
}

.brush-preset-group:focus-visible,
.brush-preset-action:focus-visible,
.brush-preset-menu__item:focus-visible,
.brush-preset-card:focus-visible {
  outline: 2px solid rgb(147 197 253 / 78%);
  outline-offset: 1px;
}

.brush-preset-group__label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brush-preset-group__count {
  color: rgb(255 255 255 / 42%);
  font-variant-numeric: tabular-nums;
}

.brush-preset-actions {
  position: relative;
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 3px;
  padding-left: 5px;
}

.brush-preset-actions::before {
  display: block;
  width: 1px;
  height: 18px;
  margin-right: 3px;
  background: rgb(255 255 255 / 10%);
  content: '';
}

.brush-preset-action {
  display: grid;
  width: 27px;
  height: 26px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 4px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 78%);
  font-size: 14px;
  line-height: 1;
}

.brush-preset-action:hover {
  background: rgb(255 255 255 / 10%);
}

.brush-preset-action--primary {
  border-color: rgb(96 165 250 / 28%);
  background: rgb(96 165 250 / 13%);
  color: white;
}

.brush-preset-action:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.brush-preset-actions__menu {
  position: relative;
}

.brush-preset-action--menu {
  cursor: pointer;
  list-style: none;
}

.brush-preset-action--menu::-webkit-details-marker {
  display: none;
}

.brush-preset-actions__menu[open] .brush-preset-action--menu {
  border-color: rgb(255 255 255 / 18%);
  background: rgb(255 255 255 / 11%);
  color: white;
}

.brush-preset-menu {
  position: absolute;
  z-index: 20;
  top: 31px;
  right: 0;
  display: grid;
  width: 178px;
  gap: 1px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 5px;
  background: rgb(18 18 22 / 96%);
  box-shadow: 0 12px 32px rgb(0 0 0 / 34%);
  padding: 4px;
}

.brush-preset-menu__item {
  display: grid;
  width: 100%;
  min-width: 0;
  height: 27px;
  grid-template-columns: 16px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgb(255 255 255 / 76%);
  font-size: 11px;
  line-height: 1;
  padding: 0 7px;
  text-align: left;
}

.brush-preset-menu__item:hover {
  background: rgb(255 255 255 / 8%);
  color: white;
}

.brush-preset-menu__item:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

.brush-preset-menu__label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brush-preset-body {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr);
  gap: 6px;
  align-items: stretch;
}

.brush-preset-grid {
  display: grid;
  min-width: 0;
  max-height: 200px;
  grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
  grid-auto-rows: 66px;
  align-content: start;
  gap: 4px;
  overflow-y: auto;
  padding: 0 1px 1px 0;
  scrollbar-width: thin;
}

.brush-preset-card {
  position: relative;
  display: grid;
  min-width: 0;
  height: 66px;
  grid-template-areas:
    'icon'
    'name'
    'meta';
  grid-template-columns: minmax(0, 1fr);
  grid-template-rows: 30px 13px 11px;
  align-items: center;
  justify-items: center;
  gap: 1px;
  border: 1px solid rgb(255 255 255 / 7%);
  border-radius: 5px;
  background: rgb(255 255 255 / 4%);
  color: rgb(255 255 255 / 82%);
  font-size: 11px;
  line-height: 1.05;
  padding: 5px 4px 6px;
  text-align: center;
}

.brush-preset-card.is-active {
  border-color: rgb(96 165 250 / 62%);
  background: linear-gradient(180deg, rgb(96 165 250 / 20%), rgb(96 165 250 / 8%)), rgb(255 255 255 / 4%);
  color: white;
  box-shadow: inset 0 0 0 1px rgb(96 165 250 / 25%);
}

.brush-preset-card:hover {
  border-color: rgb(255 255 255 / 20%);
  background: rgb(255 255 255 / 8%);
}

.brush-preset-card.is-disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.brush-preset-card.is-disabled:hover {
  border-color: rgb(255 255 255 / 7%);
  background: rgb(255 255 255 / 4%);
}

.brush-preset-card__icon {
  position: relative;
  display: block;
  width: 40px;
  height: 30px;
  grid-area: icon;
  color: currentColor;
  opacity: var(--brush-icon-opacity);
}

.brush-preset-card__icon::before,
.brush-preset-card__icon::after {
  position: absolute;
  content: '';
}

.brush-preset-card__icon::before {
  top: 50%;
  left: 50%;
  width: calc(var(--brush-icon-size) + 15px);
  height: clamp(3px, calc(var(--brush-icon-size) / 5), 8px);
  border-radius: 999px;
  background: currentColor;
  transform: translate(-50%, -50%);
}

.brush-preset-icon--round::before {
  width: var(--brush-icon-size);
  height: var(--brush-icon-size);
}

.brush-preset-icon--pencil::before {
  width: calc(var(--brush-icon-size) + 16px);
  height: 3px;
  opacity: 0.68;
  transform: translate(-50%, -50%) rotate(-7deg);
}

.brush-preset-icon--pencil::after {
  top: 9px;
  left: 9px;
  width: 3px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
  box-shadow:
    9px 5px 0 -1px currentColor,
    18px -2px 0 -1px currentColor,
    25px 4px 0 -1px currentColor;
  opacity: 0.48;
}

.brush-preset-icon--marker::before {
  width: calc(var(--brush-icon-size) + 16px);
  height: clamp(7px, calc(var(--brush-icon-size) / 3), 11px);
  border-radius: 2px;
  transform: translate(-50%, -50%) rotate(-13deg);
}

.brush-preset-icon--airbrush::before {
  width: var(--brush-icon-size);
  height: var(--brush-icon-size);
  background: radial-gradient(circle, currentColor 0 24%, transparent 68%);
  filter: blur(2px);
}

.brush-preset-icon--calligraphy::before {
  width: calc(var(--brush-icon-size) + 10px);
  height: clamp(9px, calc(var(--brush-icon-size) / 2), 16px);
  border-radius: 999px 42% 999px 42%;
  transform: translate(-50%, -50%) rotate(-28deg);
}

.brush-preset-icon--calligraphy::after {
  right: 6px;
  bottom: 4px;
  width: 5px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.44;
}

.brush-preset-icon--smudge::before,
.brush-preset-icon--blender::before {
  width: var(--brush-icon-size);
  height: var(--brush-icon-size);
  background: radial-gradient(circle, currentColor 0 48%, transparent 72%);
  opacity: 0.56;
}

.brush-preset-icon--smudge::after,
.brush-preset-icon--blender::after {
  right: 4px;
  bottom: 5px;
  width: calc(var(--brush-icon-size) + 8px);
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.36;
  transform: rotate(-18deg);
}

.brush-preset-icon--blender {
  color: rgb(167 243 208);
}

.brush-preset-icon--watercolor {
  color: rgb(125 211 252);
}

.brush-preset-icon--watercolor::before {
  width: calc(var(--brush-icon-size) + 8px);
  height: var(--brush-icon-size);
  border-radius: 46% 54% 58% 42%;
  background: radial-gradient(circle at 34% 32%, rgb(255 255 255 / 45%), transparent 16%), currentColor;
  opacity: 0.58;
}

.brush-preset-icon--watercolor::after {
  right: 7px;
  bottom: 5px;
  width: 14px;
  height: 5px;
  border-radius: 999px;
  background: currentColor;
  opacity: 0.32;
  transform: rotate(-14deg);
}

.brush-preset-icon--custom::after {
  inset: 4px 3px;
  border: 1px dashed rgb(255 255 255 / 54%);
  border-radius: 5px;
}

.brush-preset-card__name {
  grid-area: name;
  overflow: hidden;
  width: 100%;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brush-preset-card__meta {
  color: rgb(255 255 255 / 42%);
  font-size: 10px;
  grid-area: meta;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.brush-preset-card__badge {
  position: absolute;
  top: 3px;
  right: 3px;
  max-width: calc(100% - 6px);
  overflow: hidden;
  border-radius: 3px;
  background: rgb(0 0 0 / 36%);
  color: rgb(255 255 255 / 62%);
  font-size: 7px;
  line-height: 1;
  padding: 2px 3px;
  text-overflow: ellipsis;
  text-transform: uppercase;
  white-space: nowrap;
}

.brush-preset-preview {
  display: grid;
  min-width: 0;
  grid-template-columns: 70px minmax(0, 1fr);
  gap: 7px;
  align-items: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 5px;
  background:
    linear-gradient(90deg, rgb(255 255 255 / 5%) 1px, transparent 1px) 0 0 / 12px 12px,
    linear-gradient(0deg, rgb(255 255 255 / 5%) 1px, transparent 1px) 0 0 / 12px 12px,
    rgb(0 0 0 / 18%);
  padding: 6px;
}

.brush-preset-preview__surface {
  position: relative;
  display: grid;
  min-height: 52px;
  place-items: center;
  overflow: hidden;
}

.brush-preset-preview__dot {
  display: block;
  border: 1px solid rgb(255 255 255 / 52%);
  border-radius: 999px;
  background: rgb(255 255 255 / 78%);
  box-shadow:
    0 0 0 1px rgb(0 0 0 / 24%),
    0 6px 18px rgb(0 0 0 / 30%);
}

.brush-preset-preview__stroke {
  position: absolute;
  right: 7px;
  bottom: 8px;
  left: 7px;
  border-radius: 999px;
  background: linear-gradient(90deg, transparent, rgb(255 255 255 / 78%), transparent);
}

.brush-preset-preview__text {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.brush-preset-preview__name {
  overflow: hidden;
  color: white;
  font-size: 12px;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brush-preset-preview__metrics {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 3px;
}

.brush-preset-preview__metric {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  border-radius: 3px;
  background: rgb(255 255 255 / 7%);
  color: rgb(255 255 255 / 58%);
  font-size: 10px;
  line-height: 1;
  padding: 3px 4px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .brush-preset-grid {
    max-height: 200px;
  }

  .brush-preset-preview {
    grid-template-columns: 64px minmax(0, 1fr);
  }

  .brush-preset-preview__surface {
    min-height: 50px;
  }
}
</style>

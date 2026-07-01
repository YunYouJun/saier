<script lang="ts" setup>
import type { BrushPresetId, BrushPresetSummary } from '@saier/core'
import { computed, shallowRef, watch } from 'vue'

const props = withDefaults(defineProps<{
  addTitle?: string
  canCreateCustom?: boolean
  canRemoveActive?: boolean
  presetLabels?: Partial<Record<BrushPresetId, string>>
  presets: BrushPresetSummary[]
  activePresetId: BrushPresetId
  disabledPresetIds?: BrushPresetId[]
  disabledTitle?: string
  removeTitle?: string
}>(), {
  addTitle: 'Save current brush',
  canCreateCustom: true,
  canRemoveActive: false,
  disabledPresetIds: () => [],
  disabledTitle: '',
  presetLabels: () => ({}),
  removeTitle: 'Remove brush',
})

const emit = defineEmits<{
  createCustom: []
  removeActive: []
  select: [id: BrushPresetId]
}>()

interface PresetGroup {
  id: string
  label: string
  presets: BrushPresetSummary[]
}

const groups = computed<PresetGroup[]>(() => {
  const byId = new Map<string, PresetGroup>()
  for (const preset of props.presets) {
    const label = preset.group ?? preset.engineLabel ?? String(preset.engine)
    const id = label.toLowerCase()
    const group = byId.get(id) ?? { id, label, presets: [] }
    group.presets.push(preset)
    byId.set(id, group)
  }
  return [...byId.values()]
})

const activeGroupId = shallowRef(groupIdForPreset(props.presets.find(preset => preset.id === props.activePresetId)))

watch(() => [props.activePresetId, groups.value] as const, () => {
  const activePreset = props.presets.find(preset => preset.id === props.activePresetId)
  const activeGroup = groupIdForPreset(activePreset)
  if (activeGroup)
    activeGroupId.value = activeGroup
  else if (!groups.value.some(group => group.id === activeGroupId.value))
    activeGroupId.value = groups.value[0]?.id
}, { immediate: true })

const activeGroup = computed(() => groups.value.find(group => group.id === activeGroupId.value) ?? groups.value[0])
const visiblePresets = computed(() => activeGroup.value?.presets ?? [])
const activePreset = computed(() => props.presets.find(preset => preset.id === props.activePresetId))

function presetLabel(preset: BrushPresetSummary): string {
  return props.presetLabels[preset.id] ?? preset.name
}

function isDisabled(preset: BrushPresetSummary): boolean {
  return props.disabledPresetIds.includes(preset.id)
}

function handleSelect(preset: BrushPresetSummary): void {
  if (!isDisabled(preset))
    emit('select', preset.id)
}

function groupIdForPreset(preset: BrushPresetSummary | undefined): string | undefined {
  const label = preset?.group ?? preset?.engineLabel ?? (preset ? String(preset.engine) : undefined)
  return label?.toLowerCase()
}
</script>

<template>
  <div class="brush-preset-picker">
    <div class="brush-preset-groups" role="tablist" aria-label="Brush groups">
      <button
        v-for="group in groups"
        :key="group.id"
        type="button"
        class="brush-preset-group"
        :class="{ 'is-active': group.id === activeGroup?.id }"
        :aria-selected="group.id === activeGroup?.id"
        role="tab"
        @click="activeGroupId = group.id"
      >
        <span class="brush-preset-group__label">{{ group.label }}</span>
        <span class="brush-preset-group__count">{{ group.presets.length }}</span>
      </button>
    </div>

    <div class="brush-preset-list" role="listbox" aria-label="Brush presets">
      <button
        v-for="preset in visiblePresets"
        :key="preset.id"
        type="button"
        class="brush-preset-button"
        :class="{ 'is-active': preset.id === props.activePresetId }"
        :aria-label="presetLabel(preset)"
        :aria-selected="preset.id === props.activePresetId"
        :disabled="isDisabled(preset)"
        role="option"
        :title="isDisabled(preset) ? props.disabledTitle : presetLabel(preset)"
        @click="handleSelect(preset)"
      >
        <span class="brush-preset-swatch" :data-tip="preset.tipId" />
        <span class="brush-preset-name">{{ presetLabel(preset) }}</span>
        <span v-if="preset.custom" class="brush-preset-badge">Custom</span>
      </button>
    </div>

    <div class="brush-preset-actions">
      <button
        type="button"
        class="brush-preset-action"
        :disabled="!props.canCreateCustom"
        :title="props.addTitle"
        :aria-label="props.addTitle"
        @click="emit('createCustom')"
      >
        <span class="i-ph-plus" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="brush-preset-action"
        :disabled="!props.canRemoveActive || !activePreset?.custom"
        :title="props.removeTitle"
        :aria-label="props.removeTitle"
        @click="emit('removeActive')"
      >
        <span class="i-ph-trash" aria-hidden="true" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.brush-preset-picker {
  display: grid;
  min-width: 0;
  grid-template-columns: minmax(88px, 112px) minmax(0, 1fr) auto;
  gap: 4px;
  align-items: stretch;
  padding: 3px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(0 0 0 / 18%);
}

.brush-preset-groups {
  display: flex;
  min-width: 0;
  max-height: 142px;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  padding-right: 2px;
  scrollbar-width: thin;
}

.brush-preset-group {
  display: grid;
  height: 26px;
  min-width: 0;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgb(255 255 255 / 62%);
  font-size: 11px;
  line-height: 1;
  padding: 0 6px;
  text-align: left;
}

.brush-preset-group.is-active {
  background: rgb(96 165 250 / 16%);
  color: white;
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

.brush-preset-list {
  display: grid;
  min-width: 0;
  max-height: 142px;
  gap: 2px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.brush-preset-button {
  display: grid;
  min-width: 0;
  height: 28px;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: rgb(255 255 255 / 82%);
  font-size: 12px;
  line-height: 1.1;
  padding: 0 7px;
  text-align: left;
}

.brush-preset-button.is-active {
  background: rgb(96 165 250 / 17%);
  color: white;
  box-shadow: inset 2px 0 0 rgb(96 165 250);
}

.brush-preset-button:hover {
  background: rgb(255 255 255 / 10%);
}

.brush-preset-button:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.brush-preset-badge {
  color: rgb(255 255 255 / 42%);
  font-size: 10px;
  text-transform: uppercase;
}

.brush-preset-swatch {
  position: relative;
  width: 34px;
  height: 16px;
  flex: 0 0 auto;
}

.brush-preset-swatch::before {
  position: absolute;
  top: 7px;
  left: 2px;
  width: 30px;
  height: 3px;
  border-radius: 999px;
  background: currentColor;
  content: '';
}

.brush-preset-swatch[data-tip='pencil-grain']::before {
  opacity: 0.58;
  box-shadow:
    4px -3px 0 -1px currentColor,
    13px 2px 0 -1px currentColor;
}

.brush-preset-swatch[data-tip='marker-chisel']::before {
  height: 7px;
  border-radius: 2px;
  transform: rotate(-12deg);
}

.brush-preset-swatch[data-tip='airbrush-soft']::before {
  top: 2px;
  left: 9px;
  width: 16px;
  height: 16px;
  opacity: 0.55;
  filter: blur(2px);
}

.brush-preset-name {
  overflow: hidden;
  min-width: 0;
  max-width: 100%;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brush-preset-actions {
  display: grid;
  grid-auto-rows: 28px;
  gap: 3px;
}

.brush-preset-action {
  display: grid;
  width: 28px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 4px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 78%);
  font-size: 15px;
}

.brush-preset-action:hover {
  background: rgb(255 255 255 / 10%);
}

.brush-preset-action:disabled {
  cursor: not-allowed;
  opacity: 0.38;
}

@media (max-width: 640px) {
  .brush-preset-picker {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .brush-preset-groups {
    grid-column: 1 / -1;
    max-height: none;
    flex-direction: row;
    overflow-x: auto;
    overflow-y: hidden;
  }

  .brush-preset-group {
    width: 94px;
    flex: 0 0 auto;
  }
}
</style>

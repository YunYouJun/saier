<script lang="ts" setup>
import type { BlendMode, LayerNodeMoveTarget, PainterLayerNodeState, PainterLayerState } from '@saier/core'
import { computed } from 'vue'
import LayerTreeRow from './LayerTreeRow.vue'

type PainterLayerPaintTarget = 'content' | 'mask'

interface PainterLayerPanelLabels {
  title: string
  addLayer: string
  addGroup: string
  hideLayer: string
  showLayer: string
  moveUp: string
  moveDown: string
  moveIn: string
  moveOut: string
  removeLayer: string
  ungroup: string
  collapseGroup: string
  expandGroup: string
  lockAlpha: string
  clip: string
  addMask: string
  removeMask: string
  enableMask: string
  disableMask: string
  paintContent: string
  paintMask: string
  blendModes: Record<BlendMode, string>
}

interface DisplayNode {
  node: PainterLayerNodeState
  index: number
  lowerGroupId: string | null
  lowerGroupChildCount: number
}

const props = defineProps<{
  activeLayerId: string | null
  layers: PainterLayerState[]
  layerTree?: PainterLayerNodeState[]
  thumbnails?: Record<string, string>
  maskThumbnails?: Record<string, string>
  paintTarget?: PainterLayerPaintTarget
  labels?: Partial<Omit<PainterLayerPanelLabels, 'blendModes'>> & {
    blendModes?: Partial<Record<BlendMode, string>>
  }
}>()

const emit = defineEmits<{
  'add': [options?: { parentId?: string | null, index?: number }]
  'addGroup': [options?: { parentId?: string | null, index?: number }]
  'remove': [id: string]
  'select': [id: string]
  'move': [id: string, toIndex: number]
  'moveNode': [id: string, target: LayerNodeMoveTarget]
  'ungroup': [id: string]
  'update:visible': [id: string, visible: boolean]
  'update:opacity': [id: string, opacity: number]
  'update:blendMode': [id: string, blendMode: BlendMode]
  'update:label': [id: string, label: string]
  'update:lockAlpha': [id: string, lockAlpha: boolean]
  'update:clip': [id: string, clip: boolean]
  'addMask': [id: string]
  'removeMask': [id: string]
  'update:maskEnabled': [id: string, enabled: boolean]
  'update:paintTarget': [target: PainterLayerPaintTarget]
  'update:groupCollapsed': [id: string, collapsed: boolean]
}>()

const DEFAULT_LABELS: PainterLayerPanelLabels = {
  title: 'Layers',
  addLayer: 'Add layer',
  addGroup: 'Add group',
  hideLayer: 'Hide layer',
  showLayer: 'Show layer',
  moveUp: 'Move up',
  moveDown: 'Move down',
  moveIn: 'Move into group below',
  moveOut: 'Move out of group',
  removeLayer: 'Remove layer',
  ungroup: 'Ungroup',
  collapseGroup: 'Collapse group',
  expandGroup: 'Expand group',
  lockAlpha: 'Lock transparency',
  clip: 'Clip to layer below',
  addMask: 'Add layer mask',
  removeMask: 'Remove layer mask',
  enableMask: 'Enable layer mask',
  disableMask: 'Disable layer mask',
  paintContent: 'Paint layer content',
  paintMask: 'Paint layer mask',
  blendModes: {
    normal: 'Normal',
    multiply: 'Multiply',
    screen: 'Screen',
    overlay: 'Overlay',
    darken: 'Darken',
    lighten: 'Lighten',
    add: 'Add',
  },
}

const text = computed<PainterLayerPanelLabels>(() => ({
  ...DEFAULT_LABELS,
  ...props.labels,
  blendModes: {
    ...DEFAULT_LABELS.blendModes,
    ...props.labels?.blendModes,
  },
}))

const tree = computed<PainterLayerNodeState[]>(() =>
  props.layerTree?.length
    ? props.layerTree
    : props.layers,
)

const displayNodes = computed(() => displayEntries(tree.value))
const currentPaintTarget = computed(() => props.paintTarget ?? 'content')

const rasterLayerCount = computed(() =>
  tree.value.reduce((sum, node) => sum + countRasterLayers(node), 0),
)

function displayEntries(nodes: readonly PainterLayerNodeState[]): DisplayNode[] {
  return nodes
    .map((node, index) => {
      const lower = nodes[index - 1]
      return {
        node,
        index,
        lowerGroupId: lower?.type === 'group' ? lower.id : null,
        lowerGroupChildCount: lower?.type === 'group' ? lower.children.length : 0,
      }
    })
    .reverse()
}

function countRasterLayers(node: PainterLayerNodeState): number {
  if (node.type === 'raster')
    return 1
  return node.children.reduce((sum, child) => sum + countRasterLayers(child), 0)
}

function moveNode(id: string, target: LayerNodeMoveTarget): void {
  emit('moveNode', id, target)
}

function dragIdFromEvent(event: DragEvent): string | undefined {
  return event.dataTransfer?.getData('application/x-saier-layer-node') || undefined
}

function dropOnRootTop(event: DragEvent): void {
  const id = dragIdFromEvent(event)
  if (!id)
    return
  emit('moveNode', id, { parentId: null, index: tree.value.length })
}
</script>

<template>
  <section class="painter-layer-panel">
    <header class="painter-layer-panel__header">
      <span class="painter-layer-panel__title">{{ text.title }}</span>
      <div class="painter-layer-panel__header-actions">
        <button type="button" class="painter-layer-panel__icon" :title="text.addGroup" @click="emit('addGroup')">
          <span class="i-ph-folder-plus" />
        </button>
        <button type="button" class="painter-layer-panel__icon" :title="text.addLayer" @click="emit('add')">
          <span class="i-ph-plus" />
        </button>
      </div>
    </header>

    <div class="painter-layer-panel__list">
      <LayerTreeRow
        v-for="{ node, index, lowerGroupId, lowerGroupChildCount } in displayNodes"
        :key="node.id"
        :node="node"
        :index="index"
        :sibling-count="tree.length"
        :parent-id="null"
        :parent-index="0"
        :grand-parent-id="null"
        :depth="0"
        :lower-group-id="lowerGroupId"
        :lower-group-child-count="lowerGroupChildCount"
        :active-layer-id="activeLayerId"
        :thumbnails="thumbnails"
        :mask-thumbnails="maskThumbnails"
        :paint-target="currentPaintTarget"
        :labels="text"
        :raster-layer-count="rasterLayerCount"
        @add="emit('add', $event)"
        @add-group="emit('addGroup', $event)"
        @remove="emit('remove', $event)"
        @select="emit('select', $event)"
        @move-node="(id, target) => moveNode(id, target)"
        @ungroup="emit('ungroup', $event)"
        @update:visible="(id, visible) => emit('update:visible', id, visible)"
        @update:opacity="(id, opacity) => emit('update:opacity', id, opacity)"
        @update:blend-mode="(id, blendMode) => emit('update:blendMode', id, blendMode)"
        @update:label="(id, label) => emit('update:label', id, label)"
        @update:lock-alpha="(id, lockAlpha) => emit('update:lockAlpha', id, lockAlpha)"
        @update:clip="(id, clip) => emit('update:clip', id, clip)"
        @add-mask="emit('addMask', $event)"
        @remove-mask="emit('removeMask', $event)"
        @update:mask-enabled="(id, enabled) => emit('update:maskEnabled', id, enabled)"
        @update:paint-target="emit('update:paintTarget', $event)"
        @update:group-collapsed="(id, collapsed) => emit('update:groupCollapsed', id, collapsed)"
      />

      <div
        class="painter-layer-panel__root-drop"
        @dragover.prevent
        @drop.prevent="dropOnRootTop"
      />
    </div>
  </section>
</template>

<style scoped>
.painter-layer-panel {
  width: min(336px, calc(100vw - 16px));
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 8px;
  background: var(--saier-color-panel, rgb(18 18 22 / 92%));
  color: var(--saier-color-text, white);
  font-size: 12px;
}

.painter-layer-panel__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px;
  border-bottom: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
}

.painter-layer-panel__title {
  font-weight: 600;
}

.painter-layer-panel__header-actions {
  display: flex;
  gap: 4px;
}

.painter-layer-panel__icon {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--saier-color-border, rgb(255 255 255 / 12%));
  border-radius: 6px;
  background: var(--saier-color-surface, rgb(255 255 255 / 6%));
  color: var(--saier-color-text, white);
}

.painter-layer-panel__list {
  display: grid;
  max-height: min(480px, calc(100vh - 160px));
  overflow: auto;
  padding: 6px;
  gap: 6px;
}

.painter-layer-panel__root-drop {
  height: 10px;
  border-radius: 6px;
}

.painter-layer-panel__root-drop:hover {
  background: var(--saier-color-accent-strong, rgb(120 170 255 / 22%));
}
</style>

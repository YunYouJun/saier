<script lang="ts" setup>
import type { BlendMode, LayerNodeMoveTarget, PainterLayerNodeState } from '@saier/core'
import { computed } from 'vue'

interface LayerTreeRowLabels {
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
  blendModes: Record<BlendMode, string>
}

interface DisplayNode {
  node: PainterLayerNodeState
  index: number
  lowerGroupId: string | null
  lowerGroupChildCount: number
}

defineOptions({
  name: 'LayerTreeRow',
})

const props = defineProps<{
  node: PainterLayerNodeState
  index: number
  siblingCount: number
  parentId: string | null
  parentIndex: number
  grandParentId: string | null
  depth: number
  lowerGroupId: string | null
  lowerGroupChildCount: number
  activeLayerId: string | null
  thumbnails?: Record<string, string>
  labels: LayerTreeRowLabels
  rasterLayerCount: number
}>()

const emit = defineEmits<{
  'add': [options?: { parentId?: string | null, index?: number }]
  'addGroup': [options?: { parentId?: string | null, index?: number }]
  'remove': [id: string]
  'select': [id: string]
  'moveNode': [id: string, target: LayerNodeMoveTarget]
  'ungroup': [id: string]
  'update:visible': [id: string, visible: boolean]
  'update:opacity': [id: string, opacity: number]
  'update:blendMode': [id: string, blendMode: BlendMode]
  'update:label': [id: string, label: string]
  'update:lockAlpha': [id: string, lockAlpha: boolean]
  'update:clip': [id: string, clip: boolean]
  'update:groupCollapsed': [id: string, collapsed: boolean]
}>()

const isGroup = computed(() => props.node.type === 'group')
const isRaster = computed(() => props.node.type === 'raster')
const rowStyle = computed(() => ({
  paddingLeft: `${Math.min(props.depth * 14 + 6, 72)}px`,
}))

const blendModes = computed(() =>
  (Object.keys(props.labels.blendModes) as BlendMode[]).map(value => ({
    label: props.labels.blendModes[value],
    value,
  })),
)

const childEntries = computed<DisplayNode[]>(() => {
  if (props.node.type !== 'group')
    return []
  const children = props.node.children
  return children
    .map((node, index) => {
      const lower = children[index - 1]
      return {
        node,
        index,
        lowerGroupId: lower?.type === 'group' ? lower.id : null,
        lowerGroupChildCount: lower?.type === 'group' ? lower.children.length : 0,
      }
    })
    .reverse()
})

const ownRasterLayerCount = computed(() => countRasterLayers(props.node))
const canRemove = computed(() => props.rasterLayerCount - ownRasterLayerCount.value >= 1)
const hasActiveChild = computed(() => props.node.type === 'group' && containsLayer(props.node.children, props.activeLayerId))

function opacityFromEvent(event: Event): number {
  return Number((event.target as HTMLInputElement).value)
}

function valueFromEvent(event: Event): string {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function blendModeFromEvent(event: Event): BlendMode {
  return valueFromEvent(event) as BlendMode
}

function selectNode(): void {
  if (props.node.type === 'raster')
    emit('select', props.node.id)
}

function moveUp(): void {
  emit('moveNode', props.node.id, {
    parentId: props.parentId,
    index: props.index + 1,
  })
}

function moveDown(): void {
  emit('moveNode', props.node.id, {
    parentId: props.parentId,
    index: props.index - 1,
  })
}

function moveIn(): void {
  if (!props.lowerGroupId)
    return
  emit('moveNode', props.node.id, {
    parentId: props.lowerGroupId,
    index: props.lowerGroupChildCount,
  })
}

function moveOut(): void {
  if (!props.parentId)
    return
  emit('moveNode', props.node.id, {
    parentId: props.grandParentId,
    index: props.parentIndex + 1,
  })
}

function dragIdFromEvent(event: DragEvent): string | undefined {
  return event.dataTransfer?.getData('application/x-saier-layer-node') || undefined
}

function onDragStart(event: DragEvent): void {
  event.dataTransfer?.setData('application/x-saier-layer-node', props.node.id)
  event.dataTransfer?.setData('text/plain', props.node.id)
  if (event.dataTransfer)
    event.dataTransfer.effectAllowed = 'move'
}

function dropBefore(event: DragEvent): void {
  const id = dragIdFromEvent(event)
  if (!id || id === props.node.id)
    return
  emit('moveNode', id, {
    parentId: props.parentId,
    index: props.index,
  })
}

function dropIntoGroup(event: DragEvent): void {
  if (props.node.type !== 'group') {
    dropBefore(event)
    return
  }
  const id = dragIdFromEvent(event)
  if (!id || id === props.node.id)
    return
  emit('moveNode', id, {
    parentId: props.node.id,
    index: props.node.children.length,
  })
  if (props.node.collapsed)
    emit('update:groupCollapsed', props.node.id, false)
}

function countRasterLayers(node: PainterLayerNodeState): number {
  if (node.type === 'raster')
    return 1
  return node.children.reduce((sum, child) => sum + countRasterLayers(child), 0)
}

function containsLayer(nodes: readonly PainterLayerNodeState[], id: string | null): boolean {
  if (!id)
    return false
  return nodes.some((node) => {
    if (node.type === 'raster')
      return node.id === id
    return containsLayer(node.children, id)
  })
}
</script>

<template>
  <div class="layer-tree-row">
    <article
      class="layer-tree-row__body"
      :class="{
        'is-active': node.type === 'raster' && node.id === activeLayerId,
        'has-active-child': hasActiveChild,
        'is-group': isGroup,
      }"
      :style="rowStyle"
      draggable="true"
      @click="selectNode"
      @dragstart="onDragStart"
      @dragover.prevent
      @drop.prevent.stop="dropBefore"
    >
      <button
        v-if="node.type === 'group'"
        type="button"
        class="layer-tree-row__icon"
        :title="node.collapsed ? labels.expandGroup : labels.collapseGroup"
        @click.stop="emit('update:groupCollapsed', node.id, !node.collapsed)"
      >
        <span :class="node.collapsed ? 'i-ph-caret-right' : 'i-ph-caret-down'" />
      </button>
      <span v-else class="layer-tree-row__spacer" />

      <button
        type="button"
        class="layer-tree-row__icon"
        :title="node.visible ? labels.hideLayer : labels.showLayer"
        @click.stop="emit('update:visible', node.id, !node.visible)"
      >
        <span :class="node.visible ? 'i-ph-eye' : 'i-ph-eye-slash'" />
      </button>

      <div
        class="layer-tree-row__thumb"
        :class="{ 'is-group': node.type === 'group' }"
        @dragover.prevent
        @drop.prevent.stop="dropIntoGroup"
      >
        <span v-if="node.type === 'group'" class="i-ph-folder" />
        <img v-else-if="thumbnails?.[node.id]" :src="thumbnails[node.id]" alt="">
      </div>

      <input
        class="layer-tree-row__name"
        :value="node.label"
        @change="emit('update:label', node.id, valueFromEvent($event))"
        @click.stop
      >

      <div v-if="isRaster && node.type === 'raster'" class="layer-tree-row__controls" @click.stop>
        <select
          class="layer-tree-row__blend"
          :value="node.blendMode"
          @change="emit('update:blendMode', node.id, blendModeFromEvent($event))"
        >
          <option v-for="mode in blendModes" :key="mode.value" :value="mode.value">
            {{ mode.label }}
          </option>
        </select>

        <input
          class="layer-tree-row__opacity"
          type="range"
          min="0"
          max="1"
          step="0.01"
          :value="node.opacity"
          @input="emit('update:opacity', node.id, opacityFromEvent($event))"
        >
      </div>

      <div class="layer-tree-row__actions" @click.stop>
        <template v-if="node.type === 'group'">
          <button type="button" class="layer-tree-row__icon" :title="labels.addLayer" @click="emit('add', { parentId: node.id })">
            <span class="i-ph-plus" />
          </button>
          <button type="button" class="layer-tree-row__icon" :title="labels.addGroup" @click="emit('addGroup', { parentId: node.id })">
            <span class="i-ph-folder-plus" />
          </button>
          <button type="button" class="layer-tree-row__icon" :title="labels.ungroup" @click="emit('ungroup', node.id)">
            <span class="i-ph-folder-open" />
          </button>
        </template>

        <template v-if="node.type === 'raster'">
          <button
            type="button"
            class="layer-tree-row__icon"
            :class="{ 'is-on': node.lockAlpha }"
            :title="labels.lockAlpha"
            :aria-pressed="node.lockAlpha"
            @click="emit('update:lockAlpha', node.id, !node.lockAlpha)"
          >
            <span :class="node.lockAlpha ? 'i-ph-lock' : 'i-ph-lock-open'" />
          </button>
          <button
            type="button"
            class="layer-tree-row__icon"
            :class="{ 'is-on': node.clip }"
            :title="labels.clip"
            :aria-pressed="node.clip"
            :disabled="index <= 0"
            @click="emit('update:clip', node.id, !node.clip)"
          >
            <span class="i-ph-arrow-elbow-down-left" />
          </button>
        </template>

        <button
          type="button"
          class="layer-tree-row__icon"
          :title="labels.moveIn"
          :disabled="!lowerGroupId"
          @click="moveIn"
        >
          <span class="i-ph-arrow-bend-down-right" />
        </button>
        <button
          type="button"
          class="layer-tree-row__icon"
          :title="labels.moveOut"
          :disabled="!parentId"
          @click="moveOut"
        >
          <span class="i-ph-arrow-bend-up-left" />
        </button>
        <button
          type="button"
          class="layer-tree-row__icon"
          :title="labels.moveUp"
          :disabled="index >= siblingCount - 1"
          @click="moveUp"
        >
          <span class="i-ph-arrow-up" />
        </button>
        <button
          type="button"
          class="layer-tree-row__icon"
          :title="labels.moveDown"
          :disabled="index <= 0"
          @click="moveDown"
        >
          <span class="i-ph-arrow-down" />
        </button>
        <button
          type="button"
          class="layer-tree-row__icon"
          :title="labels.removeLayer"
          :disabled="!canRemove"
          @click="emit('remove', node.id)"
        >
          <span class="i-ph-trash" />
        </button>
      </div>
    </article>

    <div v-if="node.type === 'group' && !node.collapsed" class="layer-tree-row__children">
      <LayerTreeRow
        v-for="{ node: child, index: childIndex, lowerGroupId: childLowerGroupId, lowerGroupChildCount: childLowerGroupChildCount } in childEntries"
        :key="child.id"
        :node="child"
        :index="childIndex"
        :sibling-count="node.children.length"
        :parent-id="node.id"
        :parent-index="index"
        :grand-parent-id="parentId"
        :depth="depth + 1"
        :lower-group-id="childLowerGroupId"
        :lower-group-child-count="childLowerGroupChildCount"
        :active-layer-id="activeLayerId"
        :thumbnails="thumbnails"
        :labels="labels"
        :raster-layer-count="rasterLayerCount"
        @add="emit('add', $event)"
        @add-group="emit('addGroup', $event)"
        @remove="emit('remove', $event)"
        @select="emit('select', $event)"
        @move-node="(id, target) => emit('moveNode', id, target)"
        @ungroup="emit('ungroup', $event)"
        @update:visible="(id, visible) => emit('update:visible', id, visible)"
        @update:opacity="(id, opacity) => emit('update:opacity', id, opacity)"
        @update:blend-mode="(id, blendMode) => emit('update:blendMode', id, blendMode)"
        @update:label="(id, label) => emit('update:label', id, label)"
        @update:lock-alpha="(id, lockAlpha) => emit('update:lockAlpha', id, lockAlpha)"
        @update:clip="(id, clip) => emit('update:clip', id, clip)"
        @update:group-collapsed="(id, collapsed) => emit('update:groupCollapsed', id, collapsed)"
      />
    </div>
  </div>
</template>

<style scoped>
.layer-tree-row {
  display: grid;
  gap: 6px;
}

.layer-tree-row__body {
  display: grid;
  grid-template-columns: 20px 28px 40px minmax(0, 1fr) auto;
  gap: 6px;
  align-items: center;
  padding: 6px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 8px;
  background: rgb(255 255 255 / 6%);
}

.layer-tree-row__body.is-group {
  background: rgb(255 255 255 / 8%);
}

.layer-tree-row__body.is-active {
  border-color: rgb(120 170 255 / 80%);
  background: rgb(80 120 190 / 26%);
}

.layer-tree-row__body.has-active-child {
  border-color: rgb(120 170 255 / 40%);
}

.layer-tree-row__spacer,
.layer-tree-row__icon {
  display: inline-grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
}

.layer-tree-row__spacer {
  width: 20px;
}

.layer-tree-row__icon {
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: white;
}

.layer-tree-row__icon:disabled {
  cursor: not-allowed;
  opacity: 0.36;
}

.layer-tree-row__icon.is-on {
  border-color: rgb(120 170 255 / 80%);
  background: rgb(80 120 190 / 40%);
}

.layer-tree-row__thumb {
  display: grid;
  width: 40px;
  height: 40px;
  overflow: hidden;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background:
    linear-gradient(45deg, rgb(255 255 255 / 18%) 25%, transparent 25%),
    linear-gradient(-45deg, rgb(255 255 255 / 18%) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, rgb(255 255 255 / 18%) 75%),
    linear-gradient(-45deg, transparent 75%, rgb(255 255 255 / 18%) 75%);
  background-color: rgb(30 30 36);
  background-position:
    0 0,
    0 4px,
    4px -4px,
    -4px 0;
  background-size: 8px 8px;
}

.layer-tree-row__thumb.is-group {
  background: rgb(255 255 255 / 8%);
  color: rgb(180 205 255);
  font-size: 20px;
}

.layer-tree-row__thumb img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.layer-tree-row__name {
  min-width: 0;
  border: 0;
  background: transparent;
  color: white;
  font: inherit;
  outline: 0;
}

.layer-tree-row__controls {
  display: grid;
  width: 112px;
  gap: 4px;
}

.layer-tree-row__blend,
.layer-tree-row__opacity {
  min-width: 0;
  width: 100%;
}

.layer-tree-row__blend {
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: white;
}

.layer-tree-row__actions {
  display: flex;
  grid-column: 1 / -1;
  justify-content: flex-end;
  gap: 4px;
}

.layer-tree-row__children {
  display: grid;
  gap: 6px;
}
</style>

<script setup lang="ts">
import type { CSSProperties } from 'vue'
import type { SitePainterPanelId } from '~/types/painter-app'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, useTemplateRef, watch } from 'vue'

interface SitePainterPanelItem {
  id: SitePainterPanelId
  icon: string
}

type PanelAnchorX = 'left' | 'right'
type PanelAnchorY = 'top' | 'bottom'

interface WorkspaceBounds {
  width: number
  height: number
}

interface PanelAnchorState {
  anchorX: PanelAnchorX
  anchorY: PanelAnchorY
  anchorOffsetX: number
  anchorOffsetY: number
}

interface SitePainterPanelGroup {
  id: string
  panelIds: SitePainterPanelId[]
  activePanelId: SitePainterPanelId
  collapsed: boolean
  anchorX: PanelAnchorX
  anchorY: PanelAnchorY
  anchorOffsetX: number
  anchorOffsetY: number
  x: number
  y: number
  z: number
}

interface DragState {
  groupId: string
  startClientX: number
  startClientY: number
  startX: number
  startY: number
  lastClientX: number
  lastClientY: number
}

const props = defineProps<{
  appName: string
  availablePanels: SitePainterPanelId[]
  closePreviewLabel: string
  exportPreview?: string
  exportPreviewLabel: string
  languageLabel: string
  loadingLabel: string
  loading: boolean
  nextLocaleLabel: string
  panelActionLabels: {
    collapse: string
    detach: string
    expand: string
    hide: string
  }
  panelLabels: Record<SitePainterPanelId, string>
  panelVisibility: Readonly<Record<SitePainterPanelId, boolean>>
  statusLabel: string
  tagline: string
}>()

const emit = defineEmits<{
  closePreview: []
  setPanelVisible: [panelId: SitePainterPanelId, visible: boolean]
  toggleLocale: []
}>()

const PANEL_ITEMS: SitePainterPanelItem[] = [
  { id: 'options', icon: 'i-ph-sliders-horizontal' },
  { id: 'controls', icon: 'i-ph-palette' },
  { id: 'layers', icon: 'i-ph-stack' },
  { id: 'diagnostics', icon: 'i-ph-activity' },
]

const PANEL_MARGIN = 8
const DEFAULT_PANEL_SIZE = {
  width: 336,
  height: 320,
}

const workspaceRef = useTemplateRef<HTMLElement>('workspace')
const panelGroups = shallowRef<SitePainterPanelGroup[]>(createDefaultPanelGroups(1280, 720))
const dragging = shallowRef<DragState>()
const activeGroupId = shallowRef<string>()
const nextZ = shallowRef(20)
const workspaceSize = shallowRef<WorkspaceBounds>(workspaceBounds())
let resizeObserver: ResizeObserver | undefined
let panelResizeObserver: ResizeObserver | undefined

const visiblePanelIds = computed(() =>
  PANEL_ITEMS
    .filter(item => props.availablePanels.includes(item.id) && props.panelVisibility[item.id])
    .map(item => item.id),
)

watch(() => `${props.availablePanels.join('|')}::${PANEL_ITEMS.map(item => Number(props.panelVisibility[item.id])).join('')}`, () => {
  syncPanelGroups()
}, { immediate: true })

onMounted(() => {
  panelResizeObserver = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const groupId = (entry.target as HTMLElement).dataset.panelGroupId
      if (groupId)
        clampAndRefreshPanelGroups(groupId)
    }
  })

  resetPanelLayout()
  workspaceSize.value = workspaceBounds()

  if (workspaceRef.value) {
    resizeObserver = new ResizeObserver(handleWorkspaceResize)
    resizeObserver.observe(workspaceRef.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  panelResizeObserver?.disconnect()
  stopWindowDragListeners()
})

function createDefaultPanelGroups(width: number, height: number): SitePainterPanelGroup[] {
  const rightX = Math.max(12, width - 360)
  const bottomY = Math.max(12, height - 312)

  return [
    {
      id: 'tools',
      panelIds: ['options', 'controls'],
      activePanelId: 'options',
      collapsed: false,
      anchorX: 'left',
      anchorY: 'top',
      anchorOffsetX: 12,
      anchorOffsetY: 12,
      x: 12,
      y: 12,
      z: 12,
    },
    {
      id: 'layers',
      panelIds: ['layers'],
      activePanelId: 'layers',
      collapsed: false,
      anchorX: 'right',
      anchorY: 'top',
      anchorOffsetX: Math.max(PANEL_MARGIN, width - rightX - DEFAULT_PANEL_SIZE.width),
      anchorOffsetY: 12,
      x: rightX,
      y: 12,
      z: 11,
    },
    {
      id: 'diagnostics',
      panelIds: ['diagnostics'],
      activePanelId: 'diagnostics',
      collapsed: false,
      anchorX: 'right',
      anchorY: 'bottom',
      anchorOffsetX: Math.max(PANEL_MARGIN, width - rightX - DEFAULT_PANEL_SIZE.width),
      anchorOffsetY: Math.max(PANEL_MARGIN, height - bottomY - DEFAULT_PANEL_SIZE.height),
      x: rightX,
      y: bottomY,
      z: 10,
    },
  ]
}

function resetPanelLayout(): void {
  const bounds = workspaceBounds()
  workspaceSize.value = bounds
  panelGroups.value = createDefaultPanelGroups(bounds.width, bounds.height)
  syncPanelGroups()
  void nextTick(() => {
    clampAndRefreshPanelGroups()
    observePanelGroups()
  })
}

function syncPanelGroups(): void {
  const visible = new Set(visiblePanelIds.value)
  const known = new Set<SitePainterPanelId>()

  let groups = panelGroups.value.map((group) => {
    const panelIds = group.panelIds.filter(panelId => props.availablePanels.includes(panelId))
    for (const panelId of panelIds)
      known.add(panelId)

    const activePanelId = panelIds.includes(group.activePanelId)
      ? group.activePanelId
      : panelIds[0] ?? group.activePanelId

    return {
      ...group,
      panelIds,
      activePanelId,
    }
  })

  for (const panelId of props.availablePanels) {
    if (!known.has(panelId))
      groups = [...groups, createFloatingPanelGroup(panelId)]
  }

  groups = groups.filter(group => group.panelIds.length > 0)
    .map((group) => {
      const visiblePanels = group.panelIds.filter(panelId => visible.has(panelId))
      return {
        ...group,
        activePanelId: visiblePanels.includes(group.activePanelId)
          ? group.activePanelId
          : visiblePanels[0] ?? group.activePanelId,
      }
    })

  panelGroups.value = groups
  void nextTick(observePanelGroups)
}

function createFloatingPanelGroup(panelId: SitePainterPanelId): SitePainterPanelGroup {
  const bounds = workspaceBounds()
  const offset = panelGroups.value.length * 28
  const id = `${panelId}-${Date.now()}`
  const x = Math.min(48 + offset, Math.max(12, bounds.width - 360))
  const y = Math.min(48 + offset, Math.max(12, bounds.height - 220))

  return {
    id,
    panelIds: [panelId],
    activePanelId: panelId,
    collapsed: false,
    ...panelAnchorStateForPosition(id, x, y, bounds),
    x,
    y,
    z: raiseZ(),
  }
}

function visiblePanelsForGroup(group: SitePainterPanelGroup): SitePainterPanelItem[] {
  const visible = new Set(visiblePanelIds.value)
  return PANEL_ITEMS.filter(item => group.panelIds.includes(item.id) && visible.has(item.id))
}

function shouldShowGroup(group: SitePainterPanelGroup): boolean {
  return visiblePanelsForGroup(group).length > 0
}

function isPanelInGroup(group: SitePainterPanelGroup, panelId: SitePainterPanelId): boolean {
  return group.panelIds.includes(panelId)
}

function activatePanel(groupId: string, panelId: SitePainterPanelId): void {
  panelGroups.value = panelGroups.value.map(group =>
    group.id === groupId
      ? { ...group, activePanelId: panelId, collapsed: false, z: raiseZ() }
      : group,
  )
  activeGroupId.value = groupId
  void nextTick(() => clampAndRefreshPanelGroups(groupId))
}

function detachActivePanel(groupId: string): void {
  const source = panelGroups.value.find(group => group.id === groupId)
  if (!source || source.panelIds.length <= 1)
    return

  const panelId = source.activePanelId
  const remainingPanelIds = source.panelIds.filter(id => id !== panelId)
  const detachedId = `${panelId}-${Date.now()}`
  const detachedX = source.x + 28
  const detachedY = source.y + 34
  const detached: SitePainterPanelGroup = {
    id: detachedId,
    panelIds: [panelId],
    activePanelId: panelId,
    collapsed: false,
    ...panelAnchorStateForPosition(detachedId, detachedX, detachedY, workspaceBounds(), {
      anchorX: source.anchorX,
      anchorY: source.anchorY,
    }),
    x: detachedX,
    y: detachedY,
    z: raiseZ(),
  }

  panelGroups.value = panelGroups.value
    .map(group =>
      group.id === groupId
        ? {
            ...group,
            panelIds: remainingPanelIds,
            activePanelId: remainingPanelIds[0]!,
            collapsed: source.collapsed,
          }
        : group,
    )
    .concat(detached)

  activeGroupId.value = detached.id
  void nextTick(clampAndRefreshPanelGroups)
}

function hideActivePanel(groupId: string): void {
  const group = panelGroups.value.find(item => item.id === groupId)
  if (!group)
    return

  emit('setPanelVisible', group.activePanelId, false)
}

function panelActionTitle(group: SitePainterPanelGroup, action: keyof typeof props.panelActionLabels): string {
  return `${props.panelActionLabels[action]}: ${props.panelLabels[group.activePanelId]}`
}

function togglePanelGroupCollapsed(groupId: string): void {
  panelGroups.value = panelGroups.value.map(group =>
    group.id === groupId
      ? { ...group, collapsed: !group.collapsed, z: raiseZ() }
      : group,
  )
  activeGroupId.value = groupId
  void nextTick(() => clampAndRefreshPanelGroups(groupId))
}

function startPanelDrag(event: PointerEvent, groupId: string): void {
  if (event.button !== 0)
    return

  const group = panelGroups.value.find(item => item.id === groupId)
  if (!group)
    return

  event.preventDefault()
  bringGroupToFront(groupId)

  dragging.value = {
    groupId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startX: group.x,
    startY: group.y,
    lastClientX: event.clientX,
    lastClientY: event.clientY,
  }

  window.addEventListener('pointermove', handlePanelDrag)
  window.addEventListener('pointerup', finishPanelDrag, { once: true })
  window.addEventListener('pointercancel', cancelPanelDrag, { once: true })
}

function handlePanelDrag(event: PointerEvent): void {
  const state = dragging.value
  if (!state)
    return

  state.lastClientX = event.clientX
  state.lastClientY = event.clientY

  const nextX = state.startX + event.clientX - state.startClientX
  const nextY = state.startY + event.clientY - state.startClientY
  movePanelGroup(state.groupId, nextX, nextY)
}

function finishPanelDrag(): void {
  const state = dragging.value
  if (!state)
    return

  mergePanelGroupAtPoint(state.groupId, state.lastClientX, state.lastClientY)
  dragging.value = undefined
  stopWindowDragListeners()
}

function cancelPanelDrag(): void {
  dragging.value = undefined
  stopWindowDragListeners()
}

function stopWindowDragListeners(): void {
  window.removeEventListener('pointermove', handlePanelDrag)
  window.removeEventListener('pointerup', finishPanelDrag)
  window.removeEventListener('pointercancel', cancelPanelDrag)
}

function mergePanelGroupAtPoint(sourceGroupId: string, clientX: number, clientY: number): void {
  const target = document.elementsFromPoint(clientX, clientY)
    .map(element => element.closest<HTMLElement>('[data-panel-group-id]'))
    .find(element => element && element.dataset.panelGroupId !== sourceGroupId)

  const targetGroupId = target?.dataset.panelGroupId
  if (!targetGroupId)
    return

  const source = panelGroups.value.find(group => group.id === sourceGroupId)
  const targetGroup = panelGroups.value.find(group => group.id === targetGroupId)
  if (!source || !targetGroup)
    return

  const mergedPanelIds = [
    ...targetGroup.panelIds,
    ...source.panelIds.filter(panelId => !targetGroup.panelIds.includes(panelId)),
  ]

  panelGroups.value = panelGroups.value
    .filter(group => group.id !== sourceGroupId)
    .map(group =>
      group.id === targetGroupId
        ? {
            ...group,
            panelIds: mergedPanelIds,
            activePanelId: source.activePanelId,
            collapsed: false,
            z: raiseZ(),
          }
        : group,
    )

  activeGroupId.value = targetGroupId
  void nextTick(() => clampAndRefreshPanelGroups(targetGroupId))
}

function movePanelGroup(groupId: string, x: number, y: number): void {
  const bounds = workspaceBounds()

  panelGroups.value = panelGroups.value.map((group) => {
    if (group.id !== groupId)
      return group

    const next = clampPanelGroupPosition(groupId, x, y, bounds)
    return {
      ...group,
      ...panelAnchorStateForPosition(groupId, next.x, next.y, bounds),
      ...next,
    }
  })
}

function bringGroupToFront(groupId: string): void {
  panelGroups.value = panelGroups.value.map(group =>
    group.id === groupId
      ? { ...group, z: raiseZ() }
      : group,
  )
  activeGroupId.value = groupId
}

function raiseZ(): number {
  nextZ.value += 1
  return nextZ.value
}

function handleWorkspaceResize(): void {
  const bounds = workspaceBounds()
  const previousBounds = workspaceSize.value
  workspaceSize.value = bounds

  if (bounds.width === previousBounds.width && bounds.height === previousBounds.height) {
    clampAllPanelGroups()
    return
  }

  panelGroups.value = panelGroups.value.map((group) => {
    const next = clampPanelGroupPosition(
      group.id,
      anchoredX(group, bounds),
      anchoredY(group, bounds),
      bounds,
    )

    return {
      ...group,
      ...next,
    }
  })
}

function observePanelGroups(): void {
  if (!panelResizeObserver || !workspaceRef.value)
    return

  panelResizeObserver.disconnect()

  for (const element of workspaceRef.value.querySelectorAll<HTMLElement>('[data-panel-group-id]')) {
    if (getComputedStyle(element).display !== 'none')
      panelResizeObserver.observe(element)
  }
}

function clampAllPanelGroups(): void {
  panelGroups.value = panelGroups.value.map((group) => {
    const next = clampPanelGroupPosition(group.id, group.x, group.y)
    return {
      ...group,
      ...next,
    }
  })
}

function clampAndRefreshPanelGroups(groupId?: string): void {
  const bounds = workspaceBounds()

  panelGroups.value = panelGroups.value.map((group) => {
    if (groupId && group.id !== groupId)
      return group

    const next = clampPanelGroupPosition(group.id, group.x, group.y, bounds)

    return {
      ...group,
      ...panelAnchorStateForPosition(group.id, next.x, next.y, bounds, {
        anchorX: group.anchorX,
        anchorY: group.anchorY,
      }),
      ...next,
    }
  })
}

function clampPanelGroupPosition(
  groupId: string,
  x: number,
  y: number,
  bounds: WorkspaceBounds = workspaceBounds(),
): Pick<SitePainterPanelGroup, 'x' | 'y'> {
  const size = panelGroupSize(groupId)
  return {
    x: clamp(x, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.width - size.width - PANEL_MARGIN)),
    y: clamp(y, PANEL_MARGIN, Math.max(PANEL_MARGIN, bounds.height - size.height - PANEL_MARGIN)),
  }
}

function panelAnchorStateForPosition(
  groupId: string,
  x: number,
  y: number,
  bounds: WorkspaceBounds,
  anchorOverride: Partial<Pick<PanelAnchorState, 'anchorX' | 'anchorY'>> = {},
): PanelAnchorState {
  const size = panelGroupSize(groupId)
  const rightOffset = bounds.width - x - size.width
  const bottomOffset = bounds.height - y - size.height
  const anchorX = anchorOverride.anchorX ?? (x <= rightOffset ? 'left' : 'right')
  const anchorY = anchorOverride.anchorY ?? (y <= bottomOffset ? 'top' : 'bottom')

  return {
    anchorX,
    anchorY,
    anchorOffsetX: Math.max(PANEL_MARGIN, anchorX === 'left' ? x : rightOffset),
    anchorOffsetY: Math.max(PANEL_MARGIN, anchorY === 'top' ? y : bottomOffset),
  }
}

function anchoredX(group: SitePainterPanelGroup, bounds: WorkspaceBounds): number {
  if (group.anchorX === 'left')
    return group.anchorOffsetX

  return bounds.width - panelGroupSize(group.id).width - group.anchorOffsetX
}

function anchoredY(group: SitePainterPanelGroup, bounds: WorkspaceBounds): number {
  if (group.anchorY === 'top')
    return group.anchorOffsetY

  return bounds.height - panelGroupSize(group.id).height - group.anchorOffsetY
}

function panelGroupSize(groupId: string): { width: number, height: number } {
  const element = workspaceRef.value?.querySelector<HTMLElement>(`[data-panel-group-id="${groupId}"]`)
  if (!element)
    return { width: 336, height: 320 }

  const rect = element.getBoundingClientRect()
  return {
    width: rect.width || 336,
    height: rect.height || 320,
  }
}

function workspaceBounds(): { width: number, height: number } {
  const rect = workspaceRef.value?.getBoundingClientRect()
  return {
    width: rect?.width ?? 1280,
    height: rect?.height ?? 720,
  }
}

function panelStyle(group: SitePainterPanelGroup): CSSProperties {
  return {
    left: `${group.x}px`,
    top: `${group.y}px`,
    zIndex: group.z,
  }
}

function panelGroupClass(group: SitePainterPanelGroup): Record<string, boolean> {
  return {
    'is-active': activeGroupId.value === group.id,
    'is-collapsed': group.collapsed,
    'is-dragging': dragging.value?.groupId === group.id,
    'site-painter-panel--controls': group.panelIds.includes('controls'),
    'site-painter-panel--diagnostics': group.panelIds.includes('diagnostics'),
    'site-painter-panel--layers': group.panelIds.includes('layers'),
    'site-painter-panel--options': group.panelIds.includes('options'),
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
</script>

<template>
  <div class="site-painter">
    <header class="site-painter__chrome">
      <div class="site-painter__topbar">
        <div class="site-painter__primary">
          <div class="site-painter__brand">
            <Logos class="site-painter__logo" />
            <div class="site-painter__brand-copy">
              <h1 class="site-painter__title">
                {{ appName }}
              </h1>
              <p class="site-painter__tagline">
                {{ tagline }}
              </p>
            </div>
          </div>

          <div class="site-painter__menu">
            <slot name="menubar" />
          </div>
        </div>

        <div class="site-painter__actions">
          <div class="site-painter__account">
            <slot name="account" />
          </div>
          <span class="site-painter__status">{{ statusLabel }}</span>
          <button type="button" class="site-painter__locale" @click="emit('toggleLocale')">
            <span>{{ languageLabel }}</span>
            <strong>{{ nextLocaleLabel }}</strong>
          </button>
        </div>
      </div>

      <div class="site-painter__toolbar">
        <slot name="toolbar" />
      </div>

      <div class="site-painter__documents">
        <slot name="documents" />
      </div>
    </header>

    <main ref="workspace" class="site-painter__workspace">
      <div class="site-painter__canvas-host">
        <slot name="canvas" />
      </div>

      <div class="site-painter__panel-stage" aria-live="off">
        <section
          v-for="group in panelGroups"
          v-show="shouldShowGroup(group)"
          :key="group.id"
          class="site-painter-panel"
          :class="panelGroupClass(group)"
          :data-panel-group-id="group.id"
          :style="panelStyle(group)"
          @pointerdown="bringGroupToFront(group.id)"
        >
          <header class="site-painter-panel__header" @pointerdown="startPanelDrag($event, group.id)">
            <div class="site-painter-panel__tabs" role="tablist">
              <button
                v-for="panel in visiblePanelsForGroup(group)"
                :id="`site-painter-panel-tab-${group.id}-${panel.id}`"
                :key="panel.id"
                type="button"
                class="site-painter-panel__tab"
                :class="{ 'is-active': group.activePanelId === panel.id }"
                :aria-controls="`site-painter-panel-pane-${group.id}-${panel.id}`"
                :aria-selected="group.activePanelId === panel.id"
                role="tab"
                @click.stop="activatePanel(group.id, panel.id)"
                @pointerdown.stop
              >
                <span :class="panel.icon" aria-hidden="true" />
                <span class="site-painter-panel__tab-label">{{ panelLabels[panel.id] }}</span>
              </button>
            </div>

            <div class="site-painter-panel__actions">
              <button
                type="button"
                class="site-painter-panel__icon"
                :title="panelActionTitle(group, group.collapsed ? 'expand' : 'collapse')"
                :aria-label="panelActionTitle(group, group.collapsed ? 'expand' : 'collapse')"
                :aria-expanded="!group.collapsed"
                @click.stop="togglePanelGroupCollapsed(group.id)"
                @pointerdown.stop
              >
                <span :class="group.collapsed ? 'i-ph-caret-down' : 'i-ph-caret-up'" aria-hidden="true" />
              </button>
              <button
                v-if="group.panelIds.length > 1"
                type="button"
                class="site-painter-panel__icon"
                :title="panelActionTitle(group, 'detach')"
                :aria-label="panelActionTitle(group, 'detach')"
                @click.stop="detachActivePanel(group.id)"
                @pointerdown.stop
              >
                <span class="i-ph-arrows-out-cardinal" aria-hidden="true" />
              </button>
              <button
                type="button"
                class="site-painter-panel__icon"
                :title="panelActionTitle(group, 'hide')"
                :aria-label="panelActionTitle(group, 'hide')"
                @click.stop="hideActivePanel(group.id)"
                @pointerdown.stop
              >
                <span class="i-ph-eye-slash" aria-hidden="true" />
              </button>
              <span class="site-painter-panel__handle" aria-hidden="true">
                <span class="i-ph-dots-six-vertical" />
              </span>
            </div>
          </header>

          <div v-show="!group.collapsed" class="site-painter-panel__body">
            <div
              v-if="isPanelInGroup(group, 'options')"
              v-show="group.activePanelId === 'options'"
              :id="`site-painter-panel-pane-${group.id}-options`"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="`site-painter-panel-tab-${group.id}-options`"
            >
              <slot name="options" />
            </div>

            <div
              v-if="isPanelInGroup(group, 'controls')"
              v-show="group.activePanelId === 'controls'"
              :id="`site-painter-panel-pane-${group.id}-controls`"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="`site-painter-panel-tab-${group.id}-controls`"
            >
              <slot name="controls" />
            </div>

            <div
              v-if="isPanelInGroup(group, 'layers')"
              v-show="group.activePanelId === 'layers'"
              :id="`site-painter-panel-pane-${group.id}-layers`"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="`site-painter-panel-tab-${group.id}-layers`"
            >
              <slot name="layers" />
            </div>

            <div
              v-if="isPanelInGroup(group, 'diagnostics')"
              v-show="group.activePanelId === 'diagnostics'"
              :id="`site-painter-panel-pane-${group.id}-diagnostics`"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="`site-painter-panel-tab-${group.id}-diagnostics`"
            >
              <slot name="diagnostics" />
            </div>
          </div>
        </section>
      </div>

      <div v-if="loading" class="site-painter__loading">
        {{ loadingLabel }}
      </div>

      <aside v-if="exportPreview" class="site-painter__preview">
        <header class="site-painter__preview-header">
          <span>{{ exportPreviewLabel }}</span>
          <button type="button" class="site-painter__preview-close" :title="closePreviewLabel" @click="emit('closePreview')">
            <span class="i-ph-x" />
          </button>
        </header>
        <img class="site-painter__preview-image" :src="exportPreview" :alt="exportPreviewLabel">
      </aside>
    </main>
  </div>
</template>

<style scoped>
.site-painter {
  display: grid;
  height: 100vh;
  min-height: 0;
  grid-template-rows: 132px minmax(0, 1fr);
  overflow: hidden;
  background: #262629;
  color: white;
}

.site-painter__chrome {
  display: grid;
  min-width: 0;
  grid-template-rows: 44px 44px 44px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  background: rgb(18 18 20 / 94%);
}

.site-painter__topbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px 2px;
}

.site-painter__primary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.site-painter__brand {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.site-painter__logo {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.site-painter__logo :deep(div) {
  margin: 0;
  font-size: 28px;
}

.site-painter__brand-copy {
  min-width: 0;
  max-width: 92px;
  text-align: left;
}

.site-painter__title,
.site-painter__tagline {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-painter__title {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.2;
}

.site-painter__tagline {
  display: none;
}

.site-painter__menu {
  min-width: 0;
  overflow: hidden;
}

.site-painter__toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 3px 12px 7px;
  overflow: hidden;
}

.site-painter__documents {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 4px 12px 6px;
  overflow: hidden;
}

.site-painter__actions {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.site-painter__account {
  display: inline-flex;
  min-width: 0;
}

.site-painter__account:empty {
  display: none;
}

.site-painter__status {
  overflow: hidden;
  max-width: 280px;
  color: rgb(255 255 255 / 52%);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-painter__locale {
  display: inline-flex;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 8px;
  background: rgb(255 255 255 / 8%);
  color: white;
  font-size: 12px;
  padding-inline: 12px;
}

.site-painter__locale strong {
  font-weight: 650;
}

.site-painter__workspace {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.site-painter__canvas-host,
.site-painter__canvas-host :slotted(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.site-painter__canvas-host :slotted(canvas) {
  background: #333;
}

.site-painter__panel-stage {
  position: absolute;
  z-index: 20;
  inset: 0;
  pointer-events: none;
}

.site-painter-panel {
  position: absolute;
  display: grid;
  width: min(336px, calc(100vw - 16px));
  min-width: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: rgb(18 18 22 / 90%);
  box-shadow: 0 18px 50px rgb(0 0 0 / 22%);
  color: white;
  pointer-events: auto;
}

.site-painter-panel--controls {
  width: min(292px, calc(100vw - 16px));
}

.site-painter-panel--diagnostics {
  width: min(320px, calc(100vw - 16px));
}

.site-painter-panel--layers,
.site-painter-panel--options {
  width: min(344px, calc(100vw - 16px));
}

.site-painter-panel.is-active,
.site-painter-panel.is-dragging {
  border-color: rgb(147 197 253 / 26%);
  box-shadow: 0 22px 64px rgb(0 0 0 / 30%);
}

.site-painter-panel.is-dragging {
  opacity: 0.94;
}

.site-painter-panel.is-collapsed {
  grid-template-rows: auto;
}

.site-painter-panel__header {
  display: flex;
  min-width: 0;
  height: 34px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border-bottom: 1px solid rgb(255 255 255 / 9%);
  background: linear-gradient(180deg, rgb(255 255 255 / 7%), transparent), rgb(0 0 0 / 12%);
  cursor: grab;
  padding: 4px;
  touch-action: none;
  user-select: none;
}

.site-painter-panel.is-collapsed .site-painter-panel__header {
  border-bottom: 0;
}

.site-painter-panel.is-dragging .site-painter-panel__header {
  cursor: grabbing;
}

.site-painter-panel__tabs {
  display: inline-flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 3px;
  overflow-x: auto;
  scrollbar-width: none;
}

.site-painter-panel__tabs::-webkit-scrollbar {
  display: none;
}

.site-painter-panel__tab {
  display: inline-flex;
  min-width: 0;
  height: 26px;
  flex: 0 1 auto;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: rgb(255 255 255 / 66%);
  font-size: 12px;
  padding: 0 7px;
}

.site-painter-panel__tab.is-active {
  border-color: rgb(96 165 250 / 40%);
  background: rgb(96 165 250 / 15%);
  color: white;
}

.site-painter-panel__tab:focus-visible,
.site-painter-panel__icon:focus-visible {
  outline: 2px solid rgb(147 197 253 / 72%);
  outline-offset: 1px;
}

.site-painter-panel__tab-label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-painter-panel__actions {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 2px;
}

.site-painter-panel__icon,
.site-painter-panel__handle {
  display: inline-grid;
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 5px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 64%);
}

.site-painter-panel__icon:hover {
  background: rgb(255 255 255 / 10%);
  color: white;
}

.site-painter-panel__handle {
  color: rgb(255 255 255 / 34%);
}

.site-painter-panel__body {
  min-width: 0;
  max-height: min(720px, calc(100vh - 188px));
  overflow: auto;
}

.site-painter-panel__pane {
  min-width: 0;
  padding: 0;
}

.site-painter-panel__pane:empty {
  display: none;
}

.site-painter-panel__pane :deep(.painter-options),
.site-painter-panel__pane :deep(.painter-controls),
.site-painter-panel__pane :deep(.painter-layer-panel),
.site-painter-panel__pane :deep(.site-diagnostics) {
  width: 100% !important;
  border: 0;
  border-radius: 0;
  background: transparent !important;
  box-shadow: none;
}

.site-painter__preview,
.site-painter__loading {
  position: absolute;
  z-index: 10;
}

.site-painter__loading:empty {
  display: none;
}

.site-painter__loading {
  top: 50%;
  left: 50%;
  color: rgb(255 255 255 / 62%);
  font-size: 14px;
  transform: translate(-50%, -50%);
}

.site-painter__preview {
  right: 12px;
  bottom: 12px;
  width: min(280px, calc(100vw - 24px));
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: rgb(18 18 20 / 92%);
}

.site-painter__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  font-size: 12px;
  font-weight: 650;
}

.site-painter__preview-close {
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: white;
}

.site-painter__preview-image {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
}

@media (max-width: 1080px) {
  .site-painter__status {
    display: none;
  }
}

@media (max-width: 900px) {
  .site-painter__topbar {
    gap: 8px;
  }
}

@media (max-width: 640px) {
  .site-painter {
    grid-template-rows: 132px minmax(0, 1fr);
  }

  .site-painter__chrome {
    grid-template-rows: 44px 44px 44px;
  }

  .site-painter__brand-copy,
  .site-painter__locale span {
    display: none;
  }

  .site-painter__brand {
    width: 34px;
  }

  .site-painter__logo {
    overflow: hidden;
  }

  .site-painter__primary {
    gap: 6px;
  }

  .site-painter__toolbar {
    padding-inline: 8px;
  }

  .site-painter-panel {
    width: min(328px, calc(100vw - 16px));
  }

  .site-painter-panel__tab {
    max-width: 124px;
  }
}
</style>

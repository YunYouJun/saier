import type { CSSProperties, MaybeRefOrGetter, ShallowRef } from 'vue'
import type { SitePainterPanelId } from '~/types/painter-app'
import type { SitePainterPanelItem } from '~/types/painter-shell'
import { computed, nextTick, onBeforeUnmount, onMounted, shallowRef, toValue, watch } from 'vue'

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

export interface SiteDesktopPainterPanelGroup {
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

export interface UseDesktopPainterPanelsOptions {
  availablePanels: MaybeRefOrGetter<SitePainterPanelId[]>
  panelItems: readonly SitePainterPanelItem[]
  panelVisibility: MaybeRefOrGetter<Readonly<Record<SitePainterPanelId, boolean>>>
  setPanelVisible: (panelId: SitePainterPanelId, visible: boolean) => void
}

const PANEL_MARGIN = 8
const PANEL_RIGHT_GUTTER = 16
const DEFAULT_PANEL_SIZE = {
  width: 344,
  height: 320,
}

export function useDesktopPainterPanels(options: UseDesktopPainterPanelsOptions) {
  const workspaceRef = shallowRef<HTMLElement>()
  const panelGroups = shallowRef<SiteDesktopPainterPanelGroup[]>(createDefaultDesktopPanelGroups(1280, 720))
  const dragging = shallowRef<DragState>()
  const activeGroupId = shallowRef<string>()
  const nextZ = shallowRef(20)
  const workspaceSize = shallowRef<WorkspaceBounds>(workspaceBounds(workspaceRef))
  let resizeObserver: ResizeObserver | undefined
  let panelResizeObserver: ResizeObserver | undefined

  const availablePanelIds = computed(() => toValue(options.availablePanels))
  const visiblePanelIds = computed(() =>
    options.panelItems
      .filter(item => availablePanelIds.value.includes(item.id) && toValue(options.panelVisibility)[item.id])
      .map(item => item.id),
  )

  watch(() => `${availablePanelIds.value.join('|')}::${options.panelItems.map(item => Number(toValue(options.panelVisibility)[item.id])).join('')}`, () => {
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
    workspaceSize.value = workspaceBounds(workspaceRef)

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

  function resetPanelLayout(): void {
    const bounds = workspaceBounds(workspaceRef)
    workspaceSize.value = bounds
    panelGroups.value = createDefaultDesktopPanelGroups(bounds.width, bounds.height)
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
      const panelIds = group.panelIds.filter(panelId => availablePanelIds.value.includes(panelId))
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

    for (const panelId of availablePanelIds.value) {
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

  function createFloatingPanelGroup(panelId: SitePainterPanelId): SiteDesktopPainterPanelGroup {
    const bounds = workspaceBounds(workspaceRef)
    const offset = panelGroups.value.length * 28
    const id = `${panelId}-${Date.now()}`
    const x = Math.min(48 + offset, defaultRightPanelX(bounds.width))
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

  function visiblePanelsForGroup(group: SiteDesktopPainterPanelGroup): SitePainterPanelItem[] {
    const visible = new Set(visiblePanelIds.value)
    return options.panelItems.filter(item => group.panelIds.includes(item.id) && visible.has(item.id))
  }

  function shouldShowGroup(group: SiteDesktopPainterPanelGroup): boolean {
    return visiblePanelsForGroup(group).length > 0
  }

  function isPanelInGroup(group: SiteDesktopPainterPanelGroup, panelId: SitePainterPanelId): boolean {
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
    const detached: SiteDesktopPainterPanelGroup = {
      id: detachedId,
      panelIds: [panelId],
      activePanelId: panelId,
      collapsed: false,
      ...panelAnchorStateForPosition(detachedId, detachedX, detachedY, workspaceBounds(workspaceRef), {
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

    options.setPanelVisible(group.activePanelId, false)
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
    const bounds = workspaceBounds(workspaceRef)

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
    const bounds = workspaceBounds(workspaceRef)
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
    const bounds = workspaceBounds(workspaceRef)

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
    bounds: WorkspaceBounds = workspaceBounds(workspaceRef),
  ): Pick<SiteDesktopPainterPanelGroup, 'x' | 'y'> {
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

  function anchoredX(group: SiteDesktopPainterPanelGroup, bounds: WorkspaceBounds): number {
    if (group.anchorX === 'left')
      return group.anchorOffsetX

    return bounds.width - panelGroupSize(group.id).width - group.anchorOffsetX
  }

  function anchoredY(group: SiteDesktopPainterPanelGroup, bounds: WorkspaceBounds): number {
    if (group.anchorY === 'top')
      return group.anchorOffsetY

    return bounds.height - panelGroupSize(group.id).height - group.anchorOffsetY
  }

  function panelGroupSize(groupId: string): { width: number, height: number } {
    const element = workspaceRef.value?.querySelector<HTMLElement>(`[data-panel-group-id="${groupId}"]`)
    if (!element)
      return DEFAULT_PANEL_SIZE

    const rect = element.getBoundingClientRect()
    return {
      width: rect.width || DEFAULT_PANEL_SIZE.width,
      height: rect.height || DEFAULT_PANEL_SIZE.height,
    }
  }

  function panelStyle(group: SiteDesktopPainterPanelGroup): CSSProperties {
    return {
      left: `${group.x}px`,
      top: `${group.y}px`,
      zIndex: group.z,
    }
  }

  function panelGroupClass(group: SiteDesktopPainterPanelGroup): Record<string, boolean> {
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

  return {
    activatePanel,
    bringGroupToFront,
    detachActivePanel,
    hideActivePanel,
    isPanelInGroup,
    panelGroupClass,
    panelGroups,
    panelStyle,
    shouldShowGroup,
    startPanelDrag,
    togglePanelGroupCollapsed,
    visiblePanelsForGroup,
    workspaceRef,
  }
}

/** Creates the initial expanded desktop panel layout for the current workspace size. */
export function createDefaultDesktopPanelGroups(width: number, height: number): SiteDesktopPainterPanelGroup[] {
  const rightX = defaultRightPanelX(width)
  const controlsY = Math.max(12, height - DEFAULT_PANEL_SIZE.height - 12)
  const navigatorY = Math.max(12, height - 252)
  const diagnosticsY = Math.max(12, navigatorY - DEFAULT_PANEL_SIZE.height - 12)

  return [
    {
      id: 'options',
      panelIds: ['options'],
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
      id: 'controls',
      panelIds: ['controls'],
      activePanelId: 'controls',
      collapsed: false,
      anchorX: 'left',
      anchorY: 'bottom',
      anchorOffsetX: 12,
      anchorOffsetY: 12,
      x: 12,
      y: controlsY,
      z: 13,
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
      id: 'navigator',
      panelIds: ['navigator'],
      activePanelId: 'navigator',
      collapsed: false,
      anchorX: 'right',
      anchorY: 'bottom',
      anchorOffsetX: Math.max(PANEL_MARGIN, width - rightX - DEFAULT_PANEL_SIZE.width),
      anchorOffsetY: 12,
      x: rightX,
      y: navigatorY,
      z: 10,
    },
    {
      id: 'diagnostics',
      panelIds: ['diagnostics'],
      activePanelId: 'diagnostics',
      collapsed: false,
      anchorX: 'right',
      anchorY: 'bottom',
      anchorOffsetX: Math.max(PANEL_MARGIN, width - rightX - DEFAULT_PANEL_SIZE.width),
      anchorOffsetY: Math.max(PANEL_MARGIN, height - diagnosticsY - DEFAULT_PANEL_SIZE.height),
      x: rightX,
      y: diagnosticsY,
      z: 9,
    },
  ]
}

function defaultRightPanelX(width: number): number {
  return Math.max(12, width - DEFAULT_PANEL_SIZE.width - PANEL_RIGHT_GUTTER)
}

function workspaceBounds(workspaceRef: ShallowRef<HTMLElement | undefined>): WorkspaceBounds {
  const rect = workspaceRef.value?.getBoundingClientRect()
  return {
    width: rect?.width ?? 1280,
    height: rect?.height ?? 720,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

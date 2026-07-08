<script setup lang="ts">
import type { SitePainterPanelId } from '~/types/painter-app'
import type { SitePainterPanelItem, SitePainterShellEmits, SitePainterShellProps } from '~/types/painter-shell'
import type { SiteDesktopPainterPanelGroup } from '~/composables/useDesktopPainterPanels'
import { useDesktopPainterPanels } from '~/composables/useDesktopPainterPanels'

const props = defineProps<SitePainterShellProps>()
const emit = defineEmits<SitePainterShellEmits>()

const PANEL_ITEMS: SitePainterPanelItem[] = [
  { id: 'options', icon: 'i-ph-sliders-horizontal' },
  { id: 'controls', icon: 'i-ph-palette' },
  { id: 'layers', icon: 'i-ph-stack' },
  { id: 'navigator', icon: 'i-ph-map-trifold' },
  { id: 'diagnostics', icon: 'i-ph-activity' },
]

const {
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
} = useDesktopPainterPanels({
  availablePanels: () => props.availablePanels,
  panelItems: PANEL_ITEMS,
  panelVisibility: () => props.panelVisibility,
  setPanelVisible: (panelId, visible) => emit('setPanelVisible', panelId, visible),
})

function panelActionTitle(group: SiteDesktopPainterPanelGroup, action: keyof typeof props.panelActionLabels): string {
  return `${props.panelActionLabels[action]}: ${props.panelLabels[group.activePanelId]}`
}

function panelPaneId(groupId: string, panelId: SitePainterPanelId): string {
  return `site-painter-panel-pane-${groupId}-${panelId}`
}

function panelTabId(groupId: string, panelId: SitePainterPanelId): string {
  return `site-painter-panel-tab-${groupId}-${panelId}`
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

    <main ref="workspaceRef" class="site-painter__workspace">
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
                :id="panelTabId(group.id, panel.id)"
                :key="panel.id"
                type="button"
                class="site-painter-panel__tab"
                :class="{ 'is-active': group.activePanelId === panel.id }"
                :aria-controls="panelPaneId(group.id, panel.id)"
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
              :id="panelPaneId(group.id, 'options')"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="panelTabId(group.id, 'options')"
            >
              <slot name="options" />
            </div>

            <div
              v-if="isPanelInGroup(group, 'controls')"
              v-show="group.activePanelId === 'controls'"
              :id="panelPaneId(group.id, 'controls')"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="panelTabId(group.id, 'controls')"
            >
              <slot name="controls" />
            </div>

            <div
              v-if="isPanelInGroup(group, 'layers')"
              v-show="group.activePanelId === 'layers'"
              :id="panelPaneId(group.id, 'layers')"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="panelTabId(group.id, 'layers')"
            >
              <slot name="layers" />
            </div>

            <div
              v-if="isPanelInGroup(group, 'navigator')"
              v-show="group.activePanelId === 'navigator'"
              :id="panelPaneId(group.id, 'navigator')"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="panelTabId(group.id, 'navigator')"
            >
              <slot name="navigator" />
            </div>

            <div
              v-if="isPanelInGroup(group, 'diagnostics')"
              v-show="group.activePanelId === 'diagnostics'"
              :id="panelPaneId(group.id, 'diagnostics')"
              class="site-painter-panel__pane"
              role="tabpanel"
              :aria-labelledby="panelTabId(group.id, 'diagnostics')"
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
  width: min(344px, calc(100vw - 16px));
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
.site-painter-panel__pane :deep(.painter-navigator),
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

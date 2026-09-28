<script setup lang="ts">
import type { SiteDesktopPainterPanelGroup } from '~/composables/useDesktopPainterPanels'
import type { SiteLocale } from '~/composables/useSiteI18n'
import type { SitePainterPanelId } from '~/types/painter-app'
import type { SitePainterPanelItem, SitePainterShellEmits, SitePainterShellProps } from '~/types/painter-shell'
import PainterIconButton from '@saier/vue/components/PainterIconButton.vue'
import PainterPanelHeader from '@saier/vue/components/PainterPanelHeader.vue'
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
  panelItems: () => [...PANEL_ITEMS, ...(props.extensionPanels ?? [])],
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

function selectLocale(event: MouseEvent, locale: SiteLocale): void {
  emit('setLocale', locale)
  const details = (event.currentTarget as HTMLElement).closest('details')
  details?.removeAttribute('open')
}
</script>

<template>
  <div class="site-painter" :class="{ 'is-activity': workspaceKind === 'activity' }">
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
          <div class="site-painter__theme">
            <slot name="theme" />
          </div>
          <details class="site-painter__locale-menu">
            <summary class="site-painter__locale" :aria-label="languageLabel">
              <span class="site-painter__locale-label">{{ languageLabel }}</span>
              <strong>{{ currentLocaleLabel }}</strong>
              <span class="i-ph-caret-down" aria-hidden="true" />
            </summary>
            <div class="site-painter__locale-options" role="menu">
              <button
                v-for="option in localeOptions"
                :key="option.code"
                type="button"
                class="site-painter__locale-option"
                :class="{ 'is-active': option.code === locale }"
                :aria-checked="option.code === locale"
                role="menuitemradio"
                @click="selectLocale($event, option.code)"
              >
                <span class="site-painter__locale-check i-ph-check" aria-hidden="true" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </details>
        </div>
      </div>

      <div v-if="workspaceKind === 'document'" class="site-painter__toolbar">
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

      <div v-show="workspaceKind === 'document'" class="site-painter__panel-stage" aria-live="off">
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
          <PainterPanelHeader class="site-painter-panel__header" @pointerdown="startPanelDrag($event, group.id)">
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

            <template #actions>
              <slot name="panel-actions" :panel-id="group.activePanelId" />
              <PainterIconButton
                size="sm"
                class="site-painter-panel__icon"
                :title="panelActionTitle(group, group.collapsed ? 'expand' : 'collapse')"
                :aria-label="panelActionTitle(group, group.collapsed ? 'expand' : 'collapse')"
                :aria-expanded="!group.collapsed"
                @click.stop="togglePanelGroupCollapsed(group.id)"
                @pointerdown.stop
              >
                <span :class="group.collapsed ? 'i-ph-caret-down' : 'i-ph-caret-up'" aria-hidden="true" />
              </PainterIconButton>
              <PainterIconButton
                v-if="group.panelIds.length > 1"
                size="sm"
                class="site-painter-panel__icon"
                :title="panelActionTitle(group, 'detach')"
                :aria-label="panelActionTitle(group, 'detach')"
                @click.stop="detachActivePanel(group.id)"
                @pointerdown.stop
              >
                <span class="i-ph-arrows-out-cardinal" aria-hidden="true" />
              </PainterIconButton>
              <PainterIconButton
                size="sm"
                class="site-painter-panel__icon"
                :title="panelActionTitle(group, 'hide')"
                :aria-label="panelActionTitle(group, 'hide')"
                @click.stop="hideActivePanel(group.id)"
                @pointerdown.stop
              >
                <span class="i-ph-eye-slash" aria-hidden="true" />
              </PainterIconButton>
            </template>
          </PainterPanelHeader>

          <div v-show="!group.collapsed" class="site-painter-panel__body">
            <template v-for="panel in extensionPanels" :key="panel.id">
              <div
                v-if="isPanelInGroup(group, panel.id)" v-show="group.activePanelId === panel.id"
                :id="panelPaneId(group.id, panel.id)" class="site-painter-panel__pane" role="tabpanel" :aria-labelledby="panelTabId(group.id, panel.id)"
              >
                <slot :name="panel.id" />
              </div>
            </template>
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
        <PainterPanelHeader :title="exportPreviewLabel">
          <template #actions>
            <PainterIconButton size="sm" :title="closePreviewLabel" icon="i-ph-x" @click="emit('closePreview')" />
          </template>
        </PainterPanelHeader>
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
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  background: var(--saier-color-app-background);
  color: var(--saier-color-text);
}

.site-painter.is-activity {
  grid-template-rows: auto minmax(0, 1fr);
}

.site-painter__chrome {
  display: grid;
  min-width: 0;
  grid-template-rows: repeat(3, var(--saier-chrome-row-height));
  border-bottom: 1px solid var(--saier-color-border);
  background: var(--saier-color-chrome);
}

.site-painter.is-activity .site-painter__chrome {
  grid-template-rows: repeat(2, var(--saier-chrome-row-height));
}

.site-painter__topbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding-inline: var(--saier-space-3);
}

.site-painter__primary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
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
  width: var(--saier-control-size);
  height: var(--saier-control-size);
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
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
  font-family: var(--saier-font-brand);
  font-size: 14px;
  font-weight: 600;
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
  border-top: 1px solid var(--saier-color-border);
  display: flex;
  min-width: 0;
  align-items: center;
  padding-inline: var(--saier-space-3);
  overflow: hidden;
}

.site-painter__documents {
  background: var(--saier-color-panel);
  border-top: 1px solid var(--saier-color-border);
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  align-items: center;
  padding-inline: var(--saier-space-3);
  overflow: hidden;
}

.site-painter__actions {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}

.site-painter__account {
  display: inline-flex;
  min-width: 0;
}

.site-painter__theme {
  display: inline-flex;
  flex: 0 0 auto;
}

.site-painter__account:empty,
.site-painter__theme:empty {
  display: none;
}

.site-painter__status {
  overflow: hidden;
  max-width: 280px;
  color: var(--saier-color-text-subtle);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-painter__locale-menu {
  position: relative;
  flex: 0 0 auto;
}

.site-painter__locale {
  display: inline-flex;
  height: var(--saier-control-size);
  align-items: center;
  gap: 8px;
  border: 1px solid var(--saier-color-border);
  border-radius: var(--saier-radius-control);
  background: transparent;
  color: var(--saier-color-text);
  cursor: pointer;
  font-size: 12px;
  list-style: none;
  padding-inline: 12px;
}

.site-painter__locale::-webkit-details-marker {
  display: none;
}

.site-painter__locale-menu[open] .site-painter__locale {
  border-color: var(--saier-color-accent-border);
  background: var(--saier-color-surface-hover);
}

.site-painter__locale:focus-visible,
.site-painter__locale-option:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

.site-painter__locale strong {
  font-weight: 650;
}

.site-painter__locale-options {
  position: absolute;
  z-index: 80;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  min-width: 136px;
  gap: 2px;
  border: 1px solid var(--saier-color-border);
  border-radius: var(--saier-radius-panel);
  background: var(--saier-color-panel-raised);
  box-shadow: var(--saier-shadow-panel);
  padding: 4px;
}

.site-painter__locale-option {
  display: grid;
  height: 30px;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--saier-color-text-muted);
  font-size: 12px;
  padding: 0 8px;
  text-align: left;
}

.site-painter__locale-option:hover,
.site-painter__locale-option.is-active {
  background: var(--saier-color-surface-hover);
  color: var(--saier-color-text);
}

.site-painter__locale-check {
  visibility: hidden;
}

.site-painter__locale-option.is-active .site-painter__locale-check {
  visibility: visible;
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
  background: var(--saier-color-workspace);
}

.site-painter__canvas-host :slotted(.site-stroke-replay-canvas) {
  position: absolute;
  z-index: 30;
  inset: 0;
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
  width: min(var(--saier-panel-width), calc(100vw - 16px));
  min-width: 0;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid var(--saier-color-border);
  border-radius: var(--saier-radius-panel);
  background: var(--saier-color-panel);
  box-shadow: var(--saier-shadow-panel);
  color: var(--saier-color-text);
  pointer-events: auto;
}

.site-painter-panel.is-active {
  border-color: var(--saier-color-border-strong);
}

.site-painter-panel.is-dragging {
  border-color: var(--saier-color-accent-border);
}

.site-painter-panel.is-dragging {
  opacity: 0.94;
}

.site-painter-panel.is-collapsed {
  grid-template-rows: auto;
}

.site-painter-panel__header {
  background: var(--saier-color-chrome);
  cursor: grab;
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
  gap: var(--saier-space-1);
  overflow-x: auto;
  scrollbar-width: none;
}

.site-painter-panel__tabs::-webkit-scrollbar {
  display: none;
}

.site-painter-panel__tab {
  display: inline-flex;
  min-width: 0;
  height: var(--saier-control-size-sm);
  flex: 0 1 auto;
  align-items: center;
  gap: var(--saier-space-1);
  border: 1px solid transparent;
  border-radius: 5px;
  background: transparent;
  color: var(--saier-color-text-muted);
  font-size: 12px;
  padding-inline: var(--saier-space-1);
}

.site-painter-panel__tab.is-active {
  color: var(--saier-color-text);
}

.site-painter-panel__tabs:has(.site-painter-panel__tab:nth-child(2)) .site-painter-panel__tab.is-active {
  background: var(--saier-color-surface-hover);
  box-shadow: inset 0 -2px var(--saier-color-accent);
}

.site-painter-panel__tab:focus-visible,
.site-painter-panel__icon:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

.site-painter-panel__tab-label {
  overflow: hidden;
  min-width: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-painter-panel__body {
  scrollbar-width: thin;
  scrollbar-color: var(--saier-color-border-strong) transparent;
  min-width: 0;
  max-height: var(--saier-panel-max-height);
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
  color: var(--saier-color-text-muted);
  font-size: 14px;
  transform: translate(-50%, -50%);
}

.site-painter__preview {
  right: 12px;
  bottom: 12px;
  width: min(280px, calc(100vw - 24px));
  overflow: hidden;
  border: 1px solid var(--saier-color-border);
  border-radius: var(--saier-radius-panel);
  background: var(--saier-color-panel);
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
    grid-template-rows: auto minmax(0, 1fr);
  }

  .site-painter__chrome {
    grid-template-rows: repeat(3, var(--saier-chrome-row-height));
  }

  .site-painter__brand-copy,
  .site-painter__locale-label {
    display: none;
  }

  .site-painter__brand {
    width: var(--saier-control-size);
  }

  .site-painter__logo {
    overflow: hidden;
  }

  .site-painter__primary {
    gap: 6px;
  }

  .site-painter__toolbar {
    border-top: 1px solid var(--saier-color-border);
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

<script setup lang="ts">
import type { SiteLocale } from '~/composables/useSiteI18n'
import type { SitePainterPanelId } from '~/types/painter-app'
import type { SitePainterPanelItem, SitePainterShellEmits, SitePainterShellProps } from '~/types/painter-shell'
import { computed, shallowRef, watch } from 'vue'

const props = defineProps<SitePainterShellProps>()
const emit = defineEmits<SitePainterShellEmits>()

const PANEL_ITEMS: SitePainterPanelItem[] = [
  { id: 'options', icon: 'i-ph-sliders-horizontal' },
  { id: 'controls', icon: 'i-ph-palette' },
  { id: 'layers', icon: 'i-ph-stack' },
  { id: 'navigator', icon: 'i-ph-map-trifold' },
  { id: 'diagnostics', icon: 'i-ph-activity' },
]

const activePanelId = shallowRef<SitePainterPanelId>('options')
const sheetOpen = shallowRef(false)

const mobilePanels = computed(() =>
  PANEL_ITEMS.filter(panel => props.availablePanels.includes(panel.id)),
)
const activePanel = computed(() =>
  mobilePanels.value.find(panel => panel.id === activePanelId.value) ?? mobilePanels.value[0],
)

watch(
  mobilePanels,
  (panels) => {
    if (panels.length === 0) {
      sheetOpen.value = false
      return
    }

    if (!panels.some(panel => panel.id === activePanelId.value))
      activePanelId.value = panels[0]!.id
  },
  { immediate: true },
)

function closeSheet(): void {
  sheetOpen.value = false
}

function isPanelAvailable(panelId: SitePainterPanelId): boolean {
  return props.availablePanels.includes(panelId)
}

function openPanel(panelId: SitePainterPanelId): void {
  activePanelId.value = panelId
  sheetOpen.value = true

  if (!props.panelVisibility[panelId])
    emit('setPanelVisible', panelId, true)
}

function panelPaneId(panelId: SitePainterPanelId): string {
  return `site-mobile-painter-panel-pane-${panelId}`
}

function panelTabId(panelId: SitePainterPanelId): string {
  return `site-mobile-painter-panel-tab-${panelId}`
}

function togglePanel(panelId: SitePainterPanelId): void {
  if (sheetOpen.value && activePanelId.value === panelId) {
    closeSheet()
    return
  }

  openPanel(panelId)
}

function selectLocale(event: MouseEvent, locale: SiteLocale): void {
  emit('setLocale', locale)
  const details = (event.currentTarget as HTMLElement).closest('details')
  details?.removeAttribute('open')
}
</script>

<template>
  <div class="site-mobile-painter">
    <header class="site-mobile-painter__topbar">
      <div class="site-mobile-painter__brand">
        <span class="site-mobile-painter__logo i-ri-artboard-2-line" aria-hidden="true" />
        <div class="site-mobile-painter__brand-copy">
          <h1 class="site-mobile-painter__title">
            {{ appName }}
          </h1>
          <p class="site-mobile-painter__status">
            {{ statusLabel }}
          </p>
        </div>
      </div>

      <div class="site-mobile-painter__actions">
        <div class="site-mobile-painter__account">
          <slot name="account" />
        </div>
        <details class="site-mobile-painter__locale-menu">
          <summary class="site-mobile-painter__locale" :aria-label="languageLabel">
            <span class="site-mobile-painter__locale-label">{{ languageLabel }}</span>
            <strong>{{ currentLocaleLabel }}</strong>
            <span class="i-ph-caret-down" aria-hidden="true" />
          </summary>
          <div class="site-mobile-painter__locale-options" role="menu">
            <button
              v-for="option in localeOptions"
              :key="option.code"
              type="button"
              class="site-mobile-painter__locale-option"
              :class="{ 'is-active': option.code === locale }"
              :aria-checked="option.code === locale"
              role="menuitemradio"
              @click="selectLocale($event, option.code)"
            >
              <span class="site-mobile-painter__locale-check i-ph-check" aria-hidden="true" />
              <span>{{ option.label }}</span>
            </button>
          </div>
        </details>
      </div>
    </header>

    <div class="site-mobile-painter__documents">
      <slot name="documents" />
    </div>

    <div class="site-mobile-painter__menu">
      <slot name="menubar" />
    </div>

    <main class="site-mobile-painter__workspace">
      <div class="site-mobile-painter__canvas-host">
        <slot name="canvas" />
      </div>

      <div v-if="loading" class="site-mobile-painter__loading">
        {{ loadingLabel }}
      </div>

      <aside v-if="exportPreview" class="site-mobile-painter__preview">
        <header class="site-mobile-painter__preview-header">
          <span>{{ exportPreviewLabel }}</span>
          <button type="button" class="site-mobile-painter__preview-close" :title="closePreviewLabel" @click="emit('closePreview')">
            <span class="i-ph-x" />
          </button>
        </header>
        <img class="site-mobile-painter__preview-image" :src="exportPreview" :alt="exportPreviewLabel">
      </aside>

      <section
        v-if="sheetOpen && activePanel"
        class="site-mobile-painter__sheet"
        :aria-label="panelLabels[activePanel.id]"
      >
        <header class="site-mobile-painter__sheet-header">
          <div class="site-mobile-painter__sheet-tabs" role="tablist">
            <button
              v-for="panel in mobilePanels"
              :id="panelTabId(panel.id)"
              :key="panel.id"
              type="button"
              class="site-mobile-painter__sheet-tab"
              :class="{ 'is-active': activePanel.id === panel.id }"
              :aria-controls="panelPaneId(panel.id)"
              :aria-selected="activePanel.id === panel.id"
              role="tab"
              @click="openPanel(panel.id)"
            >
              <span :class="panel.icon" aria-hidden="true" />
              <span>{{ panelLabels[panel.id] }}</span>
            </button>
          </div>

          <button
            type="button"
            class="site-mobile-painter__sheet-close"
            :title="panelActionLabels.hide"
            @click="closeSheet"
          >
            <span class="i-ph-x" />
          </button>
        </header>

        <div class="site-mobile-painter__sheet-body">
          <div
            v-if="isPanelAvailable('options')"
            v-show="activePanel.id === 'options'"
            :id="panelPaneId('options')"
            class="site-mobile-painter__panel-pane"
            role="tabpanel"
            :aria-labelledby="panelTabId('options')"
          >
            <slot name="options" />
          </div>

          <div
            v-if="isPanelAvailable('controls')"
            v-show="activePanel.id === 'controls'"
            :id="panelPaneId('controls')"
            class="site-mobile-painter__panel-pane"
            role="tabpanel"
            :aria-labelledby="panelTabId('controls')"
          >
            <slot name="controls" />
          </div>

          <div
            v-if="isPanelAvailable('layers')"
            v-show="activePanel.id === 'layers'"
            :id="panelPaneId('layers')"
            class="site-mobile-painter__panel-pane"
            role="tabpanel"
            :aria-labelledby="panelTabId('layers')"
          >
            <slot name="layers" />
          </div>

          <div
            v-if="isPanelAvailable('navigator')"
            v-show="activePanel.id === 'navigator'"
            :id="panelPaneId('navigator')"
            class="site-mobile-painter__panel-pane"
            role="tabpanel"
            :aria-labelledby="panelTabId('navigator')"
          >
            <slot name="navigator" />
          </div>

          <div
            v-if="isPanelAvailable('diagnostics')"
            v-show="activePanel.id === 'diagnostics'"
            :id="panelPaneId('diagnostics')"
            class="site-mobile-painter__panel-pane"
            role="tabpanel"
            :aria-labelledby="panelTabId('diagnostics')"
          >
            <slot name="diagnostics" />
          </div>
        </div>
      </section>
    </main>

    <footer class="site-mobile-painter__dock">
      <div class="site-mobile-painter__toolbar">
        <slot name="toolbar" />
      </div>

      <nav class="site-mobile-painter__panel-nav" :aria-label="tagline">
        <button
          v-for="panel in mobilePanels"
          :key="panel.id"
          type="button"
          class="site-mobile-painter__panel-button"
          :class="{ 'is-active': sheetOpen && activePanel && activePanel.id === panel.id }"
          :aria-pressed="sheetOpen && activePanel && activePanel.id === panel.id"
          :title="panelLabels[panel.id]"
          @click="togglePanel(panel.id)"
        >
          <span :class="panel.icon" aria-hidden="true" />
          <span>{{ panelLabels[panel.id] }}</span>
        </button>
      </nav>
    </footer>
  </div>
</template>

<style scoped>
.site-mobile-painter {
  display: grid;
  height: 100dvh;
  min-height: 0;
  grid-template-rows: auto auto auto minmax(0, 1fr) auto;
  overflow: hidden;
  background: #202124;
  color: white;
}

.site-mobile-painter__topbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: calc(env(safe-area-inset-top) + 8px) 10px 8px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
  background: rgb(15 16 18 / 96%);
}

.site-mobile-painter__brand {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.site-mobile-painter__logo {
  width: 26px;
  height: 26px;
  flex: 0 0 auto;
}

.site-mobile-painter__brand-copy {
  display: grid;
  min-width: 0;
  gap: 1px;
}

.site-mobile-painter__title {
  overflow: hidden;
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  line-height: 17px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-mobile-painter__status {
  overflow: hidden;
  max-width: min(58vw, 360px);
  margin: 0;
  color: rgb(255 255 255 / 54%);
  font-size: 11px;
  line-height: 14px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-mobile-painter__actions {
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
}

.site-mobile-painter__account {
  min-width: 0;
}

.site-mobile-painter__account:empty {
  display: none;
}

.site-mobile-painter__locale-menu {
  position: relative;
  flex: 0 0 auto;
}

.site-mobile-painter__locale {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 7px;
  background: rgb(255 255 255 / 8%);
  color: white;
  cursor: pointer;
  font-size: 11px;
  list-style: none;
  padding-inline: 9px;
}

.site-mobile-painter__locale::-webkit-details-marker {
  display: none;
}

.site-mobile-painter__locale-menu[open] .site-mobile-painter__locale {
  border-color: rgb(147 197 253 / 34%);
  background: rgb(255 255 255 / 12%);
}

.site-mobile-painter__locale:focus-visible,
.site-mobile-painter__locale-option:focus-visible {
  outline: 2px solid rgb(147 197 253 / 72%);
  outline-offset: 1px;
}

.site-mobile-painter__locale strong {
  font-weight: 700;
}

.site-mobile-painter__locale-options {
  position: absolute;
  z-index: 80;
  top: calc(100% + 6px);
  right: 0;
  display: grid;
  min-width: 128px;
  gap: 2px;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 8px;
  background: rgb(20 21 24 / 96%);
  box-shadow: 0 16px 42px rgb(0 0 0 / 28%);
  padding: 4px;
}

.site-mobile-painter__locale-option {
  display: grid;
  height: 30px;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: rgb(255 255 255 / 72%);
  font-size: 12px;
  padding: 0 8px;
  text-align: left;
}

.site-mobile-painter__locale-option:hover,
.site-mobile-painter__locale-option.is-active {
  background: rgb(255 255 255 / 9%);
  color: white;
}

.site-mobile-painter__locale-check {
  visibility: hidden;
}

.site-mobile-painter__locale-option.is-active .site-mobile-painter__locale-check {
  visibility: visible;
}

.site-mobile-painter__documents,
.site-mobile-painter__menu {
  min-width: 0;
  overflow-x: auto;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
  background: rgb(20 21 24 / 94%);
  scrollbar-width: none;
}

.site-mobile-painter__documents {
  padding: 6px 8px;
}

.site-mobile-painter__menu {
  padding: 4px 8px 5px;
}

.site-mobile-painter__documents::-webkit-scrollbar,
.site-mobile-painter__menu::-webkit-scrollbar {
  display: none;
}

.site-mobile-painter__workspace {
  position: relative;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.site-mobile-painter__canvas-host,
.site-mobile-painter__canvas-host :slotted(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.site-mobile-painter__canvas-host :slotted(canvas) {
  background: #303136;
}

.site-mobile-painter__loading {
  position: absolute;
  z-index: 40;
  inset: 0;
  display: grid;
  place-items: center;
  background: rgb(20 21 24 / 70%);
  color: rgb(255 255 255 / 72%);
  font-size: 13px;
}

.site-mobile-painter__preview {
  position: absolute;
  z-index: 45;
  top: 12px;
  right: 10px;
  display: grid;
  width: min(172px, calc(100vw - 20px));
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 8px;
  background: rgb(15 16 18 / 92%);
  box-shadow: 0 18px 40px rgb(0 0 0 / 28%);
}

.site-mobile-painter__preview-header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 8px;
  color: rgb(255 255 255 / 78%);
  font-size: 11px;
}

.site-mobile-painter__preview-close,
.site-mobile-painter__sheet-close {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 74%);
  font-size: 15px;
}

.site-mobile-painter__preview-image {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
  background: #fff;
}

.site-mobile-painter__sheet {
  position: absolute;
  z-index: 50;
  right: 8px;
  bottom: 8px;
  left: 8px;
  display: grid;
  max-height: min(62dvh, 520px);
  min-height: 168px;
  grid-template-rows: auto minmax(0, 1fr);
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 8px;
  background: rgb(17 18 21 / 96%);
  box-shadow: 0 -18px 48px rgb(0 0 0 / 34%);
}

.site-mobile-painter__sheet-header {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 8px 8px 6px;
  border-bottom: 1px solid rgb(255 255 255 / 8%);
}

.site-mobile-painter__sheet-tabs {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: none;
}

.site-mobile-painter__sheet-tabs::-webkit-scrollbar {
  display: none;
}

.site-mobile-painter__sheet-tab {
  display: inline-flex;
  height: 30px;
  max-width: 132px;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 7px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 66%);
  font-size: 12px;
  padding-inline: 9px;
}

.site-mobile-painter__sheet-tab span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-mobile-painter__sheet-tab.is-active {
  border-color: rgb(96 165 250 / 52%);
  background: rgb(96 165 250 / 18%);
  color: white;
}

.site-mobile-painter__sheet-body,
.site-mobile-painter__panel-pane {
  min-width: 0;
  min-height: 0;
}

.site-mobile-painter__sheet-body {
  overflow: hidden;
}

.site-mobile-painter__panel-pane {
  height: 100%;
  overflow: auto;
  padding: 8px;
}

.site-mobile-painter__dock {
  display: grid;
  min-width: 0;
  gap: 6px;
  padding: 6px 8px calc(env(safe-area-inset-bottom) + 8px);
  border-top: 1px solid rgb(255 255 255 / 10%);
  background: rgb(15 16 18 / 97%);
}

.site-mobile-painter__toolbar {
  min-width: 0;
  overflow-x: auto;
  scrollbar-width: none;
}

.site-mobile-painter__toolbar::-webkit-scrollbar {
  display: none;
}

.site-mobile-painter__toolbar :deep(.site-toolbar) {
  width: max-content;
  max-width: none;
}

.site-mobile-painter__panel-nav {
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(auto-fit, minmax(58px, 1fr));
  gap: 6px;
}

.site-mobile-painter__panel-button {
  display: grid;
  height: 44px;
  min-width: 0;
  place-items: center;
  grid-template-rows: 18px 13px;
  gap: 3px;
  border: 1px solid rgb(255 255 255 / 9%);
  border-radius: 7px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 68%);
  padding: 5px 4px;
}

.site-mobile-painter__panel-button span:first-child {
  font-size: 18px;
}

.site-mobile-painter__panel-button span:last-child {
  max-width: 100%;
  overflow: hidden;
  font-size: 10px;
  line-height: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-mobile-painter__panel-button.is-active {
  border-color: rgb(52 211 153 / 50%);
  background: rgb(52 211 153 / 16%);
  color: white;
}

@media (max-width: 420px) {
  .site-mobile-painter__status {
    max-width: 42vw;
  }

  .site-mobile-painter__locale-label {
    display: none;
  }

  .site-mobile-painter__panel-nav {
    grid-template-columns: repeat(auto-fit, minmax(50px, 1fr));
  }

  .site-mobile-painter__panel-button {
    height: 42px;
  }
}
</style>

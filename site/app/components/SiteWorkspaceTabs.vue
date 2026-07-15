<script setup lang="ts">
import type { SiteWorkspaceTab } from '~/types/activity-plugin'

interface SiteWorkspaceTabsLabels {
  newCanvas: string
  tabs: string
  unsavedChangesTitle: string
}

defineProps<{
  disabled: boolean
  labels: SiteWorkspaceTabsLabels
  tabs: readonly SiteWorkspaceTab[]
}>()

const emit = defineEmits<{
  close: [tab: SiteWorkspaceTab]
  new: []
  switch: [tab: SiteWorkspaceTab]
}>()

function tabLabel(tab: SiteWorkspaceTab, unsavedChangesTitle: string): string {
  const base = `${tab.title}, ${tab.subtitle}`
  return tab.dirty ? `${base}, ${unsavedChangesTitle}` : base
}
</script>

<template>
  <div class="site-workspace-tabs" :aria-label="labels.tabs" role="tablist">
    <div
      v-for="tab in tabs"
      :key="tab.id"
      class="site-workspace-tab"
      :class="{
        'has-close': tab.closeable,
        'is-active': tab.active,
        'is-activity': tab.kind === 'activity',
        'is-dirty': tab.dirty,
      }"
    >
      <button
        type="button"
        class="site-workspace-tab__main"
        :aria-selected="tab.active"
        :aria-label="tabLabel(tab, labels.unsavedChangesTitle)"
        :disabled="disabled"
        role="tab"
        :title="tabLabel(tab, labels.unsavedChangesTitle)"
        @click="emit('switch', tab)"
      >
        <span class="site-workspace-tab__name-row">
          <span v-if="tab.icon" :class="tab.icon" aria-hidden="true" />
          <span class="site-workspace-tab__name">{{ tab.title }}</span>
          <span
            v-if="tab.dirty"
            class="site-workspace-tab__dirty"
            :title="labels.unsavedChangesTitle"
            aria-hidden="true"
          >*</span>
        </span>
        <span class="site-workspace-tab__subtitle">{{ tab.subtitle }}</span>
      </button>
      <button
        v-if="tab.closeable"
        type="button"
        class="site-workspace-tab__close"
        :disabled="disabled"
        :title="tab.closeLabel"
        @click.stop="emit('close', tab)"
      >
        <span class="i-ph-x" />
      </button>
    </div>

    <button
      type="button"
      class="site-workspace-tabs__new"
      :disabled="disabled"
      :title="labels.newCanvas"
      @click="emit('new')"
    >
      <span class="i-ph-plus" />
    </button>
  </div>
</template>

<style scoped>
.site-workspace-tabs {
  display: flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-block: 1px;
  scrollbar-width: none;
}

.site-workspace-tabs::-webkit-scrollbar {
  display: none;
}

.site-workspace-tab {
  box-sizing: border-box;
  display: grid;
  width: clamp(142px, 17vw, 206px);
  height: 36px;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  column-gap: 6px;
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text-muted);
  padding: 4px 9px 4px 10px;
  text-align: left;
}

.site-workspace-tab.has-close {
  grid-template-columns: minmax(0, 1fr) 24px;
  padding-right: 4px;
}

.site-workspace-tab.is-active {
  border-color: var(--saier-color-accent-border);
  background: linear-gradient(180deg, var(--saier-color-surface), transparent), var(--saier-color-accent-soft);
  color: var(--saier-color-text);
}

.site-workspace-tab.is-activity {
  border-style: dashed;
}

.site-workspace-tab.is-activity.is-active {
  border-style: solid;
}

.site-workspace-tab.is-dirty:not(.is-active) {
  border-color: var(--saier-color-warning-border);
}

.site-workspace-tab__main {
  display: grid;
  min-width: 0;
  height: 100%;
  align-content: center;
  grid-template-rows: 16px 12px;
  row-gap: 1px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: inherit;
  padding: 0;
  cursor: pointer;
  text-align: left;
}

.site-workspace-tab__name-row {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  line-height: 16px;
}

.site-workspace-tab__name,
.site-workspace-tab__subtitle {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-workspace-tab__name {
  flex: 0 1 auto;
  font-size: 12px;
  font-weight: 650;
}

.site-workspace-tab__dirty {
  flex: 0 0 auto;
  color: var(--saier-color-warning);
  font-size: 13px;
  font-weight: 750;
  line-height: 1;
}

.site-workspace-tab.is-active .site-workspace-tab__dirty {
  color: var(--saier-color-warning-text);
}

.site-workspace-tab__subtitle {
  grid-column: 1;
  color: var(--saier-color-text-subtle);
  font-size: 10px;
  line-height: 12px;
}

.site-workspace-tab__close,
.site-workspace-tabs__new {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  color: var(--saier-color-text-muted);
}

.site-workspace-tab__close {
  width: 24px;
  height: 24px;
  font-size: 13px;
}

.site-workspace-tabs__new {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  background: var(--saier-color-surface);
  font-size: 16px;
}

.site-workspace-tab__close:hover,
.site-workspace-tabs__new:hover {
  border-color: var(--saier-color-border);
  background: var(--saier-color-surface-hover);
  color: var(--saier-color-text);
}

.site-workspace-tab__main:focus-visible,
.site-workspace-tab__close:focus-visible,
.site-workspace-tabs__new:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

.site-workspace-tab__main:disabled,
.site-workspace-tab__close:disabled,
.site-workspace-tabs__new:disabled {
  color: var(--saier-color-text-disabled);
  pointer-events: none;
}
</style>

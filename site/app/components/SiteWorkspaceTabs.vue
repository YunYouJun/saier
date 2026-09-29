<script setup lang="ts">
import type { SiteWorkspaceTab } from '~/types/activity-plugin'
import PainterIconButton from '@saier/vue/components/PainterIconButton.vue'

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
          >•</span>
        </span>
        <span class="site-workspace-tab__subtitle">{{ tab.subtitle }}</span>
      </button>
      <PainterIconButton
        v-if="tab.closeable"
        size="sm"
        class="site-workspace-tab__close"
        :disabled="disabled"
        :title="tab.closeLabel"
        icon="i-ph-x"
        @click.stop="emit('close', tab)"
      />
    </div>

    <PainterIconButton
      size="md"
      class="site-workspace-tabs__new"
      :disabled="disabled"
      :title="labels.newCanvas"
      icon="i-ph-plus"
      @click="emit('new')"
    />
  </div>
</template>

<style scoped>
.site-workspace-tabs {
  display: flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: var(--saier-space-1);
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
  height: var(--saier-control-size);
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  column-gap: var(--saier-space-1);
  border: 1px solid transparent;
  border-radius: var(--saier-radius-control);
  background: transparent;
  color: var(--saier-color-text-muted);
  padding-inline: var(--saier-space-2);
  text-align: left;
}

.site-workspace-tab.has-close {
  grid-template-columns: minmax(0, 1fr) var(--saier-control-size-sm);
  padding-right: 4px;
}

.site-workspace-tab.is-active {
  background: var(--saier-color-field);
  border-color: var(--saier-color-border);
  box-shadow: 0 1px 2px rgb(0 0 0 / 4%);
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
  display: flex;
  min-width: 0;
  height: 100%;
  align-items: center;
  justify-content: space-between;
  gap: var(--saier-space-2);
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
  font-weight: var(--saier-font-weight-label);
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
  flex: 0 1 auto;
  color: var(--saier-color-text-subtle);
  font-size: var(--saier-font-size-caption);
  line-height: 12px;
}

.site-workspace-tab__main:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

.site-workspace-tab__main:disabled {
  color: var(--saier-color-text-disabled);
  pointer-events: none;
}
</style>

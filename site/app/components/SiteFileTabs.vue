<script setup lang="ts">
import type { PainterDocumentState } from 'saier'

interface SiteFileTabsLabels {
  tabs: string
  newCanvas: string
  closeDocument: string
  size: string
  unsavedChangesTitle: string
}

const props = defineProps<{
  documents: PainterDocumentState[]
  disabled: boolean
  labels: SiteFileTabsLabels
}>()

const emit = defineEmits<{
  new: []
  switch: [id: string]
  close: [id: string]
}>()

function sizeLabel(document: PainterDocumentState): string {
  return `${document.width} x ${document.height}`
}

function tabLabel(document: PainterDocumentState): string {
  const base = `${document.name}, ${sizeLabel(document)}`
  return document.dirty
    ? `${base}, ${props.labels.unsavedChangesTitle}`
    : base
}
</script>

<template>
  <div class="site-file-tabs" :aria-label="labels.tabs">
    <div
      v-for="document in documents"
      :key="document.id"
      class="site-file-tab"
      :class="{ 'has-close': documents.length > 1, 'is-active': document.active, 'is-dirty': document.dirty }"
    >
      <button
        type="button"
        class="site-file-tab__main"
        :aria-current="document.active ? 'page' : undefined"
        :aria-label="tabLabel(document)"
        :disabled="disabled"
        :title="tabLabel(document)"
        @click="emit('switch', document.id)"
      >
        <span class="site-file-tab__name-row">
          <span class="site-file-tab__name">{{ document.name }}</span>
          <span
            v-if="document.dirty"
            class="site-file-tab__dirty"
            :title="labels.unsavedChangesTitle"
            aria-hidden="true"
          >*</span>
        </span>
        <span class="site-file-tab__size">{{ sizeLabel(document) }}</span>
      </button>
      <button
        v-if="documents.length > 1"
        type="button"
        class="site-file-tab__close"
        :disabled="disabled"
        :title="labels.closeDocument"
        @click.stop="emit('close', document.id)"
      >
        <span class="i-ph-x" />
      </button>
    </div>

    <button
      type="button"
      class="site-file-tabs__new"
      :disabled="disabled"
      :title="labels.newCanvas"
      @click="emit('new')"
    >
      <span class="i-ph-plus" />
    </button>
  </div>
</template>

<style scoped>
.site-file-tabs {
  display: flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 6px;
  overflow-x: auto;
  padding-block: 1px;
  scrollbar-width: none;
}

.site-file-tabs::-webkit-scrollbar {
  display: none;
}

.site-file-tab {
  box-sizing: border-box;
  display: grid;
  width: clamp(142px, 17vw, 206px);
  height: 36px;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr);
  align-items: center;
  column-gap: 6px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 66%);
  padding: 4px 9px 4px 10px;
  text-align: left;
}

.site-file-tab.has-close {
  grid-template-columns: minmax(0, 1fr) 24px;
  padding-right: 4px;
}

.site-file-tab.is-active {
  border-color: rgb(96 165 250 / 52%);
  background:
    linear-gradient(180deg, rgb(255 255 255 / 7%), transparent),
    rgb(96 165 250 / 16%);
  color: white;
}

.site-file-tab.is-dirty:not(.is-active) {
  border-color: rgb(251 191 36 / 24%);
}

.site-file-tab__main {
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

.site-file-tab__name-row {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  line-height: 16px;
}

.site-file-tab__name,
.site-file-tab__size {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-file-tab__name {
  flex: 0 1 auto;
  font-size: 12px;
  font-weight: 650;
}

.site-file-tab__dirty {
  flex: 0 0 auto;
  color: #fbbf24;
  font-size: 13px;
  font-weight: 750;
  line-height: 1;
}

.site-file-tab.is-active .site-file-tab__dirty {
  color: #fde68a;
}

.site-file-tab__size {
  grid-column: 1;
  color: rgb(255 255 255 / 42%);
  font-size: 10px;
  line-height: 12px;
}

.site-file-tab__close,
.site-file-tabs__new {
  box-sizing: border-box;
  display: grid;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 5px;
  color: rgb(255 255 255 / 68%);
}

.site-file-tab__close {
  width: 24px;
  height: 24px;
  font-size: 13px;
}

.site-file-tabs__new {
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  background: rgb(255 255 255 / 7%);
  font-size: 16px;
}

.site-file-tab__close:hover,
.site-file-tabs__new:hover {
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 10%);
  color: white;
}

.site-file-tab__main:focus-visible,
.site-file-tab__close:focus-visible,
.site-file-tabs__new:focus-visible {
  outline: 2px solid rgb(147 197 253 / 72%);
  outline-offset: 1px;
}

.site-file-tab__main:disabled,
.site-file-tab__close:disabled,
.site-file-tabs__new:disabled {
  color: rgb(255 255 255 / 25%);
  pointer-events: none;
}
</style>

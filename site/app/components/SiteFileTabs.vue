<script setup lang="ts">
import type { PainterDocumentState } from 'saier'

interface SiteFileTabsLabels {
  tabs: string
  newCanvas: string
  closeDocument: string
  size: string
}

defineProps<{
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
</script>

<template>
  <div class="site-file-tabs" :aria-label="labels.tabs">
    <div
      v-for="document in documents"
      :key="document.id"
      class="site-file-tab"
      :class="{ 'is-active': document.active }"
    >
      <button
        type="button"
        class="site-file-tab__main"
        :disabled="disabled"
        @click="emit('switch', document.id)"
      >
        <span class="site-file-tab__name">{{ document.name }}</span>
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
  gap: 4px;
  overflow-x: auto;
  scrollbar-width: none;
}

.site-file-tabs::-webkit-scrollbar {
  display: none;
}

.site-file-tab {
  box-sizing: border-box;
  display: grid;
  width: clamp(128px, 16vw, 188px);
  height: 34px;
  flex: 0 0 auto;
  grid-template-columns: minmax(0, 1fr) 20px;
  align-items: center;
  column-gap: 5px;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 7px;
  background: rgb(255 255 255 / 5%);
  color: rgb(255 255 255 / 66%);
  padding: 3px 5px 3px 9px;
  text-align: left;
}

.site-file-tab.is-active {
  border-color: rgb(96 165 250 / 52%);
  background: rgb(96 165 250 / 17%);
  color: white;
}

.site-file-tab__main {
  display: grid;
  min-width: 0;
  grid-template-rows: 17px 13px;
  border: 0;
  background: transparent;
  color: inherit;
  padding: 0;
  text-align: left;
}

.site-file-tab__name,
.site-file-tab__size {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-file-tab__name {
  font-size: 12px;
  font-weight: 650;
}

.site-file-tab__size {
  grid-column: 1;
  color: rgb(255 255 255 / 42%);
  font-size: 10px;
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
  width: 20px;
  height: 20px;
  font-size: 13px;
}

.site-file-tabs__new {
  width: 32px;
  height: 32px;
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

.site-file-tab__main:disabled,
.site-file-tab__close:disabled,
.site-file-tabs__new:disabled {
  color: rgb(255 255 255 / 25%);
  pointer-events: none;
}
</style>

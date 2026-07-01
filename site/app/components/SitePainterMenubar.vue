<script setup lang="ts">
import type { SiteLocale } from '~/composables/useSiteI18n'
import type { SitePainterMenuCommand, SitePainterTool } from '~/types/painter-app'
import {
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarItemIndicator,
  MenubarMenu,
  MenubarPortal,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarRoot,
  MenubarSeparator,
  MenubarSub,
  MenubarSubContent,
  MenubarSubTrigger,
  MenubarTrigger,
} from 'reka-ui'

interface SitePainterMenubarLabels {
  file: string
  newCanvas: string
  openProject: string
  saveProject: string
  importImage: string
  exportPreview: string
  download: string
  edit: string
  undo: string
  redo: string
  view: string
  zoomIn: string
  zoomOut: string
  language: string
  tools: string
  brush: string
  eraser: string
  pan: string
  image: string
  selection: string
  layers: string
  addLayer: string
  showActiveLayer: string
  moveActiveLayerUp: string
  moveActiveLayerDown: string
  removeActiveLayer: string
  english: string
  chinese: string
}

defineProps<{
  activeLayerVisible: boolean
  activeTool: SitePainterTool
  canMoveLayerDown: boolean
  canMoveLayerUp: boolean
  canRedo: boolean
  canRemoveLayer: boolean
  canUndo: boolean
  disabled: boolean
  hasActiveLayer: boolean
  labels: SitePainterMenubarLabels
  locale: SiteLocale
}>()

const emit = defineEmits<{
  command: [command: SitePainterMenuCommand]
  setActiveLayerVisible: [visible: boolean]
  setLocale: [locale: SiteLocale]
}>()

const toolCommands: { value: SitePainterTool, labelKey: 'brush' | 'eraser' | 'pan' | 'image' | 'selection', icon: string }[] = [
  { value: 'brush', labelKey: 'brush', icon: 'i-ph-paint-brush' },
  { value: 'eraser', labelKey: 'eraser', icon: 'i-ph-eraser' },
  { value: 'drag', labelKey: 'pan', icon: 'i-ph-hand' },
  { value: 'image', labelKey: 'image', icon: 'i-ph-image' },
  { value: 'selection', labelKey: 'selection', icon: 'i-ph-selection' },
]

function onLayerVisibleChange(value: boolean | 'indeterminate'): void {
  emit('setActiveLayerVisible', value === true)
}
</script>

<template>
  <MenubarRoot class="site-menubar" loop>
    <MenubarMenu value="file">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.file }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:new')">
            <span class="site-menubar__item-main">
              <span class="i-ph-file-plus" />
              <span>{{ labels.newCanvas }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:open-project')">
            <span class="site-menubar__item-main">
              <span class="i-ph-folder-open" />
              <span>{{ labels.openProject }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:save-project')">
            <span class="site-menubar__item-main">
              <span class="i-ph-floppy-disk" />
              <span>{{ labels.saveProject }}</span>
            </span>
          </MenubarItem>
          <MenubarSeparator class="site-menubar__separator" />
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:import-image')">
            <span class="site-menubar__item-main">
              <span class="i-ph-image" />
              <span>{{ labels.importImage }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:export-preview')">
            <span class="site-menubar__item-main">
              <span class="i-ph-export" />
              <span>{{ labels.exportPreview }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:download')">
            <span class="site-menubar__item-main">
              <span class="i-ph-download" />
              <span>{{ labels.download }}</span>
            </span>
          </MenubarItem>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>

    <MenubarMenu value="edit">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.edit }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarItem class="site-menubar__item" :disabled="disabled || !canUndo" @select="emit('command', 'edit:undo')">
            <span class="site-menubar__item-main">
              <span class="i-ph-arrow-arc-left" />
              <span>{{ labels.undo }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled || !canRedo" @select="emit('command', 'edit:redo')">
            <span class="site-menubar__item-main">
              <span class="i-ph-arrow-arc-right" />
              <span>{{ labels.redo }}</span>
            </span>
          </MenubarItem>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>

    <MenubarMenu value="view">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.view }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'view:zoom-in')">
            <span class="site-menubar__item-main">
              <span class="i-ph-magnifying-glass-plus" />
              <span>{{ labels.zoomIn }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'view:zoom-out')">
            <span class="site-menubar__item-main">
              <span class="i-ph-magnifying-glass-minus" />
              <span>{{ labels.zoomOut }}</span>
            </span>
          </MenubarItem>
          <MenubarSeparator class="site-menubar__separator" />
          <MenubarSub>
            <MenubarSubTrigger class="site-menubar__item">
              <span class="site-menubar__item-main">
                <span class="i-ph-translate" />
                <span>{{ labels.language }}</span>
              </span>
              <span class="i-ph-caret-right site-menubar__sub-caret" />
            </MenubarSubTrigger>
            <MenubarPortal>
              <MenubarSubContent class="site-menubar__content site-menubar__content--sub" :side-offset="8" :align-offset="-4">
                <MenubarRadioGroup :model-value="locale">
                  <MenubarRadioItem class="site-menubar__item" value="en" @select="emit('setLocale', 'en')">
                    <span class="site-menubar__item-main">
                      <MenubarItemIndicator class="site-menubar__indicator">
                        <span class="i-ph-check" />
                      </MenubarItemIndicator>
                      <span>{{ labels.english }}</span>
                    </span>
                  </MenubarRadioItem>
                  <MenubarRadioItem class="site-menubar__item" value="zh" @select="emit('setLocale', 'zh')">
                    <span class="site-menubar__item-main">
                      <MenubarItemIndicator class="site-menubar__indicator">
                        <span class="i-ph-check" />
                      </MenubarItemIndicator>
                      <span>{{ labels.chinese }}</span>
                    </span>
                  </MenubarRadioItem>
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>

    <MenubarMenu value="tools">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.tools }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarRadioGroup :model-value="activeTool">
            <MenubarRadioItem
              v-for="tool in toolCommands"
              :key="tool.value"
              class="site-menubar__item"
              :disabled="disabled"
              :value="tool.value"
              @select="emit('command', `tool:${tool.value}`)"
            >
              <span class="site-menubar__item-main">
                <MenubarItemIndicator class="site-menubar__indicator">
                  <span class="i-ph-check" />
                </MenubarItemIndicator>
                <span :class="tool.icon" />
                <span>{{ labels[tool.labelKey] }}</span>
              </span>
            </MenubarRadioItem>
          </MenubarRadioGroup>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>

    <MenubarMenu value="layers">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.layers }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'layer:add')">
            <span class="site-menubar__item-main">
              <span class="i-ph-plus" />
              <span>{{ labels.addLayer }}</span>
            </span>
          </MenubarItem>
          <MenubarSeparator class="site-menubar__separator" />
          <MenubarCheckboxItem
            class="site-menubar__item"
            :disabled="disabled || !hasActiveLayer"
            :model-value="activeLayerVisible"
            @update:model-value="onLayerVisibleChange"
          >
            <span class="site-menubar__item-main">
              <MenubarItemIndicator class="site-menubar__indicator">
                <span class="i-ph-check" />
              </MenubarItemIndicator>
              <span>{{ labels.showActiveLayer }}</span>
            </span>
          </MenubarCheckboxItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled || !canMoveLayerUp" @select="emit('command', 'layer:move-up')">
            <span class="site-menubar__item-main">
              <span class="i-ph-arrow-up" />
              <span>{{ labels.moveActiveLayerUp }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled || !canMoveLayerDown" @select="emit('command', 'layer:move-down')">
            <span class="site-menubar__item-main">
              <span class="i-ph-arrow-down" />
              <span>{{ labels.moveActiveLayerDown }}</span>
            </span>
          </MenubarItem>
          <MenubarSeparator class="site-menubar__separator" />
          <MenubarItem class="site-menubar__item site-menubar__item--danger" :disabled="disabled || !canRemoveLayer" @select="emit('command', 'layer:remove')">
            <span class="site-menubar__item-main">
              <span class="i-ph-trash" />
              <span>{{ labels.removeActiveLayer }}</span>
            </span>
          </MenubarItem>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>
  </MenubarRoot>
</template>

<style scoped>
.site-menubar {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 2px;
  overflow-x: auto;
  scrollbar-width: none;
}

.site-menubar::-webkit-scrollbar {
  display: none;
}

.site-menubar__trigger {
  height: 32px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: rgb(255 255 255 / 78%);
  font-size: 13px;
  font-weight: 520;
  padding-inline: 10px;
}

.site-menubar__trigger:hover,
.site-menubar__trigger[data-state='open'] {
  border-color: rgb(255 255 255 / 12%);
  background: rgb(255 255 255 / 9%);
  color: white;
}

:global(.site-menubar__content) {
  z-index: 1000;
  min-width: 214px;
  padding: 6px;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: rgb(20 20 22 / 96%);
  backdrop-filter: blur(18px);
  box-shadow: 0 18px 50px rgb(0 0 0 / 36%);
  color: white;
}

:global(.site-menubar__content--sub) {
  min-width: 148px;
}

:global(.site-menubar__item) {
  display: flex;
  min-height: 32px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-radius: 6px;
  color: rgb(255 255 255 / 82%);
  cursor: default;
  font-size: 13px;
  outline: none;
  padding: 6px 8px;
  user-select: none;
}

:global(.site-menubar__item[data-highlighted]) {
  background: rgb(54 117 255 / 22%);
  color: white;
}

:global(.site-menubar__item[data-disabled]) {
  color: rgb(255 255 255 / 28%);
}

:global(.site-menubar__item--danger[data-highlighted]) {
  background: rgb(255 80 80 / 18%);
  color: #ffd7d7;
}

:global(.site-menubar__item-main) {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
}

:global(.site-menubar__indicator) {
  display: inline-grid;
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  place-items: center;
  font-size: 12px;
}

:global(.site-menubar__sub-caret) {
  flex: 0 0 auto;
  color: rgb(255 255 255 / 44%);
  font-size: 13px;
}

:global(.site-menubar__separator) {
  height: 1px;
  margin: 5px 4px;
  background: rgb(255 255 255 / 10%);
}

@media (max-width: 640px) {
  .site-menubar__trigger {
    height: 30px;
    font-size: 12px;
    padding-inline: 7px;
  }
}
</style>

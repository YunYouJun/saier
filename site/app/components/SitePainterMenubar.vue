<script setup lang="ts">
import type { SiteLocale, SiteLocaleOption } from '~/composables/useSiteI18n'
import type { SitePainterColorSectionId, SitePainterCommand, SitePainterMenuCommand, SitePainterPanelId, SitePainterTool } from '~/types/painter-app'
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
import { computed } from 'vue'

interface SitePainterMenubarLabels {
  file: string
  newCanvas: string
  openProject: string
  saveProject: string
  cloudSync: string
  cloudRoom: string
  importBrush: string
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
  others: string
  keyboardShortcuts: string
  filter: string
  repeatFilter: string
  adjustments: string
  invert: string
  grayscale: string
  blur: string
  gaussianBlur: string
  pixelate: string
  window: string
  showPanels: string
  showColorPanels: string
  brushOptionsPanel: string
  operationPanel: string
  layerPanel: string
  navigatorPanel: string
  diagnosticsPanel: string
  colorWheelPanel: string
  colorPalettePanel: string
  rgbSlidersPanel: string
  tools: string
  brush: string
  eraser: string
  pan: string
  image: string
  selection: string
  layers: string
  addLayer: string
  addGroup: string
  showActiveLayer: string
  moveActiveLayerUp: string
  moveActiveLayerDown: string
  removeActiveLayer: string
}

const props = defineProps<{
  activeLayerVisible: boolean
  activeTool: SitePainterTool
  availablePanels: SitePainterPanelId[]
  canApplyFilter: boolean
  canMoveLayerDown: boolean
  canMoveLayerUp: boolean
  canRedo: boolean
  canRemoveLayer: boolean
  canRepeatFilter: boolean
  canUndo: boolean
  disabled: boolean
  hasActiveLayer: boolean
  labels: SitePainterMenubarLabels
  locale: SiteLocale
  localeOptions: readonly SiteLocaleOption[]
  shortcuts: Readonly<Partial<Record<SitePainterCommand, string>>>
  colorSectionVisibility: Readonly<Record<SitePainterColorSectionId, boolean>>
  panelVisibility: Readonly<Record<SitePainterPanelId, boolean>>
}>()

const emit = defineEmits<{
  command: [command: SitePainterMenuCommand]
  setColorSectionVisible: [sectionId: SitePainterColorSectionId, visible: boolean]
  setActiveLayerVisible: [visible: boolean]
  setLocale: [locale: SiteLocale]
  setPanelVisible: [panelId: SitePainterPanelId, visible: boolean]
}>()

const toolCommands: { value: SitePainterTool, labelKey: 'brush' | 'eraser' | 'pan' | 'image' | 'selection', icon: string }[] = [
  { value: 'brush', labelKey: 'brush', icon: 'i-ph-paint-brush' },
  { value: 'eraser', labelKey: 'eraser', icon: 'i-ph-eraser' },
  { value: 'drag', labelKey: 'pan', icon: 'i-ph-hand' },
  { value: 'image', labelKey: 'image', icon: 'i-ph-image' },
  { value: 'selection', labelKey: 'selection', icon: 'i-ph-selection' },
]

const panelCommands: { value: SitePainterPanelId, labelKey: 'brushOptionsPanel' | 'diagnosticsPanel' | 'layerPanel' | 'navigatorPanel' | 'operationPanel', icon: string }[] = [
  { value: 'options', labelKey: 'brushOptionsPanel', icon: 'i-ph-sliders-horizontal' },
  { value: 'controls', labelKey: 'operationPanel', icon: 'i-ph-palette' },
  { value: 'layers', labelKey: 'layerPanel', icon: 'i-ph-stack' },
  { value: 'navigator', labelKey: 'navigatorPanel', icon: 'i-ph-map-trifold' },
  { value: 'diagnostics', labelKey: 'diagnosticsPanel', icon: 'i-ph-activity' },
]

const colorSectionCommands: { value: SitePainterColorSectionId, labelKey: 'colorPalettePanel' | 'colorWheelPanel' | 'rgbSlidersPanel', icon: string }[] = [
  { value: 'wheel', labelKey: 'colorWheelPanel', icon: 'i-ph-circle-half-tilt' },
  { value: 'palette', labelKey: 'colorPalettePanel', icon: 'i-ph-squares-four' },
  { value: 'rgbSliders', labelKey: 'rgbSlidersPanel', icon: 'i-ph-sliders-horizontal' },
]

const filterEnabled = computed(() => !props.disabled && props.canApplyFilter)

const visiblePanelCommands = computed(() =>
  panelCommands.filter(panel => props.availablePanels.includes(panel.value)),
)

function onLayerVisibleChange(value: boolean | 'indeterminate'): void {
  emit('setActiveLayerVisible', value === true)
}

function onColorSectionVisibleChange(sectionId: SitePainterColorSectionId, value: boolean | 'indeterminate'): void {
  emit('setColorSectionVisible', sectionId, value === true)
}

function onPanelVisibleChange(panelId: SitePainterPanelId, value: boolean | 'indeterminate'): void {
  emit('setPanelVisible', panelId, value === true)
}

function shortcutLabel(command: SitePainterCommand): string {
  return props.shortcuts[command] ?? ''
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
            <span v-if="shortcutLabel('file:new')" class="site-menubar__shortcut">{{ shortcutLabel('file:new') }}</span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:open-project')">
            <span class="site-menubar__item-main">
              <span class="i-ph-folder-open" />
              <span>{{ labels.openProject }}</span>
            </span>
            <span v-if="shortcutLabel('file:open-project')" class="site-menubar__shortcut">{{ shortcutLabel('file:open-project') }}</span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:save-project')">
            <span class="site-menubar__item-main">
              <span class="i-ph-floppy-disk" />
              <span>{{ labels.saveProject }}</span>
            </span>
            <span v-if="shortcutLabel('file:save-project')" class="site-menubar__shortcut">{{ shortcutLabel('file:save-project') }}</span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:cloud-sync')">
            <span class="site-menubar__item-main">
              <span class="i-ph-cloud-arrow-up" />
              <span>{{ labels.cloudSync }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:cloud-room')">
            <span class="site-menubar__item-main">
              <span class="i-ph-broadcast" />
              <span>{{ labels.cloudRoom }}</span>
            </span>
          </MenubarItem>
          <MenubarSeparator class="site-menubar__separator" />
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:import-image')">
            <span class="site-menubar__item-main">
              <span class="i-ph-image" />
              <span>{{ labels.importImage }}</span>
            </span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'file:import-brush')">
            <span class="site-menubar__item-main">
              <span class="i-ph-paint-brush" />
              <span>{{ labels.importBrush }}</span>
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
            <span v-if="shortcutLabel('edit:undo')" class="site-menubar__shortcut">{{ shortcutLabel('edit:undo') }}</span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled || !canRedo" @select="emit('command', 'edit:redo')">
            <span class="site-menubar__item-main">
              <span class="i-ph-arrow-arc-right" />
              <span>{{ labels.redo }}</span>
            </span>
            <span v-if="shortcutLabel('edit:redo')" class="site-menubar__shortcut">{{ shortcutLabel('edit:redo') }}</span>
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
            <span v-if="shortcutLabel('view:zoom-in')" class="site-menubar__shortcut">{{ shortcutLabel('view:zoom-in') }}</span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'view:zoom-out')">
            <span class="site-menubar__item-main">
              <span class="i-ph-magnifying-glass-minus" />
              <span>{{ labels.zoomOut }}</span>
            </span>
            <span v-if="shortcutLabel('view:zoom-out')" class="site-menubar__shortcut">{{ shortcutLabel('view:zoom-out') }}</span>
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
                  <MenubarRadioItem
                    v-for="option in localeOptions"
                    :key="option.code"
                    class="site-menubar__item"
                    :value="option.code"
                    @select="emit('setLocale', option.code)"
                  >
                    <span class="site-menubar__item-main">
                      <span class="site-menubar__indicator-slot">
                        <MenubarItemIndicator class="site-menubar__indicator">
                          <span class="i-ph-check" />
                        </MenubarItemIndicator>
                      </span>
                      <span>{{ option.label }}</span>
                    </span>
                  </MenubarRadioItem>
                </MenubarRadioGroup>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>

    <MenubarMenu value="filter">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.filter }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarItem class="site-menubar__item" :disabled="!filterEnabled || !canRepeatFilter" @select="emit('command', 'filter:repeat')">
            <span class="site-menubar__item-main">
              <span class="i-ph-clock-counter-clockwise" />
              <span>{{ labels.repeatFilter }}</span>
            </span>
            <span v-if="shortcutLabel('filter:repeat')" class="site-menubar__shortcut">{{ shortcutLabel('filter:repeat') }}</span>
          </MenubarItem>
          <MenubarSeparator class="site-menubar__separator" />
          <MenubarSub>
            <MenubarSubTrigger class="site-menubar__item" :disabled="!filterEnabled">
              <span class="site-menubar__item-main">
                <span class="i-ph-sliders" />
                <span>{{ labels.adjustments }}</span>
              </span>
              <span class="i-ph-caret-right site-menubar__sub-caret" />
            </MenubarSubTrigger>
            <MenubarPortal>
              <MenubarSubContent class="site-menubar__content site-menubar__content--sub site-menubar__content--filter" :side-offset="8" :align-offset="-4">
                <MenubarItem class="site-menubar__item" :disabled="!filterEnabled" @select="emit('command', 'filter:invert')">
                  <span class="site-menubar__item-main">
                    <span class="i-ph-circle-half" />
                    <span>{{ labels.invert }}</span>
                  </span>
                </MenubarItem>
                <MenubarItem class="site-menubar__item" :disabled="!filterEnabled" @select="emit('command', 'filter:grayscale')">
                  <span class="site-menubar__item-main">
                    <span class="i-ph-drop-half" />
                    <span>{{ labels.grayscale }}</span>
                  </span>
                </MenubarItem>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger class="site-menubar__item" :disabled="true">
              <span class="site-menubar__item-main">
                <span class="i-ph-aperture" />
                <span>{{ labels.blur }}</span>
              </span>
              <span class="i-ph-caret-right site-menubar__sub-caret" />
            </MenubarSubTrigger>
            <MenubarPortal>
              <MenubarSubContent class="site-menubar__content site-menubar__content--sub site-menubar__content--filter" :side-offset="8" :align-offset="-4">
                <MenubarItem class="site-menubar__item" :disabled="true">
                  <span class="site-menubar__item-main">
                    <span class="i-ph-dots-three-circle" />
                    <span>{{ labels.gaussianBlur }}</span>
                  </span>
                </MenubarItem>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>
          <MenubarItem class="site-menubar__item" :disabled="true">
            <span class="site-menubar__item-main">
              <span class="i-ph-grid-four" />
              <span>{{ labels.pixelate }}</span>
            </span>
          </MenubarItem>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>

    <MenubarMenu value="window">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.window }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarSub>
            <MenubarSubTrigger class="site-menubar__item" :disabled="disabled">
              <span class="site-menubar__item-main">
                <span class="i-ph-layout" />
                <span>{{ labels.showPanels }}</span>
              </span>
              <span class="i-ph-caret-right site-menubar__sub-caret" />
            </MenubarSubTrigger>
            <MenubarPortal>
              <MenubarSubContent class="site-menubar__content site-menubar__content--sub site-menubar__content--panels" :side-offset="8" :align-offset="-4">
                <MenubarCheckboxItem
                  v-for="panel in visiblePanelCommands"
                  :key="panel.value"
                  class="site-menubar__item"
                  :disabled="disabled"
                  :model-value="panelVisibility[panel.value]"
                  @update:model-value="onPanelVisibleChange(panel.value, $event)"
                >
                  <span class="site-menubar__item-main">
                    <span class="site-menubar__indicator-slot">
                      <MenubarItemIndicator class="site-menubar__indicator">
                        <span class="i-ph-check" />
                      </MenubarItemIndicator>
                    </span>
                    <span :class="panel.icon" />
                    <span>{{ labels[panel.labelKey] }}</span>
                  </span>
                </MenubarCheckboxItem>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>
          <MenubarSub>
            <MenubarSubTrigger class="site-menubar__item" :disabled="disabled">
              <span class="site-menubar__item-main">
                <span class="i-ph-palette" />
                <span>{{ labels.showColorPanels }}</span>
              </span>
              <span class="i-ph-caret-right site-menubar__sub-caret" />
            </MenubarSubTrigger>
            <MenubarPortal>
              <MenubarSubContent class="site-menubar__content site-menubar__content--sub site-menubar__content--panels" :side-offset="8" :align-offset="-4">
                <MenubarCheckboxItem
                  v-for="section in colorSectionCommands"
                  :key="section.value"
                  class="site-menubar__item"
                  :disabled="disabled"
                  :model-value="colorSectionVisibility[section.value]"
                  @update:model-value="onColorSectionVisibleChange(section.value, $event)"
                >
                  <span class="site-menubar__item-main">
                    <span class="site-menubar__indicator-slot">
                      <MenubarItemIndicator class="site-menubar__indicator">
                        <span class="i-ph-check" />
                      </MenubarItemIndicator>
                    </span>
                    <span :class="section.icon" />
                    <span>{{ labels[section.labelKey] }}</span>
                  </span>
                </MenubarCheckboxItem>
              </MenubarSubContent>
            </MenubarPortal>
          </MenubarSub>
        </MenubarContent>
      </MenubarPortal>
    </MenubarMenu>

    <MenubarMenu value="others">
      <MenubarTrigger class="site-menubar__trigger">
        {{ labels.others }}
      </MenubarTrigger>
      <MenubarPortal>
        <MenubarContent class="site-menubar__content" align="start" :side-offset="7">
          <MenubarItem class="site-menubar__item" @select="emit('command', 'app:keyboard-shortcuts')">
            <span class="site-menubar__item-main">
              <span class="i-ph-keyboard" />
              <span>{{ labels.keyboardShortcuts }}</span>
            </span>
            <span v-if="shortcutLabel('app:keyboard-shortcuts')" class="site-menubar__shortcut">{{ shortcutLabel('app:keyboard-shortcuts') }}</span>
          </MenubarItem>
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
                <span class="site-menubar__indicator-slot">
                  <MenubarItemIndicator class="site-menubar__indicator">
                    <span class="i-ph-check" />
                  </MenubarItemIndicator>
                </span>
                <span :class="tool.icon" />
                <span>{{ labels[tool.labelKey] }}</span>
              </span>
              <span v-if="shortcutLabel(`tool:${tool.value}`)" class="site-menubar__shortcut">{{ shortcutLabel(`tool:${tool.value}`) }}</span>
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
            <span v-if="shortcutLabel('layer:add')" class="site-menubar__shortcut">{{ shortcutLabel('layer:add') }}</span>
          </MenubarItem>
          <MenubarItem class="site-menubar__item" :disabled="disabled" @select="emit('command', 'layer:add-group')">
            <span class="site-menubar__item-main">
              <span class="i-ph-folder-plus" />
              <span>{{ labels.addGroup }}</span>
            </span>
            <span v-if="shortcutLabel('layer:add-group')" class="site-menubar__shortcut">{{ shortcutLabel('layer:add-group') }}</span>
          </MenubarItem>
          <MenubarSeparator class="site-menubar__separator" />
          <MenubarCheckboxItem
            class="site-menubar__item"
            :disabled="disabled || !hasActiveLayer"
            :model-value="activeLayerVisible"
            @update:model-value="onLayerVisibleChange"
          >
            <span class="site-menubar__item-main">
              <span class="site-menubar__indicator-slot">
                <MenubarItemIndicator class="site-menubar__indicator">
                  <span class="i-ph-check" />
                </MenubarItemIndicator>
              </span>
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

:global(.site-menubar__content--panels) {
  min-width: 174px;
}

:global(.site-menubar__content--filter) {
  min-width: 154px;
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

:global(.site-menubar__shortcut) {
  flex: 0 0 auto;
  color: rgb(255 255 255 / 42%);
  font-size: 12px;
}

:global(.site-menubar__indicator-slot) {
  display: inline-grid;
  width: 14px;
  height: 14px;
  flex: 0 0 auto;
  place-items: center;
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

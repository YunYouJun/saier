<script setup lang="ts">
import type { SitePainterMenuCommand, SitePainterTool } from '~/types/painter-app'
import PainterToolbar from '@saier/vue/components/PainterToolbar.vue'
import PainterToolbarButton from '@saier/vue/components/PainterToolbarButton.vue'
import { ToolbarSeparator } from 'reka-ui'

defineProps<{ activeTool: SitePainterTool, busy: boolean, canUndo: boolean, canRedo: boolean }>()
const emit = defineEmits<{ command: [command: SitePainterMenuCommand], settings: [] }>()
</script>

<template>
  <PainterToolbar label="水印工具" class="watermark-toolbar">
    <span class="mode-label"><span class="i-ph-stamp" aria-hidden="true" />水印</span>
    <ToolbarSeparator class="painter-toolbar__separator" />
    <PainterToolbarButton icon="i-ph-cursor" title="选择 / 变换" :aria-pressed="activeTool === 'selection'" :disabled="busy" @click="emit('command', 'tool:selection')" />
    <PainterToolbarButton icon="i-ph-hand" title="平移" :aria-pressed="activeTool === 'drag'" :disabled="busy" @click="emit('command', 'tool:drag')" />
    <ToolbarSeparator class="painter-toolbar__separator" />
    <PainterToolbarButton icon="i-ph-arrow-counter-clockwise" title="撤销" :disabled="busy || !canUndo" @click="emit('command', 'edit:undo')" />
    <PainterToolbarButton icon="i-ph-arrow-clockwise" title="重做" :disabled="busy || !canRedo" @click="emit('command', 'edit:redo')" />
    <ToolbarSeparator class="painter-toolbar__separator" />
    <PainterToolbarButton icon="i-ph-corners-out" title="适配画布" @click="emit('command', 'view:reset')" />
    <PainterToolbarButton class="settings-button" icon="i-ph-sliders-horizontal" title="水印设置" @click="emit('settings')">
      <span>水印设置</span>
    </PainterToolbarButton>
  </PainterToolbar>
</template>

<style scoped>
.mode-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding-inline: 4px;
  color: var(--saier-color-text-muted);
  font-size: var(--saier-font-size-control);
  white-space: nowrap;
}
.settings-button {
  width: auto;
  padding-inline: 8px;
  font-size: var(--saier-font-size-control);
  white-space: nowrap;
}
</style>

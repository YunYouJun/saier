<script setup lang="ts">
import type { ImageExportOptions } from '../../features/image-files/export'
import type { ImageFileMessages } from '../../features/image-files/messages'
import { shallowRef, watch } from 'vue'
import SiteImageDialog from './SiteImageDialog.vue'

const props = defineProps<{
  open: boolean
  busy: boolean
  name: string
  size: { width: number, height: number }
  labels: ImageFileMessages
}>()
const emit = defineEmits<{ close: [], download: [settings: ImageExportOptions & { name: string }] }>()
const name = shallowRef('')
const format = shallowRef<'png' | 'jpeg'>('png')
const transparent = shallowRef(true)
const background = shallowRef('#ffffff')
const quality = shallowRef(92)
watch(() => props.open, (open) => {
  if (open)
    name.value = props.name.replace(/\.(?:png|jpe?g)$/i, '')
})
function download(): void {
  emit('download', {
    name: name.value,
    format: format.value,
    background: format.value === 'png' && transparent.value ? null : background.value,
    quality: quality.value / 100,
  })
}
</script>

<template>
  <SiteImageDialog :open="open" :title="labels.exportTitle" :description="labels.exportDescription" @close="!busy && emit('close')">
    <form @submit.prevent="download">
      <p class="image-meta">
        {{ size.width }} × {{ size.height }} px
      </p>
      <label class="image-field">
        <span>{{ labels.filename }}</span>
        <input v-model="name" class="image-input" :disabled="busy" autocomplete="off">
      </label>
      <label class="image-field">
        <span>{{ labels.format }}</span>
        <select v-model="format" class="image-input" :disabled="busy">
          <option value="png">PNG</option>
          <option value="jpeg">JPEG</option>
        </select>
      </label>
      <label v-if="format === 'png'" class="image-field">
        <span><input v-model="transparent" type="checkbox" :disabled="busy"> {{ labels.transparent }}</span>
      </label>
      <label v-if="format === 'jpeg' || !transparent" class="image-field">
        <span>{{ labels.background }}</span>
        <input v-model="background" type="color" :disabled="busy">
      </label>
      <label v-if="format === 'jpeg'" class="image-field">
        <span>{{ labels.quality }} · {{ quality }}%</span>
        <input v-model.number="quality" type="range" min="10" max="100" :disabled="busy">
      </label>
      <footer class="image-actions">
        <button type="button" class="image-button" :disabled="busy" @click="emit('close')">{{ labels.cancel }}</button>
        <button type="submit" class="image-button image-button--primary" :disabled="busy">{{ busy ? labels.busy : labels.download }}</button>
      </footer>
    </form>
  </SiteImageDialog>
</template>

<script setup lang="ts">
import type { ImageFileMessages } from '../../features/image-files/messages'
import type { ImageImportIntent, PendingImageImport } from '../../features/image-files/useImageFiles'
import SiteImageDialog from './SiteImageDialog.vue'

defineProps<{ request?: PendingImageImport, busy: boolean, labels: ImageFileMessages }>()
const emit = defineEmits<{ close: [], import: [intent: ImageImportIntent, resize: boolean] }>()
</script>

<template>
  <SiteImageDialog :open="Boolean(request)" :title="labels.importTitle" :description="labels.importDescription" @close="emit('close')">
    <p class="image-meta">
      {{ request?.file.name }}
      <span v-if="request?.size"> · {{ request.size.width }} × {{ request.size.height }} px</span>
    </p>
    <p v-if="request?.size" class="image-meta">
      {{ labels.tooLarge }}
    </p>
    <p v-if="busy" role="status">
      {{ labels.busy }}
    </p>
    <footer class="image-actions">
      <button type="button" class="image-button" @click="emit('close')">
        {{ labels.cancel }}
      </button>
      <button v-if="request?.size" type="button" class="image-button image-button--primary" :disabled="busy" @click="emit('import', request.intent ?? 'open', true)">
        {{ labels.resize }}
      </button>
      <template v-else>
        <button type="button" class="image-button" :disabled="busy" @click="emit('import', 'place', false)">
          {{ labels.place }}
        </button>
        <button type="button" class="image-button image-button--primary" :disabled="busy" @click="emit('import', 'open', false)">
          {{ labels.open }}
        </button>
      </template>
    </footer>
  </SiteImageDialog>
</template>

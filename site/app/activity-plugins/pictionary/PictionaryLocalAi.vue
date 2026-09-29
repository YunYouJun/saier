<script setup lang="ts">
import { SiteActivityButton, SiteActivityField } from '~/components/activity'
import { usePictionaryI18n } from './i18n'

defineProps<{
  applying: boolean
  busy: boolean
  disabled: boolean
  message: string
  result: string
}>()
const emit = defineEmits<{ apply: [], cancel: [], generate: [] }>()
const pairingCode = defineModel<string>('pairingCode', { required: true })
const port = defineModel<number>('port', { required: true })
const { text } = usePictionaryI18n()
</script>

<template>
  <details class="pictionary-local-ai">
    <summary>{{ text.room.aiLocalTitle }}</summary>
    <p>{{ text.room.aiLocalHint }}</p>
    <div class="pictionary-local-ai__controls">
      <SiteActivityField :label="text.room.aiLocalPort">
        <input v-model.number="port" class="site-activity-control" type="number" min="1024" max="65535" :disabled="busy || applying" :aria-label="text.room.aiLocalPort">
      </SiteActivityField>
      <SiteActivityField :label="text.room.aiLocalPairing">
        <input v-model="pairingCode" class="site-activity-control" type="password" maxlength="64" autocomplete="off" :disabled="busy || applying" :aria-label="text.room.aiLocalPairing">
      </SiteActivityField>
      <SiteActivityButton v-if="busy" size="compact" @click="emit('cancel')">
        {{ text.room.aiLocalCancel }}
      </SiteActivityButton>
      <SiteActivityButton v-else size="compact" :disabled="disabled || applying || !pairingCode" @click="emit('generate')">
        {{ text.room.aiLocalGenerate }}
      </SiteActivityButton>
      <template v-if="result">
        <img :src="result" :alt="text.room.aiLocalPreview" width="160" height="160">
        <a :href="result" download="saier-codex-remix.png">{{ text.room.aiLocalDownload }}</a>
        <SiteActivityButton size="compact" :disabled="disabled || busy || applying" @click="emit('apply')">
          {{ applying ? text.room.aiLocalApplying : text.room.aiLocalApply }}
        </SiteActivityButton>
      </template>
      <p v-if="message" role="status">
        {{ message }}
      </p>
    </div>
  </details>
</template>

<style scoped>
.pictionary-local-ai {
  font-size: 11px;
  line-height: 1.5;
  color: var(--saier-color-text-muted);
}

.pictionary-local-ai summary {
  cursor: pointer;
}

.pictionary-local-ai__controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.pictionary-local-ai input {
  width: 100%;
  box-sizing: border-box;
}

.pictionary-local-ai img {
  max-width: 100%;
  object-fit: contain;
}

.pictionary-local-ai a {
  color: var(--saier-color-text);
  text-decoration: underline;
}
</style>

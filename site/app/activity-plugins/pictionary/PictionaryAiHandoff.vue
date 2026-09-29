<script setup lang="ts">
import type { PictionaryAiHandoff } from './ai-handoff'
import { shallowRef, watch } from 'vue'
import { SiteActivityButton, SiteActivityField } from '~/components/activity'
import { usePictionaryI18n } from './i18n'

const props = defineProps<{
  disabled: boolean
  handoff?: PictionaryAiHandoff
}>()
const emit = defineEmits<{ prepare: [] }>()
const { text } = usePictionaryI18n()
const copyState = shallowRef<'idle' | 'copied' | 'failed'>('idle')

watch(() => props.handoff, () => {
  copyState.value = 'idle'
})

async function copyPrompt(): Promise<void> {
  const handoff = props.handoff
  if (!handoff)
    return
  try {
    await navigator.clipboard.writeText(handoff.prompt)
    if (props.handoff === handoff)
      copyState.value = 'copied'
  }
  catch {
    if (props.handoff === handoff)
      copyState.value = 'failed'
  }
}
</script>

<template>
  <details class="pictionary-ai-handoff">
    <summary>{{ text.room.aiExternalTitle }}</summary>
    <p>{{ text.room.aiExternalHint }}</p>
    <SiteActivityButton size="compact" :disabled="disabled" @click="emit('prepare')">
      {{ text.room.aiExternalPrepare }}
    </SiteActivityButton>
    <div v-if="handoff" class="pictionary-ai-handoff__ready">
      <a :href="handoff.imageDataUrl" download="saier-ai-selection.png">{{ text.room.aiExternalDownload }}</a>
      <SiteActivityField :label="text.room.aiExternalPrompt">
        <textarea class="site-activity-control" :aria-label="text.room.aiExternalPrompt" :value="handoff.prompt" readonly rows="5" />
      </SiteActivityField>
      <SiteActivityButton size="compact" @click="copyPrompt">
        {{ text.room.aiExternalCopy }}
      </SiteActivityButton>
      <span v-if="copyState !== 'idle'" role="status">
        {{ copyState === 'copied' ? text.room.aiExternalCopied : text.room.aiExternalCopyFailed }}
      </span>
      <a href="https://chatgpt.com/" target="_blank" rel="noopener noreferrer">{{ text.room.aiExternalOpen }}</a>
    </div>
  </details>
</template>

<style scoped>
.pictionary-ai-handoff {
  color: var(--saier-color-text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.pictionary-ai-handoff summary {
  cursor: pointer;
}

.pictionary-ai-handoff__ready {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.pictionary-ai-handoff a {
  color: var(--saier-color-text);
  text-decoration: underline;
}

.pictionary-ai-handoff textarea {
  box-sizing: border-box;
  width: 100%;
  resize: vertical;
}
</style>

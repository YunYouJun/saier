<script setup lang="ts">
import type { PictionaryAiEffect, PictionaryAiRect } from '@saier/collaboration'
import type { PictionaryAiHandoff } from './ai-handoff'
import { computed } from 'vue'
import { SiteActivityButton, SiteActivityField, SiteActivityPanel } from '~/components/activity'
import { usePictionaryI18n } from './i18n'
import PictionaryAiHandoffControl from './PictionaryAiHandoff.vue'

const props = defineProps<{
  busy: boolean
  handoff?: PictionaryAiHandoff
  message?: string
  pending: boolean
  selection?: PictionaryAiRect
  used: boolean
}>()

const emit = defineEmits<{
  generate: []
  prepareHandoff: []
  select: []
}>()

const effect = defineModel<PictionaryAiEffect>('effect', { required: true })
const { text } = usePictionaryI18n()
const selectionLabel = computed(() => props.selection
  ? `${props.selection.width} × ${props.selection.height}px`
  : text.value.room.aiSelectionHint)
</script>

<template>
  <SiteActivityPanel
    class="pictionary-ai-remix"
    icon="i-ph-sparkle"
    tag="aside"
    :title="text.room.aiMagic"
  >
    <p class="pictionary-ai-remix__intro">
      {{ text.room.aiMagicHint }}
    </p>

    <SiteActivityField :label="text.room.aiEffect">
      <select v-model="effect" class="site-activity-control" :disabled="busy || pending || used">
        <option value="polish">
          {{ text.room.aiEffectPolish }}
        </option>
        <option value="surprise">
          {{ text.room.aiEffectSurprise }}
        </option>
        <option value="texture">
          {{ text.room.aiEffectTexture }}
        </option>
      </select>
    </SiteActivityField>

    <div class="pictionary-ai-remix__selection">
      <span>{{ selectionLabel }}</span>
      <SiteActivityButton size="compact" :disabled="busy || pending || used" @click="emit('select')">
        {{ selection ? text.room.aiReselectRegion : text.room.aiSelectRegion }}
      </SiteActivityButton>
    </div>

    <SiteActivityButton
      :disabled="busy || pending || used || !selection"
      size="compact"
      variant="primary"
      @click="emit('generate')"
    >
      <span :class="pending ? 'i-ph-spinner-gap animate-spin' : 'i-ph-magic-wand'" aria-hidden="true" />
      {{ pending ? text.room.aiPending : used ? text.room.aiUsed : text.room.aiGenerate }}
    </SiteActivityButton>

    <PictionaryAiHandoffControl
      :disabled="busy || pending || used || !selection"
      :handoff="handoff"
      @prepare="emit('prepareHandoff')"
    />

    <slot name="local" />

    <p v-if="message" class="pictionary-ai-remix__message" aria-live="polite">
      {{ message }}
    </p>
  </SiteActivityPanel>
</template>

<style scoped>
.pictionary-ai-remix {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
}

.pictionary-ai-remix__intro,
.pictionary-ai-remix__message {
  margin: 0;
  color: var(--saier-color-text-subtle);
  font-size: 10px;
  line-height: 1.5;
}

.pictionary-ai-remix__selection {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--saier-color-text-muted);
  font-size: 10px;
}

.pictionary-ai-remix__message {
  color: var(--saier-color-warning-text);
}
</style>

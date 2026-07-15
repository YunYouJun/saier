<script setup lang="ts">
import { usePictionaryI18n } from './i18n'
import { SiteActivityButton, SiteActivityField, SiteActivityPanel } from '~/components/activity'

defineProps<{
  busy: boolean
  error: string
}>()

const emit = defineEmits<{
  submit: []
}>()

const title = defineModel<string>('title', { required: true })
const customWords = defineModel<string>('customWords', { required: true })
const { text } = usePictionaryI18n()
</script>

<template>
  <SiteActivityPanel
    class="pictionary-card"
    :description="text.lobby.createDescription"
    icon="i-ph-pencil-circle"
    tag="form"
    :title="text.lobby.createTitle"
    @submit.prevent="emit('submit')"
  >
    <SiteActivityField :label="text.lobby.roomName">
      <input
        v-model="title"
        class="site-activity-control"
        maxlength="96"
        autocomplete="off"
        :aria-describedby="error ? 'pictionary-create-error' : undefined"
      >
    </SiteActivityField>

    <SiteActivityField :hint="text.lobby.optionalWordBank" :label="text.lobby.customWordBank">
      <textarea
        v-model="customWords"
        class="site-activity-control"
        rows="4"
        :placeholder="text.lobby.wordBankPlaceholder"
        :aria-describedby="error ? 'pictionary-create-error' : undefined"
      />
    </SiteActivityField>

    <p v-if="error" id="pictionary-create-error" class="site-activity-error" role="alert">
      {{ error }}
    </p>

    <SiteActivityButton type="submit" variant="primary" :disabled="busy">
      <span class="i-ph-plus-circle" aria-hidden="true" />
      {{ busy ? text.lobby.creating : text.lobby.create }}
    </SiteActivityButton>
  </SiteActivityPanel>
</template>

<style scoped>
.pictionary-card {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.pictionary-card .site-activity-button {
  align-self: flex-start;
}
</style>

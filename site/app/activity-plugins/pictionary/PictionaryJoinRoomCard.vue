<script setup lang="ts">
import { usePictionaryI18n } from './i18n'
import { SiteActivityButton, SiteActivityField, SiteActivityPanel } from '~/components/activity'

defineProps<{
  error: string
}>()

const emit = defineEmits<{
  submit: []
}>()

const joinTarget = defineModel<string>({ required: true })
const { text } = usePictionaryI18n()
</script>

<template>
  <SiteActivityPanel
    class="pictionary-card"
    :description="text.lobby.joinDescription"
    icon="i-ph-users-three"
    tag="form"
    :title="text.lobby.joinTitle"
    @submit.prevent="emit('submit')"
  >
    <SiteActivityField :label="text.lobby.inviteLink">
      <input
        v-model="joinTarget"
        class="site-activity-control"
        autocomplete="off"
        :placeholder="text.lobby.invitePlaceholder"
        :aria-describedby="error ? 'pictionary-join-error' : undefined"
      >
    </SiteActivityField>

    <p v-if="error" id="pictionary-join-error" class="site-activity-error" role="alert">
      {{ error }}
    </p>

    <SiteActivityButton type="submit" variant="primary" :disabled="!joinTarget.trim()">
      <span class="i-ph-sign-in" aria-hidden="true" />
      {{ text.lobby.enterRoom }}
    </SiteActivityButton>

    <div class="pictionary-notes">
      <span><i class="i-ph-lock-key" aria-hidden="true" />{{ text.lobby.answerPrivacy }}</span>
      <span><i class="i-ph-cloud-check" aria-hidden="true" />{{ text.lobby.reconnectRecovery }}</span>
      <span><i class="i-ph-paint-brush" aria-hidden="true" />{{ text.lobby.documentIsolation }}</span>
    </div>
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

.pictionary-notes {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: auto;
  padding-top: 12px;
  border-top: 1px solid var(--saier-color-border);
  color: var(--saier-color-text-subtle);
  font-size: 11px;
}

.pictionary-notes span {
  display: flex;
  align-items: center;
  gap: 7px;
}
</style>

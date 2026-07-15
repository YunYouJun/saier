<script setup lang="ts">
import { computed } from 'vue'

interface SiteAccountButtonLabels {
  checking: string
  error: string
  nativeApp: string
  openSettings: string
  signIn: string
  signedIn: string
  signingIn: string
}

const props = defineProps<{
  displayName: string
  errorMessage: string
  isAuthenticated: boolean
  isInNativeApp: boolean
  labels: SiteAccountButtonLabels
  loading: boolean
  settingsHref: string
}>()

const emit = defineEmits<{
  login: []
}>()

const title = computed(() => {
  if (props.errorMessage)
    return `${props.labels.error}: ${props.errorMessage}`
  if (props.isAuthenticated)
    return props.labels.openSettings
  return props.labels.signIn
})

const shortName = computed(() => {
  const name = props.displayName.trim()
  if (!name)
    return ''
  return Array.from(name)[0]?.toUpperCase() ?? ''
})

const loginLabel = computed(() => {
  if (props.loading)
    return props.labels.checking
  return props.labels.signIn
})
</script>

<template>
  <a
    v-if="isAuthenticated"
    class="site-account-button site-account-button--signed-in"
    :href="settingsHref"
    rel="noreferrer"
    target="_blank"
    :title="title"
  >
    <span class="site-account-button__avatar">{{ shortName }}</span>
    <span class="site-account-button__name">{{ displayName }}</span>
    <span v-if="isInNativeApp" class="i-ph-device-mobile site-account-button__icon" :title="labels.nativeApp" />
  </a>

  <button
    v-else
    type="button"
    class="site-account-button"
    :class="{ 'site-account-button--error': errorMessage }"
    :disabled="loading"
    :title="title"
    @click="emit('login')"
  >
    <span class="i-ph-sign-in site-account-button__icon" />
    <span class="site-account-button__name">{{ loading ? labels.signingIn : loginLabel }}</span>
  </button>
</template>

<style scoped>
.site-account-button {
  display: inline-flex;
  height: 32px;
  max-width: 176px;
  flex: 0 0 auto;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--saier-color-border);
  border-radius: 8px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text);
  font-size: 12px;
  line-height: 1;
  padding-inline: 10px;
  text-decoration: none;
}

.site-account-button:disabled {
  cursor: progress;
  opacity: 0.72;
}

.site-account-button--signed-in {
  background: var(--saier-color-success-soft);
  border-color: var(--saier-color-success-border);
}

.site-account-button--error {
  border-color: var(--saier-color-danger-border);
  background: var(--saier-color-danger-soft);
}

.site-account-button__avatar {
  display: inline-grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 50%;
  background: var(--saier-color-surface-strong);
  font-size: 11px;
  font-weight: 700;
}

.site-account-button__icon {
  flex: 0 0 auto;
  font-size: 15px;
}

.site-account-button__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 640px) {
  .site-account-button {
    max-width: 104px;
    padding-inline: 9px;
  }
}
</style>

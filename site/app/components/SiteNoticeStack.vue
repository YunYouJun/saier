<script setup lang="ts">
export interface SiteNoticeItem {
  id: number
  type: 'error' | 'warning' | 'info'
  title: string
  message?: string
}

defineProps<{
  closeLabel: string
  notices: SiteNoticeItem[]
}>()

const emit = defineEmits<{
  close: [id: number]
}>()
</script>

<template>
  <div v-if="notices.length" class="site-notices" aria-live="polite">
    <section
      v-for="notice in notices"
      :key="notice.id"
      class="site-notice"
      :class="`site-notice--${notice.type}`"
    >
      <span
        class="site-notice__icon"
        :class="notice.type === 'error' ? 'i-ph-warning-diamond' : notice.type === 'warning' ? 'i-ph-warning' : 'i-ph-info'"
        aria-hidden="true"
      />
      <div class="site-notice__copy">
        <strong>{{ notice.title }}</strong>
        <span v-if="notice.message">{{ notice.message }}</span>
      </div>
      <button
        type="button"
        class="site-notice__close"
        :title="closeLabel"
        :aria-label="closeLabel"
        @click="emit('close', notice.id)"
      >
        <span class="i-ph-x" aria-hidden="true" />
      </button>
    </section>
  </div>
</template>

<style scoped>
.site-notices {
  position: fixed;
  z-index: 80;
  top: 140px;
  right: 12px;
  display: grid;
  width: min(360px, calc(100vw - 24px));
  gap: 8px;
  pointer-events: none;
}

.site-notice {
  box-sizing: border-box;
  display: grid;
  min-width: 0;
  grid-template-columns: 24px minmax(0, 1fr) 28px;
  align-items: start;
  gap: 8px;
  border: 1px solid var(--saier-color-border);
  border-radius: 8px;
  background: var(--saier-color-panel);
  box-shadow: var(--saier-shadow-panel);
  color: var(--saier-color-text);
  padding: 10px;
  pointer-events: auto;
}

.site-notice--error {
  border-color: var(--saier-color-danger-border);
}

.site-notice--warning {
  border-color: var(--saier-color-warning-border);
}

.site-notice--info {
  border-color: var(--saier-color-info-border);
}

.site-notice__icon {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  font-size: 18px;
}

.site-notice--error .site-notice__icon {
  color: var(--saier-color-danger-text);
}

.site-notice--warning .site-notice__icon {
  color: var(--saier-color-warning-text);
}

.site-notice--info .site-notice__icon {
  color: var(--saier-color-info-text);
}

.site-notice__copy {
  display: grid;
  min-width: 0;
  gap: 3px;
  font-size: 12px;
  line-height: 1.45;
}

.site-notice__copy strong {
  overflow: hidden;
  color: var(--saier-color-text);
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-notice__copy span {
  color: var(--saier-color-text-muted);
}

.site-notice__close {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text-muted);
}

.site-notice__close:hover {
  background: var(--saier-color-surface-hover);
  color: var(--saier-color-text);
}

.site-notice__close:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

@media (max-width: 640px) {
  .site-notices {
    top: 136px;
    right: 8px;
    left: 8px;
    width: auto;
  }
}
</style>

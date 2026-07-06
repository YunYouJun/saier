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
  border: 1px solid rgb(255 255 255 / 13%);
  border-radius: 8px;
  background: rgb(18 18 22 / 94%);
  box-shadow: 0 18px 48px rgb(0 0 0 / 30%);
  color: white;
  padding: 10px;
  pointer-events: auto;
}

.site-notice--error {
  border-color: rgb(248 113 113 / 42%);
}

.site-notice--warning {
  border-color: rgb(251 191 36 / 38%);
}

.site-notice--info {
  border-color: rgb(96 165 250 / 38%);
}

.site-notice__icon {
  display: grid;
  width: 24px;
  height: 24px;
  place-items: center;
  font-size: 18px;
}

.site-notice--error .site-notice__icon {
  color: #fca5a5;
}

.site-notice--warning .site-notice__icon {
  color: #fcd34d;
}

.site-notice--info .site-notice__icon {
  color: #93c5fd;
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
  color: white;
  font-size: 13px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-notice__copy span {
  color: rgb(255 255 255 / 68%);
}

.site-notice__close {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 6%);
  color: rgb(255 255 255 / 72%);
}

.site-notice__close:hover {
  background: rgb(255 255 255 / 12%);
  color: white;
}

.site-notice__close:focus-visible {
  outline: 2px solid rgb(147 197 253 / 72%);
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

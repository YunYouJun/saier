<script setup lang="ts">
defineProps<{
  cancelLabel: string
  confirmLabel: string
  message: string
  open: boolean
  title: string
}>()

const emit = defineEmits<{
  cancel: []
  confirm: []
}>()
</script>

<template>
  <div
    v-if="open"
    class="site-confirm"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    @keydown.esc.stop="emit('cancel')"
  >
    <section class="site-confirm__panel">
      <header class="site-confirm__header">
        <h2 class="site-confirm__title">
          {{ title }}
        </h2>
        <button type="button" class="site-confirm__icon" :title="cancelLabel" @click="emit('cancel')">
          <span class="i-ph-x" />
        </button>
      </header>

      <p class="site-confirm__message">
        {{ message }}
      </p>

      <footer class="site-confirm__footer">
        <button type="button" class="site-confirm__button" @click="emit('cancel')">
          {{ cancelLabel }}
        </button>
        <button type="button" class="site-confirm__button site-confirm__button--danger" @click="emit('confirm')">
          {{ confirmLabel }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.site-confirm {
  box-sizing: border-box;
  position: absolute;
  z-index: 55;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 14px;
  background: var(--saier-color-scrim);
}

.site-confirm__panel {
  box-sizing: border-box;
  display: grid;
  width: min(380px, calc(100vw - 28px));
  gap: 14px;
  border: 1px solid var(--saier-color-border);
  border-radius: 8px;
  background: var(--saier-color-panel-raised);
  box-shadow: var(--saier-shadow-dialog);
  color: var(--saier-color-text);
  padding: 14px;
}

.site-confirm__header,
.site-confirm__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.site-confirm__title,
.site-confirm__message {
  margin: 0;
}

.site-confirm__title {
  font-size: 15px;
  font-weight: 700;
}

.site-confirm__message {
  color: var(--saier-color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.site-confirm__icon,
.site-confirm__button {
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text);
}

.site-confirm__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
}

.site-confirm__button {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.site-confirm__button--danger {
  border-color: var(--saier-color-danger-border);
  background: var(--saier-color-danger-soft);
}

.site-confirm__icon:hover,
.site-confirm__button:hover {
  background: var(--saier-color-surface-hover);
}

.site-confirm__button--danger:hover {
  background: var(--saier-color-danger-soft);
}
</style>

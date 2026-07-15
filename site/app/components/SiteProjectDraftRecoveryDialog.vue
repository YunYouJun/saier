<script setup lang="ts">
interface SiteProjectDraftRecoveryLabels {
  close: string
  discard: string
  file: string
  message: string
  restore: string
  size: string
  title: string
  updatedAt: string
}

interface SiteProjectDraftRecoveryMeta {
  name: string
  size: string
  updatedAt: string
}

defineProps<{
  labels: SiteProjectDraftRecoveryLabels
  meta?: SiteProjectDraftRecoveryMeta
  open: boolean
}>()

const emit = defineEmits<{
  discard: []
  restore: []
}>()
</script>

<template>
  <div
    v-if="open && meta"
    class="site-draft-recovery"
    role="dialog"
    aria-modal="true"
    :aria-label="labels.title"
  >
    <section class="site-draft-recovery__panel">
      <header class="site-draft-recovery__header">
        <span class="site-draft-recovery__mark" aria-hidden="true">
          <span class="i-ph-clock-counter-clockwise" />
        </span>
        <div class="site-draft-recovery__heading">
          <h2>{{ labels.title }}</h2>
          <p>{{ labels.message }}</p>
        </div>
        <button type="button" class="site-draft-recovery__icon" :title="labels.close" @click="emit('discard')">
          <span class="i-ph-x" />
        </button>
      </header>

      <dl class="site-draft-recovery__meta">
        <div>
          <dt>{{ labels.file }}</dt>
          <dd>{{ meta.name }}</dd>
        </div>
        <div>
          <dt>{{ labels.size }}</dt>
          <dd>{{ meta.size }}</dd>
        </div>
        <div>
          <dt>{{ labels.updatedAt }}</dt>
          <dd>{{ meta.updatedAt }}</dd>
        </div>
      </dl>

      <footer class="site-draft-recovery__footer">
        <button type="button" class="site-draft-recovery__button" @click="emit('discard')">
          {{ labels.discard }}
        </button>
        <button type="button" class="site-draft-recovery__button site-draft-recovery__button--primary" @click="emit('restore')">
          {{ labels.restore }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.site-draft-recovery {
  box-sizing: border-box;
  position: absolute;
  z-index: 58;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 14px;
  background: var(--saier-color-scrim);
}

.site-draft-recovery__panel {
  box-sizing: border-box;
  display: grid;
  width: min(440px, calc(100vw - 28px));
  gap: 14px;
  border: 1px solid var(--saier-color-accent-border);
  border-radius: 8px;
  background: var(--saier-color-panel-raised);
  box-shadow: var(--saier-shadow-dialog);
  color: var(--saier-color-text);
  padding: 14px;
}

.site-draft-recovery__header {
  display: grid;
  min-width: 0;
  grid-template-columns: 34px minmax(0, 1fr) 28px;
  align-items: start;
  gap: 10px;
}

.site-draft-recovery__mark {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border: 1px solid var(--saier-color-accent-border);
  border-radius: 7px;
  background: var(--saier-color-accent-soft);
  color: var(--saier-color-accent-text);
  font-size: 18px;
}

.site-draft-recovery__heading {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.site-draft-recovery__heading h2,
.site-draft-recovery__heading p,
.site-draft-recovery__meta,
.site-draft-recovery__meta dd {
  margin: 0;
}

.site-draft-recovery__heading h2 {
  font-size: 15px;
  font-weight: 700;
  line-height: 1.25;
}

.site-draft-recovery__heading p {
  color: var(--saier-color-text-muted);
  font-size: 13px;
  line-height: 1.5;
}

.site-draft-recovery__icon,
.site-draft-recovery__button {
  border: 1px solid var(--saier-color-border);
  border-radius: 6px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text);
}

.site-draft-recovery__icon {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
}

.site-draft-recovery__meta {
  display: grid;
  gap: 8px;
  border: 1px solid var(--saier-color-border);
  border-radius: 7px;
  background: var(--saier-color-surface);
  padding: 10px;
}

.site-draft-recovery__meta div {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  gap: 10px;
}

.site-draft-recovery__meta dt {
  color: var(--saier-color-text-subtle);
  font-size: 11px;
}

.site-draft-recovery__meta dd {
  min-width: 0;
  overflow: hidden;
  color: var(--saier-color-text);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-draft-recovery__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.site-draft-recovery__button {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12px;
}

.site-draft-recovery__button--primary {
  border-color: var(--saier-color-accent-border);
  background: var(--saier-color-accent-soft);
}

.site-draft-recovery__icon:hover,
.site-draft-recovery__button:hover {
  background: var(--saier-color-surface-hover);
}

.site-draft-recovery__button--primary:hover {
  background: var(--saier-color-accent-strong);
}

.site-draft-recovery__icon:focus-visible,
.site-draft-recovery__button:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}
</style>

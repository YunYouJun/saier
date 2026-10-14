<script setup lang="ts">
import { nextTick, shallowRef, watch } from 'vue'

interface SiteAboutDialogLabels {
  close: string
  copyright: string
  description: string
  license: string
  sourceCode: string
  title: string
  version: string
}

const props = defineProps<{
  appName: string
  labels: SiteAboutDialogLabels
  open: boolean
  version: string
}>()

const emit = defineEmits<{
  close: []
}>()

const closeButton = shallowRef<HTMLButtonElement>()
let returnFocus: HTMLElement | null = null

watch(
  () => props.open,
  async (open) => {
    if (open) {
      returnFocus = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
      await nextTick()
      closeButton.value?.focus()
      return
    }

    returnFocus?.focus()
    returnFocus = null
  },
  { immediate: true },
)
</script>

<template>
  <div
    v-if="open"
    class="site-about"
    role="dialog"
    aria-modal="true"
    :aria-label="labels.title"
    @click.self="emit('close')"
    @keydown.esc.stop.prevent="emit('close')"
  >
    <section class="site-about__panel">
      <button
        ref="closeButton"
        type="button"
        class="site-about__icon-button"
        :aria-label="labels.close"
        :title="labels.close"
        @click="emit('close')"
      >
        <span class="i-ph-x" aria-hidden="true" />
      </button>

      <div class="site-about__brand" aria-hidden="true">
        <Logos class="site-about__logo" :size="80" />
      </div>

      <div class="site-about__copy">
        <p class="site-about__eyebrow">
          {{ labels.title }}
        </p>
        <h2 class="site-about__title">
          Saier <span v-if="appName !== 'Saier'">{{ appName }}</span>
        </h2>
        <p class="site-about__description">
          {{ labels.description }}
        </p>
      </div>

      <dl class="site-about__meta">
        <div>
          <dt>{{ labels.version }}</dt>
          <dd>v{{ version }}</dd>
        </div>
        <div>
          <dt>MPL-2.0</dt>
          <dd>{{ labels.license }}</dd>
        </div>
      </dl>

      <footer class="site-about__footer">
        <div class="site-about__legal">
          <span>{{ labels.copyright }}</span>
          <a
            href="https://github.com/YunYouJun/saier"
            rel="noopener noreferrer"
            target="_blank"
          >
            <span class="i-ph-github-logo" aria-hidden="true" />
            {{ labels.sourceCode }}
          </a>
        </div>
        <button type="button" class="site-about__close" @click="emit('close')">
          {{ labels.close }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.site-about {
  --saier-about-surface: #fffdf9;
  box-sizing: border-box;
  position: absolute;
  z-index: 46;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: var(--saier-space-4);
  background: var(--saier-color-scrim);
}

:global(.dark .site-about),
:global([data-saier-theme='dark'] .site-about) {
  --saier-about-surface: var(--saier-color-panel);
}

.site-about__panel {
  box-sizing: border-box;
  position: relative;
  display: grid;
  width: min(420px, 100%);
  overflow: hidden;
  border: 1px solid var(--saier-color-border);
  border-radius: 10px;
  background: var(--saier-about-surface);
  box-shadow: var(--saier-shadow-dialog);
  color: var(--saier-color-text);
  padding: 32px 28px 24px;
}

.site-about__icon-button {
  position: absolute;
  z-index: 1;
  top: 8px;
  right: 8px;
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--saier-color-text-muted);
}

.site-about__icon-button:hover {
  border-color: var(--saier-color-border);
  background: var(--saier-color-surface-hover);
  color: var(--saier-color-text);
}

.site-about__brand {
  width: 80px;
  height: 80px;
  margin-bottom: var(--saier-space-4);
  margin-inline: auto;
}

.site-about__logo {
  width: 80px;
  height: 80px;
}

.site-about__copy {
  text-align: center;
}

.site-about__eyebrow {
  margin: 0 0 5px;
  color: var(--saier-color-text-muted);
  font-size: 12px;
  font-weight: 400;
}

.site-about__title {
  font-family: var(--saier-font-brand);
  margin: 0;
  font-size: 24px;
  font-weight: 650;
  letter-spacing: -0.025em;
}

.site-about__title span {
  color: var(--saier-color-text-muted);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0;
}

.site-about__description {
  margin: 8px 0 0;
  color: var(--saier-color-text-muted);
  font-size: 13px;
  line-height: 1.65;
}

.site-about__meta {
  display: grid;
  gap: 12px;
  margin: 24px 0 20px;
  padding-block: var(--saier-space-4);
  border-block: 1px solid var(--saier-color-border);
}

.site-about__meta > div {
  display: grid;
  grid-template-columns: 72px minmax(0, 1fr);
  align-items: baseline;
  gap: var(--saier-space-4);
  text-align: left;
}

.site-about__meta dt {
  color: var(--saier-color-text-muted);
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
}

.site-about__meta dd {
  margin: 0;
  min-width: 0;
  overflow-wrap: anywhere;
  color: var(--saier-color-text);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  line-height: 1.5;
  text-align: right;
}

.site-about__footer {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.site-about__legal {
  display: grid;
  min-width: 0;
  gap: 7px;
  color: var(--saier-color-text-muted);
  font-size: 11px;
}

.site-about__legal a {
  display: inline-flex;
  width: fit-content;
  align-items: center;
  gap: 6px;
  color: var(--saier-color-accent-text);
  text-decoration: none;
}

.site-about__legal a:hover {
  text-decoration: underline;
}

.site-about__close {
  min-width: 72px;
  height: 32px;
  flex: 0 0 auto;
  border: 1px solid var(--saier-color-accent-border);
  border-radius: var(--saier-radius-control);
  background: var(--saier-color-accent);
  color: var(--saier-color-on-accent);
  font-size: 13px;
  font-weight: 550;
  padding-inline: var(--saier-space-4);
}

.site-about__close:hover {
  background: var(--saier-color-accent-hover);
}

.site-about__icon-button:focus-visible,
.site-about__close:focus-visible,
.site-about__legal a:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 2px;
}

@media (max-width: 480px) {
  .site-about__panel {
    padding: 32px 20px 20px;
  }

  .site-about__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .site-about__close {
    width: 100%;
  }
}

@media (pointer: coarse) {
  .site-about__icon-button {
    width: var(--saier-control-size);
    height: var(--saier-control-size);
  }

  .site-about__close {
    min-height: var(--saier-control-size);
  }
}

@media (max-width: 360px) {
  .site-about__meta > div {
    grid-template-columns: 56px minmax(0, 1fr);
    gap: var(--saier-space-2);
  }

  .site-about__meta dd {
    font-size: 12px;
  }
}
</style>

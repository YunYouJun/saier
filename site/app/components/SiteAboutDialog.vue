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

const logoSrc = '/favicon.svg'
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
        <span class="site-about__paint" />
        <img class="site-about__logo" :src="logoSrc" alt="">
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
  box-sizing: border-box;
  position: absolute;
  z-index: 46;
  inset: 0;
  display: grid;
  place-items: center;
  overflow: auto;
  padding: 14px;
  background: var(--saier-color-scrim);
}

.site-about__panel {
  box-sizing: border-box;
  position: relative;
  display: grid;
  width: min(440px, calc(100vw - 28px));
  overflow: hidden;
  border: 1px solid var(--saier-color-border);
  border-radius: 10px;
  background: var(--saier-color-panel-raised);
  box-shadow: var(--saier-shadow-dialog);
  color: var(--saier-color-text);
  padding: 28px;
}

.site-about__icon-button {
  position: absolute;
  z-index: 1;
  top: 10px;
  right: 10px;
  display: grid;
  width: 30px;
  height: 30px;
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
  position: relative;
  width: 82px;
  height: 76px;
  margin-bottom: 12px;
}

.site-about__paint {
  position: absolute;
  top: 25px;
  left: 3px;
  width: 80px;
  height: 30px;
  border-radius: 42% 58% 48% 52%;
  background: linear-gradient(90deg, rgb(232 64 46 / 18%), rgb(255 138 102 / 50%) 48%, rgb(232 64 46 / 8%));
  filter: blur(0.5px);
  transform: rotate(-7deg) skewX(-12deg);
}

.site-about__logo {
  position: absolute;
  top: 4px;
  left: 8px;
  width: 64px;
  height: 64px;
  filter: drop-shadow(0 8px 16px rgb(122 26 14 / 24%));
}

.site-about__eyebrow {
  margin: 0 0 5px;
  color: var(--saier-color-text-subtle);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.site-about__title {
  margin: 0;
  font-size: 25px;
  font-weight: 750;
  letter-spacing: -0.025em;
}

.site-about__title span {
  color: var(--saier-color-text-subtle);
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
  gap: 1px;
  overflow: hidden;
  margin: 22px 0;
  border: 1px solid var(--saier-color-border);
  border-radius: 8px;
  background: var(--saier-color-border);
}

.site-about__meta > div {
  display: grid;
  grid-template-columns: 92px 1fr;
  align-items: baseline;
  gap: 14px;
  background: var(--saier-color-surface);
  padding: 10px 12px;
}

.site-about__meta dt {
  color: var(--saier-color-text-subtle);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.site-about__meta dd {
  margin: 0;
  color: var(--saier-color-text-muted);
  font-size: 12px;
  line-height: 1.5;
}

.site-about__footer {
  display: flex;
  min-width: 0;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}

.site-about__legal {
  display: grid;
  min-width: 0;
  gap: 7px;
  color: var(--saier-color-text-subtle);
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
  height: 34px;
  flex: 0 0 auto;
  border: 1px solid var(--saier-color-accent-border);
  border-radius: 6px;
  background: var(--saier-color-accent);
  color: white;
  font-size: 13px;
  font-weight: 650;
  padding: 0 15px;
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
    padding: 24px 20px 20px;
  }

  .site-about__footer {
    align-items: stretch;
    flex-direction: column;
  }

  .site-about__close {
    width: 100%;
  }
}
</style>

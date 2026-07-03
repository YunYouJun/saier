<script setup lang="ts">
defineProps<{
  appName: string
  closePreviewLabel: string
  exportPreview?: string
  exportPreviewLabel: string
  languageLabel: string
  loadingLabel: string
  loading: boolean
  nextLocaleLabel: string
  statusLabel: string
  tagline: string
}>()

const emit = defineEmits<{
  closePreview: []
  toggleLocale: []
}>()
</script>

<template>
  <div class="site-painter">
    <header class="site-painter__chrome">
      <div class="site-painter__topbar">
        <div class="site-painter__primary">
          <div class="site-painter__brand">
            <Logos class="site-painter__logo" />
            <div class="site-painter__brand-copy">
              <h1 class="site-painter__title">
                {{ appName }}
              </h1>
              <p class="site-painter__tagline">
                {{ tagline }}
              </p>
            </div>
          </div>

          <div class="site-painter__menu">
            <slot name="menubar" />
          </div>
        </div>

        <div class="site-painter__actions">
          <div class="site-painter__account">
            <slot name="account" />
          </div>
          <span class="site-painter__status">{{ statusLabel }}</span>
          <button type="button" class="site-painter__locale" @click="emit('toggleLocale')">
            <span>{{ languageLabel }}</span>
            <strong>{{ nextLocaleLabel }}</strong>
          </button>
        </div>
      </div>

      <div class="site-painter__toolbar">
        <slot name="toolbar" />
      </div>

      <div class="site-painter__documents">
        <slot name="documents" />
      </div>
    </header>

    <main class="site-painter__workspace">
      <div class="site-painter__canvas-host">
        <slot name="canvas" />
      </div>

      <div class="site-painter__options">
        <slot name="options" />
      </div>
      <div class="site-painter__controls">
        <slot name="controls" />
      </div>
      <div class="site-painter__layers">
        <slot name="layers" />
      </div>
      <div class="site-painter__diagnostics">
        <slot name="diagnostics" />
      </div>

      <div v-if="loading" class="site-painter__loading">
        {{ loadingLabel }}
      </div>

      <aside v-if="exportPreview" class="site-painter__preview">
        <header class="site-painter__preview-header">
          <span>{{ exportPreviewLabel }}</span>
          <button type="button" class="site-painter__preview-close" :title="closePreviewLabel" @click="emit('closePreview')">
            <span class="i-ph-x" />
          </button>
        </header>
        <img class="site-painter__preview-image" :src="exportPreview" :alt="exportPreviewLabel">
      </aside>
    </main>
  </div>
</template>

<style scoped>
.site-painter {
  display: grid;
  height: 100vh;
  min-height: 0;
  grid-template-rows: 132px minmax(0, 1fr);
  overflow: hidden;
  background: #262629;
  color: white;
}

.site-painter__chrome {
  display: grid;
  min-width: 0;
  grid-template-rows: 44px 44px 44px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  background: rgb(18 18 20 / 94%);
}

.site-painter__topbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 12px 2px;
}

.site-painter__primary {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.site-painter__brand {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  align-items: center;
  gap: 7px;
}

.site-painter__logo {
  display: inline-flex;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.site-painter__logo :deep(div) {
  margin: 0;
  font-size: 28px;
}

.site-painter__brand-copy {
  min-width: 0;
  max-width: 92px;
  text-align: left;
}

.site-painter__title,
.site-painter__tagline {
  overflow: hidden;
  margin: 0;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-painter__title {
  font-size: 16px;
  font-weight: 650;
  line-height: 1.2;
}

.site-painter__tagline {
  display: none;
}

.site-painter__menu {
  min-width: 0;
  overflow: hidden;
}

.site-painter__toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 3px 12px 7px;
  overflow: hidden;
}

.site-painter__documents {
  box-sizing: border-box;
  display: flex;
  min-width: 0;
  align-items: center;
  padding: 4px 12px 6px;
  overflow: hidden;
}

.site-painter__actions {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.site-painter__account {
  display: inline-flex;
  min-width: 0;
}

.site-painter__account:empty {
  display: none;
}

.site-painter__status {
  overflow: hidden;
  max-width: 280px;
  color: rgb(255 255 255 / 52%);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-painter__locale {
  display: inline-flex;
  height: 32px;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 8px;
  background: rgb(255 255 255 / 8%);
  color: white;
  font-size: 12px;
  padding-inline: 12px;
}

.site-painter__locale strong {
  font-weight: 650;
}

.site-painter__workspace {
  position: relative;
  min-width: 0;
  min-height: 0;
  --site-painter-left-panel-width: 276px;
  --site-painter-panel-gap: 12px;
  --site-painter-right-panel-space: 344px;
  --site-painter-options-max-width: calc(
    100vw - var(--site-painter-left-panel-width) - var(--site-painter-right-panel-space) - 48px
  );
  overflow: hidden;
}

.site-painter__canvas-host,
.site-painter__canvas-host :slotted(canvas) {
  display: block;
  width: 100%;
  height: 100%;
}

.site-painter__canvas-host :slotted(canvas) {
  background: #333;
}

.site-painter__options,
.site-painter__controls,
.site-painter__layers,
.site-painter__diagnostics,
.site-painter__preview,
.site-painter__loading {
  position: absolute;
  z-index: 10;
}

.site-painter__options {
  top: var(--site-painter-panel-gap);
  left: calc(var(--site-painter-panel-gap) + var(--site-painter-left-panel-width) + var(--site-painter-panel-gap));
  width: min(760px, var(--site-painter-options-max-width));
  max-width: min(760px, var(--site-painter-options-max-width));
}

.site-painter__controls {
  top: var(--site-painter-panel-gap);
  left: var(--site-painter-panel-gap);
}

.site-painter__layers {
  top: 12px;
  right: 12px;
}

.site-painter__diagnostics {
  left: 12px;
  bottom: 12px;
}

.site-painter__loading:empty,
.site-painter__options:empty,
.site-painter__controls:empty,
.site-painter__layers:empty,
.site-painter__diagnostics:empty {
  display: none;
}

.site-painter__loading {
  top: 50%;
  left: 50%;
  color: rgb(255 255 255 / 62%);
  font-size: 14px;
  transform: translate(-50%, -50%);
}

.site-painter__preview {
  right: 12px;
  bottom: 12px;
  width: min(280px, calc(100vw - 24px));
  overflow: hidden;
  border: 1px solid rgb(255 255 255 / 12%);
  border-radius: 8px;
  background: rgb(18 18 20 / 92%);
}

.site-painter__preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid rgb(255 255 255 / 10%);
  font-size: 12px;
  font-weight: 650;
}

.site-painter__preview-close {
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 6px;
  background: rgb(255 255 255 / 8%);
  color: white;
}

.site-painter__preview-image {
  display: block;
  width: 100%;
  max-height: 220px;
  object-fit: contain;
}

@media (max-width: 1080px) {
  .site-painter__status {
    display: none;
  }
}

@media (max-width: 900px) {
  .site-painter__topbar {
    gap: 8px;
  }

  .site-painter__options {
    left: 12px;
    right: 12px;
    width: auto;
    max-width: none;
  }

  .site-painter__controls {
    top: 156px;
  }

  .site-painter__layers {
    top: auto;
    bottom: 12px;
    left: 72px;
    right: 12px;
  }
}

@media (max-width: 640px) {
  .site-painter {
    grid-template-rows: 132px minmax(0, 1fr);
  }

  .site-painter__chrome {
    grid-template-rows: 44px 44px 44px;
  }

  .site-painter__brand-copy,
  .site-painter__locale span {
    display: none;
  }

  .site-painter__brand {
    width: 34px;
  }

  .site-painter__logo {
    overflow: hidden;
  }

  .site-painter__primary {
    gap: 6px;
  }

  .site-painter__toolbar {
    padding-inline: 8px;
  }

  .site-painter__options {
    top: 8px;
    right: 8px;
    left: 8px;
  }

  .site-painter__controls {
    top: 252px;
    left: 8px;
  }

  .site-painter__layers {
    right: 8px;
    bottom: 8px;
    left: 64px;
  }
}
</style>

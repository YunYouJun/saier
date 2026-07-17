<script setup lang="ts">
import type { SiteThemePreference } from '~/composables/useSiteTheme'
import {
  DropdownMenuContent,
  DropdownMenuItemIndicator,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
} from 'reka-ui'
import { computed } from 'vue'
import { SITE_THEME_PREFERENCES } from '~/composables/useSiteTheme'

interface ThemeOption {
  icon: string
  label: string
  value: SiteThemePreference
}

const props = defineProps<{
  appearanceLabel: string
  darkLabel: string
  lightLabel: string
  preference: SiteThemePreference
  systemLabel: string
}>()

const emit = defineEmits<{
  setThemePreference: [preference: SiteThemePreference]
}>()

const options = computed<ThemeOption[]>(() => [
  { value: 'system', label: props.systemLabel, icon: 'i-ph-monitor' },
  { value: 'light', label: props.lightLabel, icon: 'i-ph-sun' },
  { value: 'dark', label: props.darkLabel, icon: 'i-ph-moon' },
])
const activeOption = computed(() =>
  options.value.find(option => option.value === props.preference) ?? options.value[0]!,
)
const triggerLabel = computed(() => `${props.appearanceLabel}: ${activeOption.value.label}`)

function selectPreference(value: unknown): void {
  if (typeof value !== 'string' || !SITE_THEME_PREFERENCES.includes(value as SiteThemePreference))
    return
  emit('setThemePreference', value as SiteThemePreference)
}
</script>

<template>
  <DropdownMenuRoot>
    <DropdownMenuTrigger
      class="site-theme-switcher__trigger"
      :aria-label="triggerLabel"
      :title="triggerLabel"
    >
      <span :class="activeOption.icon" aria-hidden="true" />
      <span class="site-theme-switcher__label">{{ activeOption.label }}</span>
      <span class="i-ph-caret-down site-theme-switcher__caret" aria-hidden="true" />
    </DropdownMenuTrigger>

    <DropdownMenuPortal>
      <DropdownMenuContent
        class="site-theme-switcher__content"
        align="end"
        :side-offset="6"
      >
        <DropdownMenuRadioGroup
          :model-value="preference"
          @update:model-value="selectPreference"
        >
          <DropdownMenuRadioItem
            v-for="option in options"
            :key="option.value"
            class="site-theme-switcher__item"
            :data-theme-preference="option.value"
            :value="option.value"
          >
            <span :class="option.icon" class="site-theme-switcher__item-icon" aria-hidden="true" />
            <span>{{ option.label }}</span>
            <span class="site-theme-switcher__indicator-slot">
              <DropdownMenuItemIndicator class="site-theme-switcher__indicator">
                <span class="i-ph-check" aria-hidden="true" />
              </DropdownMenuItemIndicator>
            </span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenuPortal>
  </DropdownMenuRoot>
</template>

<style scoped>
.site-theme-switcher__trigger {
  position: relative;
  display: inline-flex;
  height: 32px;
  min-width: 36px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 1px solid var(--saier-color-border);
  border-radius: 8px;
  background: var(--saier-color-surface);
  color: var(--saier-color-text);
  cursor: pointer;
  font-size: 14px;
  padding-inline: 9px;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;
}

.site-theme-switcher__trigger::before {
  position: absolute;
  inset-block: -6px;
  inset-inline: 0;
  content: '';
}

.site-theme-switcher__trigger:hover,
.site-theme-switcher__trigger[data-state='open'] {
  border-color: var(--saier-color-accent-border);
  background: var(--saier-color-surface-hover);
}

.site-theme-switcher__trigger:focus-visible {
  outline: 2px solid var(--saier-color-focus);
  outline-offset: 1px;
}

.site-theme-switcher__label {
  max-width: 96px;
  overflow: hidden;
  font-size: 12px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-theme-switcher__caret {
  color: var(--saier-color-text-subtle);
  font-size: 11px;
}

:global(.site-theme-switcher__content) {
  z-index: 1000;
  min-width: 164px;
  padding: 5px;
  border: 1px solid var(--saier-color-border);
  border-radius: 8px;
  background: var(--saier-color-panel-raised);
  box-shadow: var(--saier-shadow-menu);
  color: var(--saier-color-text);
}

:global(.site-theme-switcher__item) {
  display: grid;
  min-height: 44px;
  grid-template-columns: 20px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 8px;
  border-radius: 6px;
  color: var(--saier-color-text);
  cursor: pointer;
  font-size: 13px;
  outline: none;
  padding: 6px 8px;
  user-select: none;
}

:global(.site-theme-switcher__item[data-highlighted]) {
  background: var(--saier-color-accent-soft);
}

:global(.site-theme-switcher__item-icon) {
  color: var(--saier-color-text-muted);
  font-size: 16px;
}

:global(.site-theme-switcher__indicator-slot),
:global(.site-theme-switcher__indicator) {
  display: inline-grid;
  width: 16px;
  height: 16px;
  place-items: center;
}

:global(.site-theme-switcher__indicator) {
  color: var(--saier-color-accent-text);
  font-size: 13px;
}

@media (max-width: 960px) {
  .site-theme-switcher__label,
  .site-theme-switcher__caret {
    display: none;
  }

  .site-theme-switcher__trigger {
    width: 32px;
    min-width: 32px;
    padding-inline: 0;
  }

}

@media (prefers-reduced-motion: reduce) {
  .site-theme-switcher__trigger {
    transition: none;
  }
}
</style>

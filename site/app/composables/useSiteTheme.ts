import { computed } from 'vue'

export type SiteResolvedTheme = 'dark' | 'light'
export type SiteThemePreference = SiteResolvedTheme | 'system'

export const SITE_THEME_PREFERENCES = Object.freeze([
  'system',
  'light',
  'dark',
] as const satisfies readonly SiteThemePreference[])

export function normalizeSiteThemePreference(value: string): SiteThemePreference {
  return SITE_THEME_PREFERENCES.includes(value as SiteThemePreference)
    ? value as SiteThemePreference
    : 'system'
}

export function useSiteTheme() {
  const colorMode = useColorMode()
  const preference = computed<SiteThemePreference>(() => normalizeSiteThemePreference(colorMode.preference))
  const resolvedTheme = computed<SiteResolvedTheme>(() => colorMode.value === 'light' ? 'light' : 'dark')

  function setThemePreference(value: SiteThemePreference): void {
    colorMode.preference = value
  }

  return {
    preference,
    resolvedTheme,
    setThemePreference,
  }
}

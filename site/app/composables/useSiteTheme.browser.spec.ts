import { afterEach, describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'
import {
  normalizeSiteThemePreference,
  useSiteTheme,
} from './useSiteTheme'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('site theme preference', () => {
  it('normalizes unsupported stored values back to system', () => {
    expect(normalizeSiteThemePreference('system')).toBe('system')
    expect(normalizeSiteThemePreference('light')).toBe('light')
    expect(normalizeSiteThemePreference('dark')).toBe('dark')
    expect(normalizeSiteThemePreference('sepia')).toBe('system')
  })

  it('keeps preference and resolved system theme as separate state', () => {
    const colorMode = reactive({
      forced: false,
      preference: 'system',
      unknown: false,
      value: 'dark',
    })
    vi.stubGlobal('useColorMode', () => colorMode)

    const { preference, resolvedTheme, setThemePreference } = useSiteTheme()
    expect(preference.value).toBe('system')
    expect(resolvedTheme.value).toBe('dark')

    colorMode.value = 'light'
    expect(resolvedTheme.value).toBe('light')

    setThemePreference('dark')
    expect(colorMode.preference).toBe('dark')
    expect(preference.value).toBe('dark')
  })
})

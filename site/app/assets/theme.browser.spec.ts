import { afterEach, describe, expect, it } from 'vitest'
import './theme.css'

const mounted: HTMLElement[] = []

afterEach(() => {
  for (const element of mounted.splice(0))
    element.remove()
})

function createThemeProbe(theme: 'dark' | 'light'): HTMLElement {
  const scope = document.createElement('div')
  scope.className = theme
  const probe = document.createElement('div')
  probe.style.backgroundColor = 'var(--saier-color-checker-light)'
  scope.appendChild(probe)
  document.body.appendChild(scope)
  mounted.push(scope)
  return probe
}

describe('site theme tokens', () => {
  it('keeps transparency checker colors invariant across themes', () => {
    const dark = createThemeProbe('dark')
    const light = createThemeProbe('light')

    expect(getComputedStyle(dark).backgroundColor).toBe('rgb(241, 242, 244)')
    expect(getComputedStyle(light).backgroundColor).toBe('rgb(241, 242, 244)')
  })
})

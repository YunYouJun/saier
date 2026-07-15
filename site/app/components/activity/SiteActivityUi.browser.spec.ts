import { afterEach, describe, expect, it } from 'vitest'
import { createApp, h } from 'vue'
import {
  SiteActivityButton,
  SiteActivityField,
  SiteActivityPageHeader,
  SiteActivityPanel,
  SiteActivityToolbar,
} from './index'
import '~/assets/activity.css'
import '~/assets/theme.css'

const mounted: Array<() => void> = []

afterEach(() => {
  for (const unmount of mounted.splice(0))
    unmount()
})

function mountActivity(theme: 'dark' | 'light'): { el: HTMLElement, submitCount: () => number } {
  let submits = 0
  const el = document.createElement('div')
  el.className = theme
  document.body.appendChild(el)
  const app = createApp({
    render: () => h('main', { class: 'site-activity-surface' }, [
      h(SiteActivityPageHeader, {
        description: 'Temporary workspace',
        icon: 'i-ph-game-controller',
        kicker: 'Saier Activity',
        title: 'Shared Activity UI',
      }),
      h(SiteActivityToolbar, {
        icon: 'i-ph-game-controller',
        status: 'Connected',
        title: 'Toolbar',
      }, {
        actions: () => h(SiteActivityButton, { size: 'compact' }, () => 'Invite'),
      }),
      h(SiteActivityPanel, {
        description: 'Standard panel description',
        icon: 'i-ph-users-three',
        onSubmit: (event: SubmitEvent) => {
          event.preventDefault()
          submits++
        },
        tag: 'form',
        title: 'Standard panel',
      }, {
        default: () => [
          h(SiteActivityField, { hint: 'Optional', label: 'Room name' }, {
            default: () => h('input', { class: 'site-activity-control' }),
          }),
          h(SiteActivityButton, {
            ...{
              active: true,
              selectable: true,
              type: 'submit' as const,
              variant: 'primary' as const,
            },
            'aria-label': 'Primary action',
          }, () => 'Create'),
        ],
      }),
    ]),
  })
  app.mount(el)
  mounted.push(() => {
    app.unmount()
    el.remove()
  })
  return { el, submitCount: () => submits }
}

describe('site Activity UI primitives', () => {
  it('provides semantic structure and forwards native form behavior', () => {
    const { el, submitCount } = mountActivity('light')
    const panel = el.querySelector<HTMLFormElement>('form.site-activity-panel')!
    const heading = panel.querySelector<HTMLElement>('.site-activity-panel__title')!
    const button = panel.querySelector<HTMLButtonElement>('.site-activity-button')!

    expect(panel.getAttribute('aria-labelledby')).toBe(heading.id)
    expect(panel.querySelector('label')?.textContent).toContain('Room name')
    expect(panel.querySelector('.site-activity-field__hint')?.textContent).toBe('Optional')
    expect(button.type).toBe('submit')
    expect(button.getAttribute('aria-pressed')).toBe('true')
    panel.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    expect(submitCount()).toBe(1)
  })

  it('inherits editor theme tokens without changing component markup', () => {
    const { el } = mountActivity('dark')
    const panel = el.querySelector<HTMLElement>('.site-activity-panel')!
    const button = el.querySelector<HTMLElement>('.site-activity-button.is-primary')!
    const control = el.querySelector<HTMLElement>('.site-activity-control')!

    expect(getComputedStyle(panel).borderRadius).toBe('8px')
    expect(getComputedStyle(control).minHeight).toBe('36px')
    expect(getComputedStyle(button).backgroundColor).toBe('rgba(96, 165, 250, 0.15)')
    el.className = 'light'
    expect(getComputedStyle(button).backgroundColor).toBe('rgba(37, 99, 235, 0.12)')
  })
})

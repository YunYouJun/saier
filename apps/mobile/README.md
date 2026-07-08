# Saier Mobile

Capacitor packaging spike for the Saier mobile shell. The app reuses the Nuxt site output and the same `/` entry; the site selects `SiteMobilePainterShell` when it runs inside a Capacitor native runtime.

## Scripts

```bash
pnpm build:mobile
pnpm -C apps/mobile run add:ios
pnpm -C apps/mobile run add:android
pnpm -C apps/mobile run sync
pnpm -C apps/mobile run open:ios
pnpm -C apps/mobile run open:android
```

`pnpm build:mobile` runs `nuxt generate`, copies `site/.output/public` into `apps/mobile/www`, and validates the Capacitor config. Native platform projects are intentionally not generated in this spike; create them locally with `add:ios` or `add:android` when Xcode / Android Studio are available.

## Adapter Boundary

The web bundle keeps using `SitePlatformAdapter`. In a Capacitor native runtime the adapter switches to `kind: 'capacitor'` and connects:

- status bar styling through `@capacitor/status-bar`
- safe-area layout through the mobile shell CSS `env(safe-area-inset-*)`
- file export through `@capacitor/filesystem`
- system share through `@capacitor/share`

The drawing packages (`@saier/core`, `@saier/pixi`, `saier`, `@saier/vue`) do not depend on Capacitor.

## Current Limits

- File open still uses the WebView file input instead of a native document picker.
- The native `ios/` and `android/` folders are not committed yet.
- Store signing, app icons, splash screens, update flow, and final touch-first panels are out of scope for P12-02.

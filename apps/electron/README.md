# Saier Electron Spike

P12-01 validates that the existing Nuxt site can run inside an Electron shell while native capabilities enter through the site platform adapter.

## Commands

```bash
pnpm dev:electron
pnpm build:electron
pnpm -C apps/electron run start
```

- `pnpm dev:electron` starts the Nuxt site dev server and launches Electron with `SAIER_ELECTRON_RENDERER_URL=http://localhost:8080/`.
- `pnpm build:electron` runs the site production build and validates Electron main / preload syntax.
- `pnpm -C apps/electron run start` launches Electron against `SAIER_ELECTRON_RENDERER_URL` or the default `http://localhost:8080/`; start the site server separately first.

## Current Limits

- No distributable packaging is produced yet.
- No auto-update, code signing, notarization, or native app menu.
- The renderer is still the web site; native file open / save are exposed through `window.__SAIER_PLATFORM_ADAPTER__`.
- Cloud auth and storage remain Web-backed until a dedicated desktop account flow is designed.

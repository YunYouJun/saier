---
title: Browser Compatibility Matrix
---

# Browser compatibility matrix

Updated: 2026-07-07

This matrix captures the public beta support posture. It distinguishes verified automation from supported browser families that still need release-day manual smoke on real devices.

## Matrix

| Target                    | Status                | Coverage                                                                                                                                                            | Known limits                                                                                                                                                   |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chrome / Chromium desktop | Verified              | `pnpm test:e2e` and browser specs run on Playwright Chromium; `pnpm perf:baseline` produced the current 1024 x 1024 / 4096 x 4096 baseline in Chromium 149.         | WebGL must be available. Browser storage cleanup can remove local drafts; cloud sync or downloaded project files remain the durable path.                      |
| Microsoft Edge desktop    | Supported             | Same Chromium engine path as Chrome; no Edge-only API is required.                                                                                                  | Release candidate still needs one manual smoke in Edge because enterprise policies can block IndexedDB, WebGL, downloads, or popups independently of Chromium. |
| Safari 17+ desktop        | Supported with limits | The site uses standard file input / download flows instead of requiring File System Access; painting and project import/export do not depend on Chromium-only APIs. | Pointer pressure, coalesced events, and tilt/twist vary by device. WebGL, IndexedDB, and downloaded files must be available.                                   |
| iPadOS Safari 17+         | Supported with limits | Touch input is expected through Pointer Events; the tiled backend keeps smudge / watercolor sampling in the CPU tile path.                                          | PWA storage can be evicted by iPadOS. Treat local draft recovery as best effort and use cloud sync or project export for durable saves.                        |

## Performance Baseline

The current baseline is stored in [performance-baseline/latest](./performance-baseline/latest):

| Case        |  Dabs | Duration |  Dabs/s | Tiles |  Surface |     Undo | Stable drift |
| ----------- | ----: | -------: | ------: | ----: | -------: | -------: | -----------: |
| 1024 x 1024 | 13140 | 659.2 ms | 19933.3 |     4 | 2.00 MiB | 50.0 MiB |          0 B |
| 4096 x 4096 | 13140 | 636.7 ms | 20637.7 |     4 | 2.00 MiB | 50.0 MiB |          0 B |

## Release Smoke

Before tagging a beta release:

1. Run automated gates: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:e2e`, `pnpm build`, `pnpm docs:build`, `pnpm perf:baseline`.
2. Smoke the production site in Chrome and Edge: create canvas, draw, undo/redo, layer edit, save/open project, export PNG, cloud upload/download/delete when YunLeFun credentials are available.
3. Smoke Safari desktop or iPadOS Safari: draw with touch/mouse, save/open project through file input/download, restore a local draft, export PNG.

## Error Surface

Browser/backend capability gaps must be user-visible:

- Smudge / watercolor presets are blocked with a sampler/backend message when `surface.sampleRegion` is unavailable.
- External brush presets are blocked with an engine-not-loaded message until the engine is registered.
- Project import separates unreadable file, invalid JSON, and invalid Saier project content.

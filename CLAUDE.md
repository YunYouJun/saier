# CLAUDE.md

> Guidance for coding agents (codex / Claude / etc.) working in this repo.
> `AGENTS.md` is kept identical to this file — update both together.

## Project Overview

`saier` (current package name: `pixi-painter`) — **an elegant online painting runtime powered by PixiJS**.

- **Purpose**: an elegant **online painting board**. Recreates the _painterly feel_ of tools like SAI / Procreate / Krita on the web (SAI is one reference among several, not a clone). Evolving from a PixiJS brush demo into a **Pixi-agnostic raster painting engine** + a Pixi display / interaction layer.
- **Architecture**: pnpm workspace monorepo.
- **Render**: PixiJS v8 (WebGL renderer in production).
- **Build**: unbuild (libraries), Vite (site / examples), VitePress (docs).
- **Lint**: @antfu/eslint-config (flat config).
- **Test**: vitest.

## ⭐ Source of truth for the rewrite

The architecture rewrite is planned in **`docs/design/`** (a VitePress section). **Read it before making any structural change.**

- `docs/design/index.md` — overview: current-state diagnosis, target architecture, package layout
- `docs/design/roadmap.md` — the ordered execution plan (phases P0–P9, milestones M1–M5)
- `docs/design/interfaces.md` — core TS contracts (`BrushEngine` / `SurfaceBackend` / `Document`)
- `docs/design/decisions.md` — key architectural decisions (ADR, D1–D6)
- `docs/design/testing.md` — testing & determinism strategy

**How to execute**:

1. Do **one phase (P-x) at a time**. Start at P0.
2. Satisfy that phase's **acceptance criteria** (preferably as automated tests) before moving on.
3. Keep existing demos runnable (`examples/vue`, `examples/react`, the site's `/shodo` page).
4. If a decision conflicts with the maintainer's intent, **ask before writing**.

## Commands

```bash
pnpm install
pnpm dev            # run the Vue example (default dev target)
pnpm dev:site       # run the Nuxt site (landing + /shodo demo)
pnpm docs:dev       # run the VitePress docs site
pnpm build          # build library + site
pnpm build:lib      # build packages/pixi-painter only
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
pnpm docs:build     # build docs
```

## Repository Layout

```
packages/
  pixi-painter/   # main library (painter, board, brush, eraser, layers, history)
  controls/       # @saier/vue — Vue UI
  shodo/          # experimental calligraphy stroke engine (algorithms to harvest)
examples/         # vue / react integrations
site/             # Nuxt landing + interactive demos
docs/             # VitePress documentation (guide + design/roadmap)
```

Target packages introduced by the rewrite (see `docs/design/`): **`core`** (Pixi-agnostic) and **`pixi`**.

## Conventions

- ESM only (`"type": "module"`).
- Strict TypeScript.
- Follow @antfu/eslint-config defaults (no prettier, no semicolons, single quotes). Run `pnpm lint` before finishing.
- Target **PixiJS v8** APIs. **P0 (milestone M1) is complete**: `createPainter()` boots on v8 (async `Application.init`; canvas / board / layers Graphics → v8, `name` → `label`, SVG icon via `Assets.load`), verified green by `pnpm typecheck` + `pnpm test` (vitest) + `pnpm test:e2e` (examples + site); examples/vue · site · react all boot on v8. **brush / eraser still use deprecated v7 Graphics** (`beginFill` / `drawCircle`) — intentionally left for **P1** to delete with the raster engine. **Next phase: P1** (raster engine — `@saier/core` + `@saier/pixi`).
- All brush math in **document space**, independent of zoom / DPR (decision D2).
- Avoid `Date.now()` / `Math.random()` in brush / stabilizer logic — use injectable seeds (determinism; see `docs/design/testing.md`).

## Code Style

- Type-first: explicit types on exports; JSDoc on public APIs.
- Keep new code consistent with surrounding files.
- Do **not** commit or push unless the maintainer asks.

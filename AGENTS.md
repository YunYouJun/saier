# AGENTS.md

> Guidance for coding agents (codex / Claude / etc.) working in this repo.
> `CLAUDE.md` is kept identical to this file — update both together.

## Project Overview

`saier` (published as `saier`; the legacy `pixi-painter` name is kept as a deprecated alias) — **an elegant online painting runtime powered by PixiJS**.

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
pnpm dev            # run the Nuxt site (default final experience)
pnpm dev:site       # run the Nuxt site (landing + /shodo demo)
pnpm dev:vue        # run the lightweight Vue example sandbox
pnpm docs:dev       # run the VitePress docs site
pnpm build          # build library + site
pnpm build:lib      # build packages/saier only
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # vitest
pnpm docs:build     # build docs
```

## Repository Layout

```
packages/
  saier/          # umbrella library (painter, board, brush, eraser, layers, history; re-exports core + pixi)
  core/           # @saier/core — Pixi-agnostic raster engine
  pixi/           # @saier/pixi — Pixi backends (RenderTexture + tile) + viewport
  vue/            # @saier/vue — Vue UI
  shodo/          # @saier/shodo — experimental calligraphy stroke engine (algorithms to harvest)
examples/         # vue / react integrations
site/             # Nuxt landing + interactive demos
docs/             # VitePress documentation (guide + design/roadmap)
```

Target packages introduced by the rewrite (see `docs/design/`): **`core`** (Pixi-agnostic) and **`pixi`**.

## Conventions

- ESM only (`"type": "module"`).
- Strict TypeScript.
- Follow @antfu/eslint-config defaults (no prettier, no semicolons, single quotes). Run `pnpm lint` before finishing.
- Target **PixiJS v8** APIs (decision D3). **P0–P5 are implemented and committed** (`9152804`), and **D8 restructure / rename is complete** (`353722a`): packages now live at `packages/{core,pixi,saier,vue,shodo}` with `saier`, `@saier/core`, `@saier/pixi`, and `@saier/vue` as the active package names. The raster paint pipeline, real eraser, bbox/tile undo, headless controller, input feel (sampler / stabilizer / pressure curves), brush family (pen / pencil / marker / airbrush / calligraphy), layer stack, and shared `usePainter()` are in place. The old per-stroke `Graphics` brush/eraser are gone. **Current local state**: `main` is ahead of `origin/main` by 2 commits and has uncommitted example build-gate fixes; do not assume a clean tree until `git status` says so.
- All brush math in **document space**, independent of zoom / DPR (decision D2).
- Avoid `Date.now()` / `Math.random()` in brush / stabilizer logic — use injectable seeds (determinism; see `docs/design/testing.md`).

## Code Style

- Type-first: explicit types on exports; JSDoc on public APIs.
- Keep new code consistent with surrounding files.
- Do **not** commit or push unless the maintainer asks.

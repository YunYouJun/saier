---
title: P0-07 · 回归：examples + demo 冒烟
---

# P0-07 · 回归验证：examples + demo 冒烟

- **Phase / ID**: P0 / P0-07
- **Depends on**: P0-02（必做）；P0-03 / P0-04 / P0-05 若选择执行则在其后
- **Files**: `examples/vue`、`examples/react`、`site`（`/shodo`）、必要时回补各 `package.json`
- **Effort**: S

## Context

P0 收口卡：确认 v8 迁移后整套 demo 仍可用，作为里程碑 **M1** 的出口。`shodo` 已用 v8 风格（`await app.init`），但从 tiny.js 移植未完（残留 `new Tiny.Sprite` / `Tiny.calligraphy`）——本卡**只冒烟、不修 shodo**，若 `/shodo` 本就跑不起来，记录现状并标注归属到 shodo 收割（P3），不在本卡展开。

## Steps

1. `pnpm build:lib` 通过。
2. `examples/vue`（`pnpm dev:vue`）逐项冒烟：brush / eraser / image 导入 + 变换 / selection / clear / 缩放 / undo / redo / download / extract。
3. `examples/react`（`pnpm build:react` 或其 dev）至少能加载 + 画线。
4. `site`（`pnpm dev` / `pnpm dev:site`）首页与 `/shodo` 能打开；`/shodo` 若因移植未完报错，**记录**而非修复。
5. `pnpm lint` + `pnpm typecheck` 全绿。

## Acceptance

- [ ] `pnpm build:lib`、`pnpm typecheck`、`pnpm lint`、`pnpm test` 全绿。
- [ ] `examples/vue` 全部工具冒烟通过。
- [ ] `examples/react` 能加载并画线。
- [ ] site 首页可打开；`/shodo` 现状已记录（可用 / 待 P3）。
- [ ] M1 出口确认：在 [`tasks/index`](./) 勾掉 P0 全部卡。

## Out of scope

- 修复 shodo 的 tiny.js 残留（→ P3 收割）。
- 任何 raster / 新架构代码（→ P1 起）。

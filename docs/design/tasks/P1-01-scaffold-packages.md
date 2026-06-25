---
title: P1-01 · 脚手架 core + pixi
---

# P1-01 · 脚手架两个新包：`core` + `pixi`

- **Phase / ID**: P1 / P1-01
- **Depends on**: —（可与 P0 并行起步）
- **Files**: `packages/core/**`、`packages/pixi/**`、`pnpm-workspace.yaml`、`tsconfig.json`
- **Effort**: M
- **Status**: 🔴 P1 地基

## Context

P1 把绘画核心从 `pixi-painter` 里抽出来：`core`（**与 Pixi 无关**）+ `pixi`（Pixi 桥）。这张卡只立**空骨架**并接通构建 / 类型，不写业务逻辑。沿用仓库现有约定（`unbuild` + ESM + 各包自带 `build.config.ts`）。

## Steps

1. `packages/core/`：
   - `package.json`：`name: "@saier/core"`、`type: module`、`exports` 指向 `./dist/index.mjs` + `./dist/index.d.ts`、`scripts.build: unbuild`。**无 `pixi.js` 依赖**（这是硬约束）。
   - `src/index.ts`（先空导出）、`build.config.ts`（仿 `pixi-painter`）、`test/`。
2. `packages/pixi/`：
   - `package.json`：`name: "@saier/pixi"`、依赖 `@saier/core`（`workspace:*`）+ `pixi.js`（peer 或 dep，与 `pixi-painter` 对齐 `^8.19.0`）。
   - `src/index.ts`、`build.config.ts`、`test/`。
3. 接通 workspace 与类型：
   - `pnpm-workspace.yaml` 的 `packages/*` 已覆盖，无需改；`pnpm install` 让 workspace 链接生效。
   - 根 `tsconfig.json` 若用 paths，加 `@saier/core`、`@saier/pixi` → `packages/*/src`（便于 dev 直接引源码）。
4. 各加一个占位测试（`expect(true).toBe(true)`）确保 `pnpm test` 能发现新包。

## Acceptance

- [ ] `pnpm -F @saier/core build` 与 `pnpm -F @saier/pixi build` 均通过。
- [ ] `core` 的 `package.json` / lockfile 中**不出现 pixi.js**（依赖隔离）。
- [ ] `pnpm typecheck`、`pnpm test` 全绿。

## Out of scope

- 任何接口 / 业务实现（→ P1-02 起）。
- 改 `pixi-painter` 现有代码（→ P1-08）。

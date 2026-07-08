---
title: P10-05 · Release flow closure
---

# P10-05 · 发布流程收口

- **Phase / ID**: P10-05
- **Depends on**: P10-04 browser compatibility and performance baseline
- **Files**: `package.json`、`packages/*/package.json`、`docs/design/public-beta-checklist.md`、release notes
- **Effort**: S

## Context

D8 已完成包名重构，正式对外入口是 `saier` / `@saier/*`，旧 `pixi-painter` 只作为 deprecated compatibility alias。P10-05 把发布动作写成固定流程，避免 beta 发布时遗漏 gate、包顺序、alias/deprecation 或 changelog。

## Release Flow

1. 确认 worktree 只包含本次发布所需改动，并更新 release notes / changelog。
2. 运行最终门禁：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm test:e2e`、`pnpm build`、`pnpm docs:build`、`pnpm perf:baseline`。
3. 运行包体检查：`pnpm pack:check`。
4. 做 npm dry run：`pnpm publish:beta:dry`。
5. 版本号用 `pnpm release` 或 beta 预发布用 `pnpm release:beta`。自动生成的提交信息必须遵循 Conventional Commits。
6. 发布 active packages：`@saier/core`、`@saier/pixi`、`saier`、`@saier/vue`，beta 使用 `--tag beta`。
7. 处理 legacy alias：旧 `pixi-painter` 不再作为文档推荐入口；发布同版本 alias 包或执行 `npm deprecate pixi-painter@"<目标版本范围>" "pixi-painter has moved to saier; install saier instead"`。
8. 发布后 smoke npm install：新项目安装 `saier`，确认 `@saier/*` workspace 依赖解析、Vite build、docs getting started 命令仍可用。

## Acceptance

- [x] 发布包清单固定为 `@saier/core`、`@saier/pixi`、`saier`、`@saier/vue`。
- [x] `pack:check`、`publish:beta:dry`、`publish:beta`、`release:beta` 已在根 `package.json` 保留。
- [x] 发布流程包含 lint / typecheck / tests / e2e / site build / docs build / performance baseline。
- [x] `pixi-painter` deprecated alias / `npm deprecate` 策略写入流程。
- [x] release notes / changelog 更新是发布前置步骤。

## Out of scope

- 本卡不实际发布 npm 包。
- 不引入自动 changelog 生成器；发布者可以先手写 release notes。

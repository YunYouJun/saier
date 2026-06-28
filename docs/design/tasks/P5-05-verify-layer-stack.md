---
title: P5-05 · 图层栈验收
---

# P5-05 · 图层栈验收

- **Phase / ID**: P5 / P5-05
- **Depends on**: P5-01、P5-02、P5-03、P5-04
- **Files**: `test/`、`examples/*`、`site/`
- **Effort**: S
- **Status**: ✅ 已完成

## Context

把 [roadmap P5](../roadmap#p5-图层栈能力) 的验收落成自动化验证：core command、Pixi 像素合成、UI 静态解耦、共享 bootstrap 与 examples/site 冒烟。

## Result

已补 core controller / document 单测、Pixi browser 像素测试、pixi-painter 导出与缩略图测试，并通过 grep 验收 UI 静态解耦与共享 bootstrap。验证命令：`pnpm test`、`pnpm lint`、`pnpm typecheck`、`pnpm build`、`pnpm test:e2e`。

## Steps

1. 单测：controller layer commands 与 Document 事件。
2. 浏览器测试：多图层排序 / 显隐 / opacity / blend / export 合成。
3. grep 验收：UI 不直接引用 `PainterBrush.*`，examples/site 不读 `canvas.container.children` 作为图层数据。
4. 运行 `pnpm test`、`pnpm lint`、`pnpm typecheck`、相关 package build、root build、e2e。

## Acceptance

- [x] P5 自动化测试全绿。
- [x] examples/vue 与 site 均能启动并通过 Playwright smoke。
- [x] P5 任务卡状态与结果回写。

## Out of scope

- P6 图层高级能力。

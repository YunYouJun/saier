---
title: P5-04 · 共享 usePainter bootstrap
---

# P5-04 · `@saier/vue`：共享 `usePainter()` bootstrap

- **Phase / ID**: P5 / P5-04
- **Depends on**: P5-01、P5-02
- **Files**: `packages/controls/composables/**`、`examples/vue/**`、`site/**`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

P5 要消除 examples/site 各自手写 `createPainter + await init + 控件状态接线` 的重复。共享 composable 是 Vue UI 与 painter runtime 的稳定边界，也避免未来再次漏掉 Pixi v8 的 async init。

## Result

新增 `packages/controls/composables/usePainter.ts`，统一 canvas ref、`createPainter()`、`await init()`、controller state mirror、layer actions、缩略图刷新与销毁。`examples/vue` 主 demo、AI demo 与 site 首页都改为消费 `@saier/vue/composables/usePainter`。

## Steps

1. 在 controls 包新增 `usePainter()`：持有 canvas ref、painter lifecycle、controller state mirror、extract helper 与 destroy。
2. `examples/vue` 的 `usePixiPainter()` 改为包一层业务逻辑，底层消费共享 `usePainter()`。
3. site 首页直接消费共享 `usePainter()`。
4. Vite / Nuxt alias 对齐 `@saier/vue`，不再重复 bootstrap。

## Acceptance

- [x] `examples/vue` 与 `site` 共用同一个 `usePainter()`。
- [x] 初始化只在 painter `init()` 完成后暴露实例。
- [x] 组件卸载时销毁 painter。

## Out of scope

- React hook（后续按需要补）。

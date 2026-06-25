---
title: P1-02 · core 契约 + 几何
---

# P1-02 · `core`：核心契约（types）+ 几何工具

- **Phase / ID**: P1 / P1-02
- **Depends on**: P1-01
- **Files**: `packages/core/src/{types,math}/**`、`src/index.ts`、`test/`
- **Effort**: M
- **Status**: 🔴 P1 公共语言

## Context

把 [Core Interfaces](../interfaces) 里的契约落成真实 TS——这是 BrushEngine / Backend / Document / UndoManager 的共同语言，先定型再实现。纯类型 + 小工具，零 Pixi，可纯 node 单测。

## Steps

1. `src/types/`：照 [interfaces](../interfaces) 定义并导出：
   `BrushInputPoint`、`RGBA`、`BrushDab`、`BrushContext`、`BrushEngine`、`DirtyRect`、`CompositeMode`、`StrokePatch`、`TilePatch`、`SurfaceBackend`。
2. `src/math/`：
   - `DirtyRect` 工具：`empty()`、`union(a,b)`、`fromCircle(x,y,r)`、`expand(rect, pad)`、`clampToSize(rect, w, h)`、`isEmpty(rect)`。
   - `color`：`hexToRGBA('#f70a8d')` / `rgbaToHex` / premultiply 辅助（供 backend 对齐 Pixi premultiplied alpha）。
3. `src/index.ts` re-export 全部公共类型与工具。
4. 单测 `test/math.spec.ts`：`union` / `fromCircle` / `clampToSize` 的边界用例。

## Acceptance

- [ ] `pnpm -F @saier/core build` + `typecheck` 通过，导出上述类型与工具。
- [ ] `test/math.spec.ts`：dirty rect 合并 / 由圆生成 / 裁剪到画布边界，断言通过。
- [ ] 仍无 pixi.js 依赖。

## Out of scope

- BrushEngine / Document 的实现（→ P1-03 / P1-04）。
- tile / `TiledSurface`（P2，仅保留 `TilePatch` 类型占位）。

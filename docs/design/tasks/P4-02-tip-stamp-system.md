---
title: P4-02 · 笔尖 / 戳印系统
---

# P4-02 · 笔尖 / 戳印系统（core 契约 + 两后端渲染）

- **Phase / ID**: P4 / P4-02
- **Depends on**: P1-02（`BrushDab.tipId/hardness`）、P1-05（GPU dab）、P2-02（CPU dab）
- **Files**: `packages/core/src/brush/tips.ts`、`packages/pixi/src/dab-cache.ts`、`packages/core/src/surface/rasterizer.ts`、`test/`
- **Effort**: M
- **Status**: 🟡

## Context

笔尖决定 dab 长什么样：软圆、硬圆、带纹理的笔触。`BrushDab.tipId` + `hardness` 是契约，**两个后端都要按它渲染**（[P1-05](./P1-05-rendertexture-backend) 的 dab 缓存、[P2-02](./P2-02-cpu-dab-rasterizer) 的 CPU 光栅器）。

## Steps

1. `core/brush/tips.ts`：定义内置 tip（`round-soft` / `round-hard` / `textured-*`），tip = 一张归一化 alpha 蒙版（程序生成或贴图 id）。
2. GPU 后端（P1-05）：按 `tipId` 取/生成对应 dab 纹理，`hardness` 调边缘；缓存。
3. CPU 光栅器（P2-02）：按 tip 蒙版 + hardness 写覆盖率（替代纯解析圆）。
4. 一致性：同一 `BrushDab` 在两后端渲染结果应高度一致（golden 容差比对）。

## Acceptance

- [ ] `round-soft` vs `round-hard` 边缘可见不同（采样断言）。
- [ ] 带纹理 tip 能渲染出笔触质感（golden）。
- [ ] 两后端对同一 dab 的输出在容差内一致。

## Out of scope

- 混色 / 取色（→ P7）；`.myb` 笔刷（→ P9）。

---
title: P2-05 · 脏 tile 批量上传（rAF）
---

# P2-05 · `pixi`：脏 tile 批量上传（每帧合并）

- **Phase / ID**: P2 / P2-05
- **Depends on**: P2-04
- **Files**: `packages/pixi/src/PixiTileTextureBackend.ts`、`test/`
- **Effort**: M
- **Status**: 🟡 条件性

## Context

CPU 写像素时最容易被 **texture 上传**卡死。一帧内可能产生几十个 dab、弄脏多个 tile，但应**每帧只上传一次脏 tile 集**，而不是每 dab 上传（[roadmap P2「不做：每帧全图上传」](../roadmap#p2-tiledsurface-tile-undo仅当需要大画布-低内存撤销时)）。

## Steps

1. `paintDab` 只 `markDirty`，不上传。
2. 用 `requestAnimationFrame`（或 Pixi ticker）每帧：取 `surface.flushDirty()` 的脏 tile 集 → 对每个脏 tile 调 `texture.source.update()` 上传一次 → 清账。
3. 合并：同一帧多次弄脏同一 tile 只上传一次。
4. 暴露一个计数器 `__uploadsThisFrame`（测试用）。

## Acceptance

- [ ] 一帧内对同一 tile 画 N 个 dab → 该 tile **只上传 1 次**（计数器断言）。
- [ ] 画 5000 dab：上传次数 ∝ 脏 tile 数 × 帧数，**不** ∝ dab 数。
- [ ] 视觉无撕裂 / 掉帧明显回归（手测大笔刷涂抹）。

## Out of scope

- WebWorker 化绘制（P7 之后再评估）。

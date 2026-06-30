---
title: P8-03 · 笔迹回放格式（shodo 收割）
---

# P8-03 · 笔迹回放格式：`{X,Y,T,P}` + 操作流基础

- **Phase / ID**: P8 / P8-03
- **Depends on**: P3-04、P4-01、P7-08
- **Files**: `packages/core/src/format/shodo.ts`、`packages/core/test/shodo-format.spec.ts`
- **Effort**: M

## Context

Roadmap P8 要把 shodo `tablet.ts` 的 `{X,Y,T,P}` 笔迹格式收割为可存储 / 回放 / 协作基础。关键不是 UI 录制，而是先把 stroke record 的时间归一、pressure 保留与 deterministic replay 建起来。

**已落地（2026-06-30）**：`ShodoStrokeRecord` 支持 target layer 与 composite mode；补齐 `SET_BRUSH` / `SET_INK` / `SET_COLOR` 操作类型；新增 `replayShodoStroke()`，使用传入的 `BrushEngine` + `BrushContext` 在 `TiledSurface` 上回放。

## Steps

1. `toShodoStroke(points)`：把绝对时间转为 stroke-local `T`。
2. `fromShodoStroke(points)`：还原 `BrushInputPoint`，保留 `hasPressure`。
3. 定义操作流 union：stroke / set brush / set ink / set color。
4. `replayShodoStroke()`：回放 stroke record，逐 dab 调用 CPU rasterizer。
5. 单测断言同一 stroke record 重放两次，像素逐位一致。

## Acceptance

- [x] `{X,Y,T,P}` 转换保留坐标、相对时间和 pressure。
- [x] stroke replay 不依赖 `Date.now()` / `Math.random()`。
- [x] 同一笔迹回放像素一致。

## Out of scope

- 完整协作协议；跨设备采样压缩；UI 层录制所有 painter 操作。

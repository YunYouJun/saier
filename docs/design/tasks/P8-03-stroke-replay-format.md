---
title: P8-03 · 笔迹录制 / 回放协议
---

# P8-03 · 笔迹录制 / 回放协议：`saier.stroke-log.v1`

- **Phase / ID**: P8 / P8-03
- **Depends on**: P3-04、P4-01、P7-08
- **Files**: `packages/core/src/format/{stroke,shodo}.ts`、`packages/core/test/{stroke,shodo}-format.spec.ts`
- **Effort**: M

## Context

Roadmap P8 要把 shodo `tablet.ts` 的 `{X,Y,T,P}` 笔迹格式收割为可存储 / 回放 / 协作基础。关键不是 UI 录制，而是先把 stroke record 的时间归一、pressure 保留与 deterministic replay 建起来。

**已落地（2026-06-30）**：`ShodoStrokeRecord` 支持 target layer 与 composite mode；补齐 `SET_BRUSH` / `SET_INK` / `SET_COLOR` 操作类型；新增 `replayShodoStroke()`，使用传入的 `BrushEngine` + `BrushContext` 在 `TiledSurface` 上回放。

**下一步设计（2026-07-08）**：公共协议升级为 [`saier.stroke.v1` / `saier.stroke-log.v1`](../stroke-recording)。`ShodoStrokeRecord` 保留为兼容 codec 和测试来源，新的 runtime / 协作 / timelapse 入口使用 `SaierStrokeCommit`。

## Steps

1. `toShodoStroke(points)` / `fromShodoStroke(points)`：保留 legacy compact codec，把绝对时间转为 stroke-local `T`，还原 `BrushInputPoint` 并保留 `hasPressure`。
2. 新增公共类型：`SaierStrokeCommit`、`SaierStrokeReplayEvent`、`SaierStrokeLog`、`SaierReplayOperation`。
3. 定义 compatibility adapter：`ShodoStrokeRecord` ⇄ `SaierStrokeCommit` 的 point-only 子集转换。
4. `replaySaierStroke()`：按 [Stroke Recording](../stroke-recording#replay-algorithm) 回放 point / tick events；普通 stroke 逐 dab 调用 CPU rasterizer，tickable engine 调 `tick(t)`。
5. 单测断言同一 stroke commit / log 重放两次，像素逐位一致；覆盖 airbrush tick event。

## Acceptance

- [x] `{X,Y,T,P}` 转换保留坐标、相对时间和 pressure。
- [x] stroke replay 不依赖 `Date.now()` / `Math.random()`。
- [x] 同一笔迹回放像素一致。
- [x] 公共 API 不再要求业务方引用 `Shodo*` 命名。
- [x] `saier.stroke.v1` 支持 `point` 与 `tick` event。
- [x] `SaierStrokeCommit` 固化 `brushEngine id/version`、`brushPresetSnapshot` 与 `brushContextSnapshot`。
- [x] `patchHash` mismatch 能被测试检测出来。

## Out of scope

- 完整协作协议；跨设备采样压缩；timelapse UI；把 stroke log 作为工程文件唯一真相。

---
title: P3-02 · Stabilizer（跟手平滑）
---

# P3-02 · `@saier/core`：Stabilizer（moving avg → exp → lazy/rope）

- **Phase / ID**: P3 / P3-02
- **Depends on**: P3-01（点流）、P1-02（类型）
- **Files**: `packages/core/src/input/Stabilizer.ts`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成（四档 stabilizer）

## Context

stabilizer 是「跟手」的灵魂：在输入点进 BrushEngine **之前**做平滑。先简单后高级，强度可调。**确定性**（不依赖 `Date.now()` / `Math.random()`；时间用点自带 `time`）。

## Steps

1. 分级实现，统一 `strength: 0..N`：
   - `0`：直通不修正。
   - 轻：**moving average**（窗口可配，参考 shodo 的 4 点）。
   - 中：**exponential smoothing**（`p = lerp(prev, raw, alpha)`，alpha 由 strength 推）。
   - 强：**lazy brush / rope**（光标牵引一个落后的"绳头"，强度=绳长 / 弹簧软硬）。
2. 速度感知（可选）：慢速多平滑、快速少滞后，避免转角发飘。
3. 接口：`push(point) → BrushInputPoint[]`（可能延迟/补点）；`flush()` 收尾把绳头拉到终点。
4. 与 spacing/taper（P3-03）解耦：stabilizer 只管点的位置平滑。

## Acceptance

- [x] `test/stabilizer.spec.ts`：strength 0/轻/中/强 输出可量化区分（如轨迹方差递减）。
- [x] 慢速画圆：强档下轨迹明显更顺、无锯齿抖动（golden / 方差断言）。
- [x] **确定性**：同输入两次输出逐点相等。
- [x] `flush()` 后绳头归位到最后输入点（强档不"缺一截"）。

## Out of scope

- 压感 / size / taper（→ P3-03）；毛笔出锋（→ P3-04）。

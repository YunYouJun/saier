---
title: P3-04 · 收割 shodo → CalligraphyEngine
---

# P3-04 · `@saier/core`：收割 shodo → `CalligraphyEngine`

- **Phase / ID**: P3 / P3-04
- **Depends on**: P3-02、P3-03、P1-03（`BrushEngine` 接口）
- **Files**: `packages/core/src/brush/CalligraphyEngine.ts`、`packages/shodo/src/{stroke-engine,tablet}.ts`（来源）、`test/`
- **Effort**: M
- **Status**: ✅ 已完成（CalligraphyEngine + shodo demo bridge）

## Context

`packages/shodo` 已有可用的毛笔笔迹数学：4 点滑动平均（≈stabilizer）、`velocity→笔锋粗细`曲线、加速度**出锋 taper**、以及可序列化回放格式。把这些**算法**抽进 `core`，作为 `BrushEngine` 的一个实现 `CalligraphyEngine`，render 到 surface（而非 shodo 现在的「每 dab 一个 Sprite」）。

## Steps

1. 从 `stroke-engine.ts` 抽取：buffer 平滑（并入 [P3-02](./P3-02-stabilizer) 的 moving-average）、`velocity → brushSize` 曲线（`pressureVelocity` 那套）、`endStroke` 的加速度出锋 → 并入 [P3-03](./P3-03-pressure-dynamics) 的 taperOut。
2. `CalligraphyEngine implements BrushEngine`：`addPoint` 用 velocity 驱动 size（毛笔特性：快则细、顿则粗），`endStroke` 出锋；dab 交 backend 渲染。
3. **去随机**：`_drawStroke` 里的 `Math.random()` 抖动改成**可注入 seed**（确定性，见 [Testing](../testing)）。
4. 从 `tablet.ts` 抽取可序列化笔迹格式（`{X,Y,T,P}` + 操作流）→ 暂存为 `core/format/` 的草案，供 [P8](../roadmap#p8-文件-序列化) 复用。
5. `site/shodo.vue` demo 切到新 `CalligraphyEngine`（验证收割未丢手感）。

## Acceptance

- [x] `CalligraphyEngine` 在同一 `BrushEngine` 接口下可与 `SimpleBrushEngine` 互换。
- [x] 毛笔特性可见：快笔细、顿笔粗、收尾出锋。
- [x] 确定性：seed 固定时同输入 → 同像素（替换掉 `Math.random()` 后可测）。
- [x] `/shodo` demo 仍可写、手感不劣于现状。

## Out of scope

- libmypaint / `.myb`（→ P9）；纸纹 / 湿边（→ P7）。

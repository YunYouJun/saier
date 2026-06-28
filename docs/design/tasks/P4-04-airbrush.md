---
title: P4-04 · airbrush（时间累积）
---

# P4-04 · `@saier/core`：airbrush（时间累积流量）

- **Phase / ID**: P4 / P4-04
- **Depends on**: P4-01、P4-02
- **Files**: `packages/core/src/brush/presets/airbrush.ts`、`src/brush/AirbrushEngine.ts`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

airbrush 的特征是**停驻也持续喷**：指针不动，浓度随**时间**累积。这要一个**时间驱动的 dab 发射**，而不是只在 pointermove 时产 dab。时间源**可注入**（确定性，见 [Testing](../testing)，不用 `Date.now()`）。

## Result

已新增 `AirbrushEngine`，实现 `BrushEngine` 并额外暴露 `tick(now)`。core 测试用固定 tick 序列验证停驻累积和确定性；`pixi-painter` 在绘制 airbrush 时用 rAF 时间驱动 tick，不在 core 内读取时间。

## Steps

1. `AirbrushEngine`（或给 `SimpleBrushEngine` 加时间钩子）：除按 spacing 产 dab 外，停驻时按 `flow × dt` 在当前点持续喷软 dab。
2. 时间源注入：`tick(now)` 由上游（rAF / 测试时钟）驱动；引擎据 `dt` 累积。
3. 软边 + 低单 dab opacity + 高叠加 → 喷枪渐变。
4. 确定性：固定时间序列 + 固定输入 → 固定像素。

## Acceptance

- [x] **停驻累积**：指针不动、时间推进，覆盖处浓度随时间上升（断言）。
- [x] 移动时呈喷枪渐变软边（golden）。
- [x] 注入时钟下确定性可复现（同 tick 序列 → 同像素）。

## Out of scope

- 真实颜料/水分模型（→ P7）。

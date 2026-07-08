---
title: P1-03 · SimpleBrushEngine
---

# P1-03 · `core`：`SimpleBrushEngine`（spacing + 圆 dab）

- **Phase / ID**: P1 / P1-03
- **Depends on**: P1-02
- **Files**: `packages/core/src/brush/**`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

P1 的笔刷只要「**圆形戳印 + spacing + pressure→size/opacity**」。完整 stabilizer / coalesced / 笔锋是 P3，这里**不做**。实现 [`BrushEngine`](../interfaces#笔刷-brush) 接口，纯逻辑、**确定性**（不许 `Math.random()` / `Date.now()`），可脱离 Pixi 单测。

## Steps

1. `SimpleBrushEngine implements BrushEngine`：
   - `beginStroke(ctx)`：存 `ctx`（baseSize / color），清空 last point 与残余距离。
   - `addPoint(p)`：从上一落点到 `p` 沿线按 `spacing = max(1, spacingRatio * radius)` 步进，逐个产 `BrushDab`；半径 `radius = lerp(minSize, maxSize, pressureCurve(p.pressure))`，`opacity` 同理。返回本次新增的 dab 数组（可能 0..n）。携带「跨调用的残余距离」以保证 spacing 连续。
   - `endStroke()`：补最后一个落点的 dab（无 taper）。
2. `pressureCurve`：先用线性 + 可配置 min/max；鼠标无压感时按上游传入的 pressure（**不在这里硬塞 0.5**，fallback 策略属 P3 输入层）。
3. 坐标：dab 全部用 **document space**（[D2](../decisions#d2)），与缩放无关。

## Acceptance

- [x] `test/brush.spec.ts`：给定一条直线输入点，产出的 dab 数 ≈ 线长 / spacing；首尾覆盖端点。
- [x] pressure 0→1 时 dab 半径在 [minSize, maxSize] 单调变化。
- [x] **确定性**：同输入两次产出的 dab 序列完全相等（深比较）。
- [x] 纯 node 测，无 Pixi。

## Out of scope

- stabilizer / 平滑 / coalesced events / 笔锋 taper（→ P3）。
- 戳印纹理 / 软边 / 多笔刷类型（→ P4）。

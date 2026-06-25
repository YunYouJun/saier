---
title: P3-03 · PressureCurve + 笔迹动态
---

# P3-03 · `@saier/core`：PressureCurve + 笔迹动态（size/opacity/taper）

- **Phase / ID**: P3 / P3-03
- **Depends on**: P1-02（类型）、P1-03（SimpleBrushEngine 基础动态）
- **Files**: `packages/core/src/input/PressureCurve.ts`、`src/brush/dynamics.ts`、`test/`
- **Effort**: M
- **Status**: 🟡

## Context

把 P1-03 的"线性 pressure→size"升级成可调曲线 + 完整笔迹动态：min/max size & opacity、taper in/out（起笔收笔渐细）、anti-alias。鼠标无压感的 **fallback 策略**也在此定（见 [P3-01](./P3-01-pointer-sampler) 的 `hasPressure`）。

## Steps

1. `PressureCurve`：可配置映射 `pressure(0..1) → factor(0..1)`（先支持 linear / ease / 自定义控制点）；分别用于 size 与 opacity（可各一条）。
2. **鼠标 fallback**：`hasPressure=false` 时不假装压感——选一种：① 固定中值；② 用 velocity 模拟（快→细、慢→粗）；③ 关压感只用 base size。做成可配置，默认 velocity 模拟（更像手绘）。
3. 动态参数：`minSize/maxSize`、`minOpacity/maxOpacity`、`spacing`、`taperIn/taperOut`（按笔迹弧长在两端缩 size）。
4. 接入 BrushEngine：`addPoint` 产 dab 时用这些动态算 `radius/opacity`；`endStroke` 应用 taperOut。
5. anti-alias 作为 dab 渲染契约（CPU 光栅器 P2-02 / GPU dab P1-05 都遵守软边）。

## Acceptance

- [ ] 同一条压感序列，linear vs ease 曲线产出可见不同的 size 包络（断言）。
- [ ] 鼠标（无压感）下笔迹按所选 fallback 行为（velocity 模拟时快慢粗细可见）。
- [ ] taper in/out：一笔两端 size 渐细，肉眼 / 包络断言。
- [ ] 确定性：同输入同参数 → 同 dab 序列。

## Out of scope

- stabilizer（→ P3-02）；毛笔 velocity→width 与出锋（→ P3-04，复用本动态）。

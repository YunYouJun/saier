---
title: P3-05 · 触屏 / 手势
---

# P3-05 · `@saier/pixi`：触屏 / 手势（双指缩放 vs 单指画）

- **Phase / ID**: P3 / P3-05
- **Depends on**: viewport（现有 board/canvas pan/zoom）、P3-01（pointer 通道）
- **Files**: `packages/pixi/src/PixiViewport.ts`、gesture 路由、`test/`
- **Effort**: M
- **Status**: 🟡（补 [Risks #5①](../roadmap#risks) 缺口）

## Context

绘画工具在触屏上的基本盘：**单指 = 画，双指 = 平移 + 捏合缩放（+ 可选旋转）**。要在 pointer 路由层把"手势"和"落笔"分开，否则双指会画出两道线。

## Steps

1. 多点 pointer 跟踪：`pointerType==='touch'` 时统计活跃触点数。
2. 路由：1 个触点 → 落笔（走 [P3-01](./P3-01-pointer-sampler) 采样）；≥2 触点 → 手势（pinch 缩放、双指拖动平移、可选旋转），**并取消/回退**已开始的单指笔迹（避免误画半截）。
3. 缩放/平移复用现有 board/canvas viewport 变换（[D7](../decisions#d7) overlay 层）。
4. 笔 / 鼠标路径不受影响（`pointerType==='pen'|'mouse'` 直接落笔）。
5. 防误触：手掌 palm rejection 可作后续（本卡先做基本双指）。

## Acceptance

- [ ] 双指：能平移 + 捏合缩放，且**不留下笔迹**。
- [ ] 单指：正常画。
- [ ] 单指起笔后第二指落下 → 笔迹回退、转入手势（不残留断线）。
- [ ] 笔 / 鼠标行为未回归。

## Out of scope

- palm rejection、双指旋转手感细调（后续）。

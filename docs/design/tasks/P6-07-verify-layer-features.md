---
title: P6-07 · 验收：锁透明 / 剪贴 / 蒙版 / 变换绘画
---

# P6-07 · P6 出口验收

- **Phase / ID**: P6 / P6-07
- **Depends on**: P6-02..06
- **Files**: `packages/core/test/**`、`packages/pixi/test/**`、`packages/saier/test/**`、`e2e/**`
- **Effort**: S
- **Status**: ✅ 已完成（蒙版项除外）

## Result

P6 出口的自动化断言由各功能卡的专测承担,均真 WebGL / 确定性、全绿:锁透明 [`lock-alpha.browser.spec`](../../../packages/saier/test/lock-alpha.browser.spec.ts) + [`lock-alpha-composite.spec`](../../../packages/core/test/lock-alpha-composite.spec.ts);剪贴 [`clipping-layers.browser.spec`](../../../packages/saier/test/clipping-layers.browser.spec.ts);变换绘画 [`transformed-layer-painting.browser.spec`](../../../packages/saier/test/transformed-layer-painting.browser.spec.ts) + [`transform.spec`](../../../packages/core/test/transform.spec.ts);模型 / controller [`layer-attributes.spec`](../../../packages/core/test/layer-attributes.spec.ts)。门禁:typecheck 0 · lint clean · vitest 848 · e2e 3/3(demo 在新 UI 下启动正常)。

**遗留**:① **蒙版**显示与验收随 [P6-04](./P6-04-layer-mask) 阻塞延后;② 浏览器测试套在满负载下有**资源型 flake**(约 1/3 跑会有重 spec 超时,单跑 / 隔离均过)——属测试基建,建议后续降并发 / 拆分。

## Context

把 [Roadmap · P6](../roadmap#p6-锁透明-剪贴-蒙版-带-transform-图层绘画) 的三条出口标准做成**自动化断言**，并补 demo 冒烟，作为 P6 关门。沿用 P1-09 / P5-05 的像素 / golden 验收风格与确定性约束（[Testing](../testing)）。

## Steps

1. 汇总锁透明 / 剪贴 / 蒙版 / 变换绘画的核心像素断言为一组 verify 测试（可跨包，集中表达 P6 出口）。
2. 两后端（RenderTexture / tile）parity 抽查锁透明与蒙版。
3. e2e / demo 冒烟：site 与 examples/vue 在带这些能力的面板下可加层、开锁透明、建剪贴、加蒙版、在变换层上画，无运行时报错。
4. 跑全门禁：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`、`pnpm test:e2e`，全绿。

## Acceptance

- [ ] 锁透明：只改已有像素颜色、不扩边（自动断言）。
- [ ] 剪贴：剪贴层只在下层不透明区显示，导出 = 屏显（自动断言）。
- [ ] 蒙版：画黑遮蔽 / 画白露出、可独立 undo、导出含蒙版（自动断言）。
- [ ] 变换绘画：缩放 / 旋转图层上落点准确（容差 ≤ 1px）、identity 层零回归、确定性回放（自动断言）。
- [ ] 全门禁绿；demo 冒烟通过。

## Out of scope

- 混色 / smudge / 水彩（P7）；文件 / 序列化（P8）。

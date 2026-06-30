---
title: P7-08 · P7 验收（混色 / smudge / 水彩）
---

# P7-08 · P7 验收：拖色 / 过渡 / 湿边 / 纸纹 / 确定性

- **Phase / ID**: P7 / P7-08
- **Depends on**: P7-04、P7-05、P7-06、P7-07
- **Files**: `packages/saier/test/**`、`packages/core/test/**`、`test/`（e2e 冒烟）
- **Effort**: M

## Context

P7 的灵魂在「手感」，但手感需落到**可自动化的像素断言**（[testing](../testing)）。本卡汇总 P7 的验收，对齐 Roadmap P7 出口：**smudge 能拖动已有颜色；两色交界自然过渡；湿边 / 纸纹可开关**，并守住确定性与 undo。

**已落地（2026-06-30）**：P7 全链路验收覆盖拖色、红蓝过渡、`persistence` 拖痕长度、`colorAmount` 自色比例、湿边、纸纹、undo / redo、确定性回放、RenderTexture 后端门控，以及 Vue preset / 参数面板条件渲染。

## Steps

1. **拖色**（core + browser）：红块上 smudge 划向空白 → 拖痕带状渐隐；拖痕长度随 `persistence` 单调增长。
2. **自然过渡**：红 / 蓝交界划过 → 中间带出现连续紫色梯度（采样中间色断言）。
3. **湿边开关**：同笔 `wetEdge` 开 vs 关，边缘像素深度差异可量化（开时边缘更深）。
4. **纸纹开关**：开纸纹后 dab 覆盖出现按文档空间锚定的稳定颗粒，关闭等价无纹理；缩放后颗粒仍咬合。
5. **确定性**：同一组输入点回放，像素逐位一致（seeded、document space，[D2](../decisions#d2)）。
6. **undo / redo**：混色描边撤销 / 重做后像素与操作前 / 后一致。
7. **后端门控**：tile 后端混色全过；GPU 后端按 [D11](../decisions#d11) 的既定行为（禁用 / 回退）有断言兜底。
8. **回归 + 冒烟**：P4/P6 既有笔刷 / 图层断言不回归；`examples/vue` · `site` 冒烟；收尾 `pnpm typecheck` / `pnpm lint` / `pnpm test`(+ `test:e2e`)。

## Acceptance

- [x] 拖色 / 过渡 / 湿边开关 / 纸纹开关四项像素断言通过。
- [x] 确定性回放像素一致；混色 undo / redo 一致。
- [x] 后端门控按 D11 有断言；P4/P6 无回归由完整 gates 兜底。

## Out of scope

- 真机手感主观评测（留档）；性能基准专卡（dab/s 等持续在各 verify 盯，见 [Risks](../roadmap#risks)）。

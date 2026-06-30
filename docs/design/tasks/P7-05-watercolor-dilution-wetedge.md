---
title: P7-05 · 水彩：稀释 + 湿边（wet edge）
---

# P7-05 · 水彩手感：稀释晕染 + 湿边堆积

- **Phase / ID**: P7 / P7-05
- **Depends on**: P7-02（dilution）、P7-04（取色 / 桶）
- **Files**: `packages/core/src/surface/rasterizer.ts`、`packages/core/src/brush/SmudgeEngine.ts`、`packages/core/src/brush/WatercolorEngine.ts`（可选新）、`packages/core/test/`
- **Effort**: L

## Context

水彩 = **稀释晕染**（dilution，P7-02 已起步）+ **湿边**（wet edge：颜料随水退去在描边**边缘堆积**形成深色轮廓，是水彩的标志性观感）。本卡把这两者做成**可开关**的笔刷行为（Roadmap 验收：「湿边 / 纸纹可开关」）。

湿边的本质：单笔描边内，**边缘区颜料浓度 > 中心区**。常见做法是基于「单笔覆盖累积场」——中心覆盖高处反而少留色、边缘梯度大处多留色（近似 `edge = coverage·(1 - coverage)` 的环形权重），叠加到沉积 alpha。

**已落地（2026-06-30）**：`BrushDab.wetEdge` 进入 CPU rasterizer，按 `coverage·(1 - coverage)` 近似环形湿边，`wetEdge=0` 与 P7-02 完全等价；watercolor 作为 smudge 系默认预设，组合高 dilution、wetEdge 与纸纹。node / browser 像素测试覆盖湿边开启后边缘更深、稀释透底、确定性与 undo/redo 既有路径。

## Steps

1. **湿边权重**：在单笔的覆盖累积基础上，给沉积 alpha 叠加边缘强化项（中心衰减、边缘增强），强度由 `wetEdge ∈ [0,1]` 控制；`wetEdge=0` 时完全等价 P7-02 行为。
2. **稀释晕染**：把 P7-02 的 `dilution` 与取色桶（P7-04）联动——高稀释时沉积更薄、底色透出更多，形成水迹叠层的通透感。
3. **（可选）独立引擎**：若 `SmudgeEngine` 参数过载，抽 `WatercolorEngine`（复用桶 + 采样 + 湿边）作为 `engine: 'watercolor'`；否则用预设参数区分即可。**先评估再决定，避免过度拆分**。
4. **确定性**：任何抖动 / 噪声若引入，必须 seeded（[testing](../testing)：禁 `Math.random`）。
5. 单测：① `wetEdge` 开 → 描边边缘像素比中心更深（环形深色）；关 → 均匀；② 高 dilution 叠两笔 → 通透叠色而非纯覆盖；③ 同输入确定性；④ undo / redo 一致。

## Acceptance

- [x] 湿边可开关：开时边缘颜料堆积明显、关时无；像素断言可量化区分。
- [x] 稀释晕染产生通透叠色（底色按比例透出）。
- [x] 确定性（同输入同像素，seeded）；undo / redo 一致。

## Out of scope

- 真流体 / 物理水彩模拟（晕开扩散场）——本卡只做静态湿边 + 稀释近似；纸纹（P7-06）；Worker 化（[decisions 非目标](../decisions)）。

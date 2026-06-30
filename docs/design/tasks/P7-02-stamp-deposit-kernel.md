---
title: P7-02 · stamp 沉积：density / dilution / 边缘核（CPU 光栅器）
---

# P7-02 · stamp 沉积内核：浓度 / 稀释 / 边缘软度

- **Phase / ID**: P7 / P7-02
- **Depends on**: P7-01、P2-02（`rasterizeDab` / `compositeSourceOver`）
- **Files**: `packages/core/src/surface/rasterizer.ts`、`packages/core/src/brush/SimpleBrushEngine.ts`、`packages/core/test/`
- **Effort**: L

## Context

Roadmap P7：**「先 stamp brush（笔尖 mask + spacing + opacity accumulation + blend kernel），再做取色混合」**。本卡落「stamp brush」这一半——把 dab 的沉积从「单一 source-over」升级为可调的**沉积内核**，为 [P7-04](./P7-04-smudge-engine) 取色混合与 [P7-05](./P7-05-watercolor-dilution-wetedge) 水彩铺底。**本卡不读回画布、不取色**，纯写入侧、可纯 node 单测、确定性。

现状：`rasterizeDab` 的 `compositeSourceOver` 用 `srcAlpha = coverage × opacity × color.a`，硬编码 source-over。P7 要让单 dab 的沉积量受 **density**（浓度累积）与 **dilution**（稀释 → 降低有效 alpha、提升与底色融合）调制，并让边缘软度（`hardness`）可表达更连续的羽化核。

**已落地（2026-06-30）**：`SimpleBrushEngine` 从 preset / controller 透传 `density`、`dilution`、`paperTextureId` 到 dab；`rasterizeDab` 以 `opacity × color.a × density × (1 - dilution)` 计算有效沉积 alpha，默认值与旧行为等价；node 像素测试覆盖 density 累积、dilution 透底、hardness 软边单调。

## Steps

1. **density（浓度 / paint amount）**：在 `rasterizeDab` 把 `coverageAlpha` 乘以 `dab.density ?? 1`，作为单 dab 的沉积强度上限；确保同一笔内多 dab 仍由 `source-over` 自然累积到饱和（与 marker 的 `max-alpha` 路径区分）。
2. **dilution（稀释）**：新增稀释合成——`dilution ∈ [0,1]` 时把沉积 alpha 按 `(1 - dilution)` 衰减，使颜料变薄、底色透出（水彩第一步）。提取为 `compositeDilute`（或在 `compositeSourceOver` 内分支），保持预乘正确。
3. **边缘核**：复核 `dabCoverage` → `sampleBrushTipAlpha` 的 `hardness`/`edgeSize` 羽化是否足以表达柔边；必要时把边缘过渡做成连续核（smoothstep），并由 `edgeSoftness`/`hardness` 控制。
4. **引擎透传**：`SimpleBrushEngine.makeDab` 把 `density` / `dilution`（来自 ctx / preset）写进 dab。
5. 单测（node，确定性）：① density 越大单 dab 越实、累积越快达饱和；② dilution 越大同色覆盖越薄、底色透出越多（断言中心像素 alpha / rgb 随 dilution 单调变化）；③ 边缘羽化随 hardness 单调；④ 既有 pen/pencil/marker golden 不回归（默认参数等价旧行为）。

## Acceptance

- [x] density / dilution / 边缘软度三参数在 CPU 光栅器生效，且默认值与现行为像素一致（既有断言全绿）。
- [x] dilution 下颜料变薄、可见底色融合；纯 node 像素断言通过。
- [x] 同一组输入 → 同样像素（无 `Math.random` / `Date.now`，[testing](../testing)）。

## Out of scope

- 取色 / smudge（P7-04，需读回，见 [P7-03](./P7-03-surface-sampler)）；湿边（P7-05）；纸纹（P7-06）；GPU 后端实现（P7 绑定 tile 后端，见 [D11](../decisions#d11)）。

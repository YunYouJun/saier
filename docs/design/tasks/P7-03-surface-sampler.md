---
title: P7-03 · 表面取色采样（SurfaceSampler / sampleRegion）
---

# P7-03 · 表面取色：读回画布的唯一接口

- **Phase / ID**: P7 / P7-03
- **Depends on**: P7-01、P2-01（`TiledSurface.readRegion`）
- **Files**: `packages/core/src/surface/TiledSurface.ts`、`packages/core/src/types/surface.ts`、`packages/core/src/surface/sampler.ts`（新）、`packages/pixi/src/PixiTileTextureBackend.ts`、`packages/core/test/`
- **Effort**: M

## Context

smudge / 取色混合的前提是**读回画布**：在 dab 落点采一块区域的**平均颜色**。这是 P7 唯一的新「读」通道，单列一卡先把接口与实现稳住（参照 [D10](../decisions#d10)）。

CPU `TiledSurface` 已有 `readRegion(rect): Uint8ClampedArray`（预乘 RGBA bytes），本卡在其上做**加权平均采样**并经 `SurfaceBackend` 暴露给上层；GPU `RenderTextureBackend` 无廉价读回 → 本特性**仅 tile 后端实现**（[D11](../decisions#d11)），其它后端不实现该可选方法。

**已落地（2026-06-30）**：`SurfaceBackend.sampleRegion?` / `SurfaceSampler` 成为可选读回能力；`averagePremultiplied` 返回 straight RGBA，透明像素只降低平均 alpha、不污染 RGB；`TiledSurface.sampleRegion` 对越界区域补透明并支持 dab 笔尖权重；`PixiTileTextureBackend.sampleRegion` 直接委托 CPU tile，`RenderTextureBackend` 保持无该能力。

## Steps

1. **接口**：定义 `SurfaceSampler { sampleRegion(layerId, rect, opts?): RGBA }`（返回**直通 / straight** RGBA，便于与笔刷色混合；内部从预乘还原）。在 `SurfaceBackend` 增可选 `sampleRegion?`，core 不依赖 Pixi 类型。
2. **平均算法**：实现 `averagePremultiplied(region, weights?)`——按 dab 笔尖覆盖（`sampleBrushTipAlpha`）做加权平均，对完全透明像素的 rgb 不计权（避免黑边污染）；输出去预乘后的 straight RGBA + 平均 alpha。纯函数、确定性。
3. **TiledSurface 实现**：`TiledSurface.sampleRegion(rect)` 复用 `readRegion` + 平均算法；越界 / 空 tile 视为透明。
4. **后端接线**：`PixiTileTextureBackend.sampleRegion` 委托内部 `TiledSurface`；`RenderTextureBackend` 不实现（保持 `undefined`），上层据此判定 smudge 可用性（[D11](../decisions#d11) / [P7-04](./P7-04-smudge-engine)）。
5. 单测（node）：① 纯色区采样 == 该色；② 半区红半区蓝采样 ≈ 中间色（按覆盖权重）；③ 透明像素不污染均值；④ 去预乘往返无明显误差；⑤ 越界 rect 安全返回。

## Acceptance

- [x] `sampleRegion` 在 `TiledSurface` 与 `PixiTileTextureBackend` 上返回与手算一致的加权平均色。
- [x] 透明像素不拉黑均值；去预乘正确。
- [x] 纯函数确定性；`RenderTextureBackend` 安全地不提供该能力（上层可探测）。

## Out of scope

- 用采样做混色（P7-04）；GPU readback 实现（[D11](../decisions#d11) 暂不做）；选区限制采样（后续）。

---
title: P7-00 · tile 升为默认绘画后端 + P6 显示移植
---

# P7-00 · 地基：tile 成为默认画布，剪贴 / 蒙版显示移植到 tile

- **Phase / ID**: P7 / P7-00（地基，先行）
- **Depends on**: P2-06（tile 后端 + parity）、P6-03（剪贴显示）、P6-04（蒙版显示）
- **Files**: `packages/saier/src/painter.ts`（默认后端 + `syncDisplayMasks` 门控）、`packages/pixi/src/PixiTileTextureBackend.ts`、`packages/pixi/src/RenderTextureBackend.ts`（语义参照）、`packages/saier/test/**`
- **Effort**: L

## Context

[D11 方案 A](../decisions#d11) 已定：**CPU tile 是像素真相、GPU 仅作显示**（Krita / MyPaint / SAI 的工业惯例），P7 混色据此在 tile 上逐 dab 读-改-写。但当前默认后端是 GPU `RenderTextureBackend`，且 P6 的**剪贴 / 蒙版显示重算只接在 RenderTextureBackend**（`painter.syncDisplayMasks` 内 `instanceof RenderTextureBackend` 门控，见 `painter.ts:999`、`painter.ts:1051`）。本卡把默认后端切到 tile，并把剪贴 / 蒙版显示移植到 tile 路径，保证「切默认后端 P6 不回归」。

锁透明已是两后端 parity（[P6-02](./P6-02-lock-alpha)），无需移植；普通绘画 / 橡皮 / 图层 / undo 已在 tile 后端通过 P1 三断言 parity（[P2-06](./P2-06-switch-and-verify)）。故本卡的实际 blast radius = **剪贴 + 蒙版的显示合成**。

## 关键抉择：显示合成放 CPU（推荐）

tile 后端像素在 CPU，符合工业「在 CPU 合成受影响 tile 再上传显示」：

- **推荐**：剪贴（`content × 下层 alpha`）/ 蒙版（`content × luminance(mask)`，[D9](../decisions#d9) 的 BT.601 公式）在 CPU 对受影响 tile 合成出派生显示像素，再上传 GPU 显示纹理。读回零成本、`extract` / 导出与屏显天然一致、无 GPU 朝向兜底负担。
- **备选**：在 tile 的显示纹理上复刻 RenderTexture 的 GPU shader pass——省 CPU，但又要 GPU 资源 + UV 朝向兜底，违背「tile = 真相」的简洁性。

## Steps

1. **默认后端**：`createPainter` / 默认装配把 `backend` 默认值改为 `'tiled'`（保留 `'rendertexture'` 为显式可选）；`examples/vue` 与 `site` 经共享 `usePainter()`（[P5-04](./P5-04-use-painter-composable)）自动获益。
2. **去 `instanceof` 门控**：把 `syncDisplayMasks` 的 `instanceof RenderTextureBackend` 改为**后端能力探测**（如可选接口 `setLayerDisplayMask` / `computeMaskedDisplay`），两后端各自实现、上层不特判具体类。
3. **tile 剪贴显示**：`PixiTileTextureBackend` 实现剪贴合成（`content × 下层 alpha`），CPU 合成受影响 tile → 上传显示；detach / 关闭即时反映。
4. **tile 蒙版显示**：实现 luminance 蒙版（[D9](../decisions#d9)：`reveal = dot(maskRGB, BT.601)`）CPU 合成 → 上传；`setMaskEnabled(false)` 忽略蒙版保留像素；detach 释放隐藏蒙版表面。
5. **导出**：tile 后端派生显示与屏显一致，`extract` 安全。
6. 测试：把现有 `clipping-layers.browser.spec.ts` / `layer-mask.browser.spec.ts` 在 **tile 后端**再跑一遍（parity）；P1 三断言 + P6 验收在 tile 默认下全过；`examples/vue` · `site` 冒烟。

## Acceptance

- [ ] 默认后端 = tile；`examples/vue` + `site` 默认走 tile，P1–P6 功能不回归。
- [ ] 剪贴 / 蒙版显示在 tile 后端正确（与 RenderTexture parity）；导出 = 屏显。
- [ ] `syncDisplayMasks` 不再 `instanceof` 特判单一后端（改能力探测），两后端均可用。
- [ ] `pnpm typecheck` / `pnpm lint` / `pnpm test`(+ `test:e2e`) 全绿。

## Out of scope

- 混色本身（[P7-01](./P7-01-mixing-model)+）；GPU 后端的取色 / 混色（[D11](../decisions#d11) 不做）；废弃 RenderTexture 后端（保留为可选 / 实验）。

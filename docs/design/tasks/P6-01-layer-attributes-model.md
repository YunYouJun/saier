---
title: P6-01 · 图层属性模型（锁透明 / 剪贴 / 蒙版 / transform）
---

# P6-01 · `@saier/core`：图层属性模型与 controller 命令

- **Phase / ID**: P6 / P6-01
- **Depends on**: P1-04、P5-01
- **Files**: `packages/core/src/document/RasterLayer.ts`、`packages/core/src/document/Document.ts`、`packages/core/src/controller/PainterController.ts`、`packages/core/src/math/**`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Result

`RasterLayer` 扩了 `lockAlpha` / `clip` / `transform?` / `mask?`(默认 unlocked / unclipped / identity / 无蒙版);新增 `math/transform.ts`(`LayerTransform` + `composeLayerMatrix` / `invertMatrix` / `documentToLayer` / `layerToDocument` / `isIdentityTransform`,纯函数确定性)。`Document` 加 `setLockAlpha` / `setClip` / `setTransform` / `attachMask` / `detachMask` / `setMaskEnabled`(clamp + no-op 不重复 emit);`PainterController.layer` 暴露对应命令,`PainterLayerState` 快照带上新字段(transform / mask 深拷贝)。单测覆盖矩阵互逆(误差 < 1e-6)、identity、奇异矩阵抛错、确定性、各 setter 的 emit/no-op、controller 转发与防御性快照。门禁:typecheck 0 · lint clean · vitest 全绿。

## Context

P6 的四个能力（锁透明 / 剪贴 / 蒙版 / 带 transform 图层绘画）都先要在**框架无关的模型层**有落脚点，否则后续 pixi 显示、UI 面板会各自塞私有状态、破坏 [D7](../decisions#d7) 的「core 是事实来源」。本卡只扩模型与命令面，不碰像素合成（留给 P6-02..05）。

当前 `RasterLayer` 只有 `id/label/visible/opacity/blendMode`（见 [RasterLayer.ts](https://github.com/YunYouJun/saier/blob/main/packages/core/src/document/RasterLayer.ts)），无锁透明、无 clip、无 mask、无 transform 字段。

## Steps

1. 扩 `RasterLayer`：
   - `lockAlpha: boolean`（默认 false）——锁定透明度，绘画只改已有像素的 RGB。
   - `clip: boolean`（默认 false）——作为下方图层的剪贴图层。
   - `transform?: LayerTransform`——`{ x, y, scaleX, scaleY, rotation, anchorX, anchorY }`，未设视为 identity（纯绘画图层）。
   - `mask?: LayerMaskRef`——`{ id: string, enabled: boolean }`，蒙版像素本身存在 `SurfaceBackend`（P6-04 落地），这里只持有引用与开关。
   - 同步扩 `CreateLayerOptions` 与 `createRasterLayer` 默认值。
2. 在 `math/` 增 `LayerTransform` 类型与纯函数：`composeLayerMatrix(t)`、`invertLayerMatrix`、`documentToLayer(point, t)` / `layerToDocument(point, t)`（供 P6-05 复用；确定性、无 Pixi）。
3. `Document` 增 setter：`setLockAlpha`、`setClip`、`setTransform`、`attachMask`/`detachMask`/`setMaskEnabled`，全部保持 clamp + no-op 不重复 emit `layers:change`。
4. `PainterController.layer` 暴露对应命令：`setLockAlpha/setClip/setTransform/addMask/removeMask/setMaskEnabled`；`PainterLayerState` snapshot 带上新字段。
5. 单测：模型默认值、setter no-op/emit、矩阵 round-trip（`documentToLayer(layerToDocument(p)) ≈ p`）、controller 命令转发与防御性快照。

## Acceptance

- [x] `RasterLayer` 含 `lockAlpha/clip/transform/mask` 且有合理默认值。
- [x] `documentToLayer` / `layerToDocument` 在平移 + 缩放 + 旋转组合下互逆（误差 < 1e-6）。
- [x] 所有新属性变更都经 controller → `Document` → `layers:change`，UI 只读 snapshot。
- [x] 无 Pixi 依赖（`@saier/core` 仍禁 `pixi.js` import）。

## Out of scope

- 任何像素合成 / 显示（锁透明合成 → P6-02；clip 显示 → P6-03；mask 像素 → P6-04；逆变换绘画 → P6-05）。

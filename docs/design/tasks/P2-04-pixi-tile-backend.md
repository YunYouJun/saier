---
title: P2-04 · PixiTileTextureBackend（显示）
---

# P2-04 · `pixi`：`PixiTileTextureBackend`（tile → Pixi 显示）

- **Phase / ID**: P2 / P2-04
- **Depends on**: P2-01、P1-05（显示 / 装配模式参考）
- **Files**: `packages/pixi/src/PixiTileTextureBackend.ts`、`test/`
- **Effort**: L
- **Status**: 🟡 条件性

## Context

把 core 的 `TiledSurface`（CPU 像素）显示出来：每个**有内容的 tile** 一张 Pixi Texture（由 CPU buffer 上传），摆在图层容器里。实现 [`SurfaceBackend`](../interfaces#表面后端-surface-backend)：`paintDab` 委托 P2-02 光栅器写 tile，显示交本卡。core 负责像素、adapter 负责上屏（[D5](../decisions#d5)）。

## Steps

1. 组合而非继承：`PixiTileTextureBackend` 内含一个 `TiledSurface`（core）。
2. `createLayer(id)`：建一个 `layerContainer`，加入注入的 `stage`（P1-08 传 `canvas.layersContainer`）。
3. tile → 纹理：每个有数据的 tile 用 **v8 `BufferImageSource`**（`new Texture({ source: new BufferImageSource({ resource: tile.data, width:256, height:256, alphaMode: ... }) })`）+ 一个定位到 `tileToDoc` 的 `Sprite`。
4. `paintDab` → 调 P2-02 光栅器（写 tile + markDirty）；**不在此处上传**（交 P2-05 批量）。
5. `getDisplayHandle(id)` 返回 `layerContainer`。
6. premultiplied alpha / `alphaMode` 与光栅器写入约定一致（避免边缘发黑 / 变亮）。

## Acceptance

- [ ] 画一笔后对应 tile 的 Sprite 出现并显示正确像素（golden）。
- [ ] 只有**有内容**的 tile 创建了纹理 / Sprite（稀疏，节点数 ∝ 触碰 tile 数，非画布尺寸）。
- [ ] 与 P1 的 RenderTextureBackend 在同一 `SurfaceBackend` 接口下可互换（类型对齐）。

## Out of scope

- 批量上传节流（→ P2-05）。
- 后端切换 / 集成（→ P2-06）。

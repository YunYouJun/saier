---
title: P2-01 · TiledSurface / Tile / dirty 模型
---

# P2-01 · `core`：`TiledSurface` / `Tile` / dirty 模型

- **Phase / ID**: P2 / P2-01
- **Depends on**: P1-02（契约）；整体在 P1 落地后启动
- **Files**: `packages/core/src/surface/{TiledSurface,Tile}.ts`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成（条件性路线已启动）

## Context

把图层像素从「一张大 RenderTexture」换成 **256×256 CPU tile** 网格（[D1](../decisions#d1)、[D4](../decisions#d4)）。tile 持有 `Uint8ClampedArray`（RGBA）像素，**稀疏分配**（没画过的 tile 不占内存）。这是 P7 混色 / smudge 能读像素的前提。纯 core、零 Pixi、可单测。

## Steps

1. `Tile`：`{ tileX, tileY, data: Uint8ClampedArray(256*256*4) | null }`；懒分配（首次写入才 `new`）。
2. `TiledSurface`：
   - `Map<"x,y", Tile>` 稀疏存储；`tileSize = 256`（可配）。
   - 坐标换算：`docToTile(x,y)`、`tileToDoc(tx,ty)`、`tilesForRect(DirtyRect)`。
   - `forEachTileInRect(rect, cb)`、`ensureTile(tx,ty)`、`readRegion(rect) → RGBA buffer`、`writeRegion(rect, buffer)`。
   - dirty 追踪：`markDirty(rect)` 累积一个 `Set<tileKey>` + 合并的 `DirtyRect`，供 adapter 上传时消费、`flushDirty()` 清账。
3. 与 `DirtyRect` 工具（P1-02）对齐。

## Acceptance

- [x] `test/tiled-surface.spec.ts`：`tilesForRect` 覆盖正确 tile 集；跨 tile 边界的 region 读写一致。
- [x] 稀疏：只写一个像素只分配 1 个 tile（内存断言）。
- [x] `markDirty` / `flushDirty` 账目正确。
- [x] 仍无 pixi.js。

## Out of scope

- dab 光栅化（→ P2-02）、撤销（→ P2-03）、显示上传（→ P2-04）。

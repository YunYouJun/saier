---
title: P5-02 · Pixi 图层显示状态同步
---

# P5-02 · `@saier/pixi` / `pixi-painter`：图层显示状态同步

- **Phase / ID**: P5 / P5-02
- **Depends on**: P5-01、P1-08、P2-04
- **Files**: `packages/core/src/types/surface.ts`、`packages/pixi/src/**`、`packages/pixi-painter/src/painter.ts`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

`Document.layers` 是图层状态的事实来源；Pixi backend 只负责把每个 `RasterLayer` 显示成 Sprite / Container。P5 需要把 Document 的顺序、visible、opacity、blend mode 同步到 Pixi 显示对象，并保证导出走同一合成结果。

## Result

`SurfaceBackend` 增加显示状态能力；RenderTexture / tiled backend 都实现 `setLayerState` 与 `reorderLayers`。`Painter` 订阅 `Document.layers:change`，自动创建 / 删除 / 排序 backend layer，同步 visible / opacity / blend mode，并提供 `extractLayerThumbnail()` 给 UI 缩略图使用。`@saier/pixi` 注册 Pixi advanced blend modes，painter 初始化启用 WebGL back buffer。

## Steps

1. 扩展 `SurfaceBackend` 的显示状态能力：`setLayerState` / `reorderLayers`（或等价 API）。
2. `RenderTextureBackend`：同步 Sprite `visible`、`alpha`、`blendMode` 与 stage child order。
3. `PixiTileTextureBackend`：同步 layer Container `visible`、`alpha`、`blendMode` 与 stage child order。
4. `Painter` 订阅 `Document.layers:change`，自动创建/删除 backend layer 并同步顺序与显示状态。
5. 浏览器像素测试覆盖多层排序、显隐、opacity、blend 合成与 export 目标。

## Acceptance

- [x] 图层增删 / 排序 / 改透明度能即时反映到 Pixi 显示。
- [x] `extractCanvas()` 导出的合成结果与显示一致。
- [x] RenderTexture 与 tiled backend 都保持 P1/P2 行为。

## Out of scope

- transformed layer painting、lock alpha、mask、clipping（→ P6）。

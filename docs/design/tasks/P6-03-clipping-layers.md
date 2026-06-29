---
title: P6-03 · 剪贴图层（clipping layer）
---

# P6-03 · 剪贴图层：只在下层不透明区显示

- **Phase / ID**: P6 / P6-03
- **Depends on**: P6-01、P5-02（Pixi 图层显示同步）
- **Files**: `packages/pixi/src/RenderTextureBackend.ts`、`packages/pixi/src/PixiTileTextureBackend.ts`、`packages/saier/src/painter.ts`（导出合成）、`packages/core/src/controller/PainterController.ts`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成（RT 后端）

## Result

**遮罩基建(P6-03/04 共用)**:Pixi v8 不能用 RenderTexture 精灵当 `.mask`(`AlphaMaskPipe` 抛 `relativeRenderGroupDepth` null),且只暴露 `destination-out` 一种 Porter-Duff。改用**两遍 `destination-out` 合成派生纹理**(`content × maskAlpha`):① 不透明白 erase by maskAlpha → `1−maskAlpha`;② content erase by 上一步 → `content × maskAlpha`。派生纹理当普通精灵显示(`sprite.texture = derivedRT`)→ **extract / 导出安全**。`RenderTextureBackend.setLayerDisplayMask(layerId, maskLayerId)` + `refreshDerivedDisplays()`;painter `syncDisplayMasks` 把每个 clip 层遮罩到下方层,strokes/undo 后刷新。**关键坑修复**:裸 Sprite 作 render-root 时 blendMode 被忽略——必须包一层 Container 渲染。验收(真 WebGL):剪贴层只在下层不透明处显示、关剪贴恢复普通层、派生纹理可 extract。

**已知限制 / 遗留**:① 仅 **RT 后端**(tile 后端显示无单一纹理,降级为普通层);② **在下层(base)上继续绘制时,clip 派生显示的同帧刷新有时读到旧纹理**(同帧 render-to-RT 再采样的 GPU 同步边缘)——结构变更 / 在 clip 层自身绘制时刷新正常,留作后续;③ 自由变换 + 剪贴叠加未处理。

## Context

剪贴图层（clipping mask）= 一个图层的可见范围被**正下方图层的 alpha** 裁剪；像素仍各自独立存储，只影响**显示与导出合成**。它是上色（线稿上方建剪贴层平涂）的核心工作流。本卡是纯显示 / 合成层能力，不改绘画像素。

`clip` 标志已在 P6-01 落入模型；本卡让 pixi 显示与导出真正遵守它。

## Steps

1. **显示**：当某层 `clip === true`，用其下方图层的显示句柄作 Pixi mask（Sprite/Container.mask），或归组进一个以下层 alpha 为 mask 的 clipping 容器；`reorderLayers` / 增删层时重建剪贴链（连续多个 clip 层都贴同一个 base）。
2. base 层不存在（剪贴层在栈底）时降级为普通层，不报错。
3. **导出合成**：`painter.extractCanvas` / 缩略图的合成路径要复刻剪贴语义——剪贴层只在 base 不透明处贡献像素，否则导出与屏显不一致。
4. controller `setClip` 触发显示重建（经 `setLayerState` 或 `layers:change` 订阅）。
5. 单测：① base 半透明圆 + 上方红色满铺剪贴层 → 合成只在圆内见红、圆外透明；② 取消 clip 后红色满铺；③ 移动图层顺序后剪贴链正确重建；④ 屏显 extract 与导出 canvas 中心像素一致。

## Acceptance

- [x] 剪贴层只在下层不透明区域显示，下层透明处不显示。
- [x] 导出合成结果与屏幕显示一致。
- [x] 改变图层顺序 / 显隐后剪贴关系即时正确。

## Out of scope

- 蒙版（P6-04，独立 raster，与 clip 正交）、锁透明（P6-02）。

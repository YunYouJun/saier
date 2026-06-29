---
title: P6-04 · 图层蒙版（layer mask）
---

# P6-04 · 图层蒙版：独立 raster，绘画可切换内容 / 蒙版

- **Phase / ID**: P6 / P6-04
- **Depends on**: P6-01、P6-02、P5-02
- **Files**: `packages/core/src/surface/**`、`packages/core/src/document/Document.ts`、`packages/core/src/controller/PainterController.ts`、`packages/pixi/src/RenderTextureBackend.ts`、`packages/pixi/src/PixiTileTextureBackend.ts`、`packages/saier/src/brush/index.ts`、`test/`
- **Effort**: L
- **Status**: 🚧 进行中（脚手架就绪，蒙版显示受阻）

## Progress

**已落地(脚手架)**:`painter.paintTarget`('content' | 'mask')+ `resolvePaintLayerId` + `setPaintTarget`,brush / eraser 据此把笔迹重定向到蒙版表面;`RenderTextureBackend.createHiddenLayer` / `fillLayerOpaque` / `hasLayer`;painter `syncDisplayMasks` 为带蒙版图层创建隐藏蒙版表面(初始不透明=全显)、挂 `setLayerDisplayMask(layer, maskId)`,detach 时释放。蒙版描边走正常 surface stroke/patch(可 undo)。

**受阻(蒙版显示)**:复用 P6-03 的派生遮罩合成,但**同帧写入蒙版纹理后再采样会读到旧像素**——`computeMaskedDisplay` 把蒙版 committedRT 当 sprite texture 采样时,读到的是创建时的(全透明)状态,而非 `fillLayerOpaque` + erase 之后的当前状态(`extract` 读则是对的)。试过 `source.update()` / `gl.flush()` / 容器包裹均无效,疑为 Pixi v8 RenderTexture 作纹理源的采样缓存问题。**P6-03 剪贴的主路径不受影响**(其遮罩源来自上一帧已提交的下层);仅「同帧写蒙版→同帧重算显示」这条受阻。

**下一步选项**:① 深挖 Pixi RT 采样同步(把蒙版重算延后到下一帧 / 改用 CPU 读回合成);② 蒙版改 CPU 合成(读 content + mask 像素,CPU 相乘写派生)绕开 GPU 采样;③ 暂缓蒙版,先收尾 P6-06/07。

## Context

图层蒙版 = 每个图层可附带一张**灰度 / alpha 蒙版 raster**，显示时 `content.alpha *= mask`，非破坏地隐藏 / 露出内容。绘画要能在「内容」与「蒙版」之间切换目标。蒙版本质是又一块 surface，可复用 P6-02 的合成与 bbox undo。

P6-01 已在模型放了 `mask?: LayerMaskRef`；本卡落地蒙版像素、绘画目标切换、显示与导出。

## Steps

1. **存储**：蒙版作为 `SurfaceBackend` 里与图层并列的一块 surface（约定 id 如 `${layerId}:mask`）。`attachMask` 时创建、`detachMask` 时释放。
2. **绘画目标**：在 controller / brush 引入「当前绘画目标 = content | mask」。当目标为 mask 时，brush 的 dab 落到蒙版 surface（单通道 alpha 语义：黑=遮蔽、白=显示）。`beginStroke/endStroke/applyPatch` 复用现有管线，undo 对蒙版同样有效。
3. **显示**：pixi 用蒙版 surface 作内容显示句柄的 mask（或在合成时 alpha 相乘）；`setMaskEnabled(false)` 时显示忽略蒙版但保留像素。
4. **导出**：合成路径把启用的蒙版并入（content × mask）。
5. **缩略图**：蒙版可出独立缩略图（供 UI，P6-06 用）。
6. 单测：① 给图层加蒙版、在蒙版画黑 → 对应区域内容隐藏，content 像素本身不变；② 关闭蒙版 → 内容全显；③ 蒙版描边 undo / redo 像素一致；④ 导出合成 = content × mask；⑤ detach 后内容恢复且无悬挂 surface。

## Acceptance

- [ ] 在蒙版上画黑可隐藏内容、画白可露出，且不破坏 content 像素。
- [ ] 蒙版描边可独立 undo / redo。
- [ ] 启用 / 停用蒙版即时反映，导出与屏显一致。
- [ ] 绘画目标在 content / mask 间切换正确（dab 落到对的 surface）。

## Out of scope

- 蒙版的 UI 控件与缩略图展示（P6-06）；矢量 / 通道蒙版；混色（P7）。

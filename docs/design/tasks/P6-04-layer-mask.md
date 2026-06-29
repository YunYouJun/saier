---
title: P6-04 · 图层蒙版（layer mask）
---

# P6-04 · 图层蒙版：独立 raster，绘画可切换内容 / 蒙版

- **Phase / ID**: P6 / P6-04
- **Depends on**: P6-01、P6-02、P5-02
- **Files**: `packages/core/src/surface/**`、`packages/core/src/document/Document.ts`、`packages/core/src/controller/PainterController.ts`、`packages/pixi/src/RenderTextureBackend.ts`、`packages/pixi/src/PixiTileTextureBackend.ts`、`packages/saier/src/brush/index.ts`、`test/`
- **Effort**: L
- **Status**: ✅ 完成（蒙版显示正常；原「受阻」为复现脚本误判）

## Progress

**已落地（luminance 蒙版）**:`painter.paintTarget`('content' | 'mask')+ `resolvePaintLayerId` + `setPaintTarget`,brush / eraser 据此把笔迹重定向到蒙版表面;`RenderTextureBackend.createHiddenLayer` / `fillLayerOpaque`(白色不透明=全显)/ `hasLayer`;painter `syncDisplayMasks` 为带蒙版图层创建隐藏蒙版表面、挂 `setLayerDisplayMask(layer, maskId, mode)`,detach 时释放。蒙版描边走正常 surface stroke/patch(可 undo)。

**显示 = 灰度亮度合成**(见下「显示语义」与 [D9](../decisions#d9)):`computeMaskedDisplay` 按 `DisplayMaskMode` 分流——**图层蒙版走 `'luminance'`**(单 pass 全屏 quad `Mesh` + 自定义 `Shader`/仅 `glProgram`,`out = content × dot(mask.rgb, BT.601)`),**剪贴层走 `'alpha'`**(沿用 P6-03 双 pass erase,`content × maskAlpha`)。派生纹理 `extract` / 导出安全;两条路径用各自独立资源,互不串味。

**「蒙版显示受阻」曾是复现误判,非 GPU bug**:`computeMaskedDisplay` 的 GPU 合成本无问题,原复现把 derived「全透明」错判为同帧采样读旧像素,真因是**笔迹根本没画到目标区域**——① 稀疏笔迹受 stabilizer 滞后只覆盖左半,erase 蒙版左半后 derived 自然全透明;② 驱动 eraser 时未 `useTool('eraser')`(此前 `useTool('brush')` 已把 `PainterEraser.enabled` 置 false,pointer 直接 early-return,蒙版根本没被擦)。修正复现(密集 serpentine 满覆盖 + 正确激活工具 + y 方向断言兜朝向)后全部跑通。

**测试**:`packages/saier/test/layer-mask.browser.spec.ts`(浏览器项目,真实 WebGL,9 例)——擦/画黑=隐藏、画白=露出、画灰=半透、上下朝向、目标路由、undo/redo、导出==屏显、detach 释放、clip↔mask 模式切换不串味;`clipping-layers.browser.spec.ts` 仍绿。

## Context

图层蒙版 = 每个图层可附带一张**灰度蒙版 raster**，显示时 `content.alpha *= luminance(mask)`（白显、黑遮、灰半透，对齐 PS / Procreate / SAI），非破坏地隐藏 / 露出内容。绘画要能在「内容」与「蒙版」之间切换目标。蒙版本质是又一块 surface，可复用 P6-02 的合成与 bbox undo。

P6-01 已在模型放了 `mask?: LayerMaskRef`；本卡落地蒙版像素、绘画目标切换、显示与导出。

## 显示语义

**图层蒙版 = 灰度亮度（grayscale luminance），不是直接 alpha。** 对齐 Photoshop / Procreate / SAI2 / Krita / Clip Studio 的行业共识：蒙版是一张独立的灰度 raster，**白=全显、黑=全遮、灰=按亮度部分显示**，非破坏地控制本图层的可见度（content 像素本身不变）。这与「剪贴 / clipping」严格区分——**剪贴是按下方图层的 alpha / 形状裁切**（笔迹只落在下层不透明区域），而蒙版是按本图层所附蒙版的**灰度亮度**调制显示。

**reveal 公式（premultiplied 语境）。** Pixi 纹理为预乘 alpha，蒙版像素存为 `m = (R·a, G·a, B·a, a)`。露出系数取预乘 rgb 的 BT.601 亮度：

```
reveal = dot(m.rgb, vec3(0.299, 0.587, 0.114))   // 权重和 = 1.0
       = a · straightLuminance(R, G, B)
```

即直接对预乘 rgb 求亮度，已天然把蒙版自身 alpha 折进去（蒙版半透明区按比例少露），无需额外乘除 alpha。显示时把内容预乘像素整体乘以标量 reveal：`out = content × reveal`，等价于「内容直 alpha × reveal、直 rgb 不变」，是合法预乘结果，**纯做 alpha 衰减、永不改动图层本色**。

**白色不透明底 = 全显（reveal-all）。** 新建蒙版填充白色不透明（`fillLayerOpaque`），`reveal = 1`，内容完整显示；这是蒙版的初始「全露出」状态。

**画黑与擦除都隐藏。** 在蒙版上**画黑（brush 黑色）**令该处 `reveal → 0` 隐藏内容；在蒙版上**擦除（eraser，令蒙版 alpha → 0）**因预乘下 `a=0 ⇒ rgb=0 ⇒ reveal=0`，同样隐藏内容。两条路径语义一致：蒙版上「变黑 / 变空」皆为遮蔽，「变白 / 不透明白」为露出。`setMaskEnabled(false)` 时显示忽略蒙版但保留其像素。

**实现**：单 pass 全屏 quad（`Mesh` + 自定义 `Shader`，仅 `glProgram`，生产 WebGL renderer 够用）在 `RenderTextureBackend.computeMaskedDisplay` 的 `'luminance'` 分支采样 content + mask 两张 committedRT，输出 `content × reveal` 写入派生 RT；剪贴层走 `'alpha'` 分支（双 pass erase）。两分支由 `painter.syncDisplayMasks` 按 `mask.enabled` / `clip` 注入 `DisplayMaskMode`。

## Steps

1. **存储**：蒙版作为 `SurfaceBackend` 里与图层并列的一块 surface（约定 id 如 `${layerId}:mask`）。`attachMask` 时创建、`detachMask` 时释放。
2. **绘画目标**：在 controller / brush 引入「当前绘画目标 = content | mask」。当目标为 mask 时，brush / eraser 的 dab 落到蒙版 surface（灰度亮度语义：白=显示、黑=遮蔽、灰=按亮度半透；reveal = 蒙版亮度）。`beginStroke/endStroke/applyPatch` 复用现有管线，undo 对蒙版同样有效。
3. **显示**：pixi 在合成时按蒙版亮度调制内容显示句柄（`content.alpha × luminance(mask)`）；`setMaskEnabled(false)` 时显示忽略蒙版但保留像素。
4. **导出**：合成路径把启用的蒙版并入（`content × luminance(mask)`），派生纹理 `extract` 安全、与屏显一致。
5. **缩略图**：蒙版可出独立缩略图（供 UI，P6-06 用）。
6. 单测：① 加蒙版、在蒙版画黑 / 擦除 → 内容隐藏，画白 → 露出，画灰 → 半透，content 像素本身不变；② 关闭蒙版 → 内容全显；③ 蒙版描边 undo / redo 一致；④ 导出合成 = content × luminance(mask)、与屏显一致；⑤ detach 后内容恢复且无悬挂 surface；⑥ clip↔mask 模式切换不串味。

## Acceptance

- [x] 在蒙版上画黑 / 擦除可隐藏内容、画白可露出、画灰半透，且不破坏 content 像素。
- [x] 蒙版描边可独立 undo / redo。
- [x] 启用 / 停用蒙版即时反映，导出与屏显一致。
- [x] 绘画目标在 content / mask 间切换正确（dab 落到对的 surface）。

## Out of scope

- 蒙版的 UI 控件与缩略图展示（P6-06）；矢量 / 通道蒙版；混色（P7）。

---
title: P6-02 · 锁透明合成（lock alpha）
---

# P6-02 · 锁透明：绘画只改已有像素、不扩边

- **Phase / ID**: P6 / P6-02
- **Depends on**: P6-01、P1-05（RenderTextureBackend）、P2-02（CPU dab 光栅器）
- **Files**: `packages/core/src/surface/rasterizer.ts`、`packages/core/src/surface/TiledSurface.ts`、`packages/pixi/src/RenderTextureBackend.ts`、`packages/pixi/src/PixiTileTextureBackend.ts`、`packages/core/src/types/surface.ts`、`test/`
- **Effort**: L
- **Status**: ✅ 已完成

## Result

`SurfaceLayerState.lockAlpha` 进入契约,经 painter `setLayerState` 同步给后端(热路径不查模型)。core `compositeLockAlphaRegion`(预乘 RGBA、保 dst alpha、只重着色已有像素)+ rasterizer `compositeLockAlpha`(逐像素,tile 路径,带 `lockAlpha` 选项,穿过 `TilePatchRecorder`)。RT 后端:锁层强制走 CPU surface 累积笔迹,`endStroke` 用 `compositeLockAlphaRegion(before, strokeRegion)` 合成回图层(`source-atop` 不是 v8 blend mode,故用 CPU)。tile 后端:`rasterizeDab(..., { lockAlpha })` 直绘。验收(两后端 parity,真 WebGL):锁透明下横向不透明红带被竖向蓝笔重着色、alpha 不变、透明区不扩边;undo 还原;core 纯函数单测(满/半/零覆盖、确定性)。门禁:typecheck 0 · lint clean · vitest 846。

**已知限制 / 遗留**:① 锁层的**实时预览**仍显示未裁剪笔迹(提交时才裁剪到 alpha)——预览遮罩留后续;② marker(`max-alpha`)+ 锁透明在 **tile 后端**走 max-alpha 分支、未应用锁(RT 后端因走 CPU 提交则正确)——边缘组合,待统一。

## Context

锁透明（SAI / PS 的「锁定透明像素」）= 笔迹只能改写图层**已有不透明区域**的颜色，不能向透明处扩张、也不改变 alpha。它是混色 / 上色工作流的高频开关，且实现要点（用 stroke 前的 alpha 作 mask）对 P6-04 蒙版复用。

两条管线都要支持（[D1](../decisions#d1)）：RenderTexture（P1）与 tile（P2）。

## Steps

1. 在 `SurfaceBackend.paintDab` 的 `mode` 之外，让后端能读到目标图层的 `lockAlpha`：经 `setLayerState`（扩 `SurfaceLayerState.lockAlpha?`）在图层属性变化时同步给后端，绘画热路径不再查询模型。
2. **CPU 光栅器**（tile / `rasterizer.ts`）：新增 `compositeLockAlpha`——`outAlpha = dstAlpha`（保持），`outRGB = lerp(dstRGB, srcRGB, srcAlpha)`，`srcAlpha` 仍按笔尖；`dstAlpha == 0` 处直接跳过。
3. **RenderTextureBackend**：stroke begin 时快照该层 alpha 作 mask（或用 `destination-in` 把 stroke 结果与原 alpha 求交）；commit 时保证新像素 alpha 不超过原 alpha、透明处不出现颜色。复用现有 `beginStroke/endStroke` 的 bbox 快照，**不可**整画布快照（[D4](../decisions#d4)）。
4. undo / redo 不变：`endStroke` 的 before/after patch 仍覆盖受影响 bbox，回贴后像素一致。
5. 单测（含 golden / 像素断言）：① 在一块已有不透明色块上锁透明画异色 → 块内 RGB 变、alpha 不变、块外仍透明；② 关锁则恢复正常扩张；③ undo 后还原；④ 两后端 parity。

## Acceptance

- [x] 锁透明下：透明区 `alpha` 恒为 0（无扩边），不透明区 `alpha` 不被改变、仅 RGB 变化。
- [x] RenderTexture 与 tile 两后端结果 parity。
- [x] undo / redo 像素一致。
- [x] 锁透明开关即时生效（无需重建图层 / 重画）。

## Out of scope

- 剪贴（P6-03）、蒙版（P6-04）、混色 / smudge（P7）。

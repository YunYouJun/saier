---
title: P6-05 · 带 transform 图层的绘画（逆变换落点）
---

# P6-05 · 在被缩放 / 旋转 / 平移的图层上准确落点

- **Phase / ID**: P6 / P6-05
- **Depends on**: P6-01、P1-02（几何）、P3-01（PointerSampler）
- **Files**: `packages/core/src/math/**`、`packages/saier/src/brush/index.ts`、`packages/saier/src/eraser/index.ts`、`packages/pixi/src/RenderTextureBackend.ts`、`packages/pixi/src/PixiTileTextureBackend.ts`、`test/`
- **Effort**: L
- **Status**: ✅ 已完成（TDD：先红后绿）

## Result

落点:brush / eraser 的 `paintDabs` 在产 dab 后,对非 identity 图层经共享 `utils/transform.ts` 的 `toLayerLocalDab` 把 dab 位置 `documentToLayer` 到图层局部、半径按平均缩放近似(圆 dab,已知限制写明)。显示:painter `applyLayerDisplayTransform` 把 `LayerTransform` 前向矩阵套到图层显示句柄(pivot=anchor / scale / rotation / position=translate−center),preview 精灵经 `syncStrokePreviewTransform` 自动对齐。验收(真 Chromium + WebGL,4 测):缩放+旋转+平移图层落点质心 == `documentToLayer(文档点)` ≤1.5px;identity 零回归;确定性回放像素一致;显示句柄变换属性正确。

**已知限制 / 遗留**:① 各向异性缩放/旋转下圆 dab 按平均缩放近似(非椭圆);② 带 transform 图层的 **undo 快照** 仍走 `layer.sprite`(经显示变换、会 warp)——当前无 UI 变换栅格层故不可达,待 P6-06+ 整合时修。

## Context

[interfaces.md · 坐标与变换正确性](../interfaces#坐标与变换正确性) 第 3 点明确把「带 transform 图层的绘画」推迟到 P6。这是公认的硬骨头：pointer 已在 P1 收口为 **document space**，但当目标图层自身带 transform（导入图片、自由变换过的层），落点还要再经**图层逆变换 → 图层局部像素坐标**，否则缩放 / 旋转后笔迹错位。

P6-01 已提供 `documentToLayer` / `layerToDocument` 与 `LayerTransform`，本卡把它接进绘画热路径与显示。

## Steps

1. **落点**：brush / eraser 现在产 dab 前是 document space（`toDocumentPoint`）。在目标图层 `transform` 非 identity 时，对 dab 中心与半径走 `documentToLayer`：位置逆变换到图层局部像素；各向异性缩放下 radius 的处理与 dab 椭圆化策略需明确（首版可按平均缩放近似 + 记录已知限制）。
2. **surface**：仍在图层局部像素空间光栅化（surface 尺寸 = 图层内容分辨率），与 transform 解耦。
3. **显示**：pixi 图层显示句柄套用 `LayerTransform` 的前向矩阵（position/scale/rotation/anchor），使「画到局部像素」经显示变换回到 document / screen 正确位置。
4. **brush cursor overlay**：光标圈在 screen space，需随图层 transform 视觉一致（至少不明显错位）。
5. 单测（关键回归）：① 给图层设 `scale=1.75 + rotation + 平移`，在已知 document 点落一笔 → 读图层局部像素，笔迹中心落在 `documentToLayer(点)` 预期位置（容差 ≤ 1px）；② identity 图层行为与 P1 完全一致（无回归）；③ 确定性回放：同输入同 transform 像素稳定。

## Acceptance

- [x] 在被缩放 / 旋转 / 平移的图层上落点准确（局部像素中心 = 逆变换预期，容差 ≤ 1px）。
- [x] identity（纯绘画）图层与 P1 行为零回归。
- [x] 同一组输入 + transform 回放像素一致（确定性）。
- [x] 已知限制（如各向异性缩放下圆 dab 的近似）在卡内 / 测试注释中写明，不静默。

## Out of scope

- 自由变换的交互手柄 UI（沿用现有 `EditableLayer` overlay，必要时单列）；混色 / smudge（P7）。

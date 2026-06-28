---
title: P1-06 · 真橡皮（erase 合成）
---

# P1-06 · `pixi`：真橡皮（`CompositeMode = 'erase'`）

- **Phase / ID**: P1 / P1-06
- **Depends on**: P1-05
- **Files**: `packages/pixi/src/RenderTextureBackend.ts`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

当前 eraser 是**画白色**（`eraser/index.ts` 注释里 `BLEND_MODES.ERASE` 没启用），透明 / 有色背景下是错的。真橡皮 = 往图层像素**写透明**（destination-out）。在 P1-05 的 scratch 合成里加一条 erase 路径即可。

## Steps

1. `paintDab(layerId, dab, 'erase')`：仍把 dab 画进 `strokeRT`（积累橡皮覆盖范围，作为 alpha 蒙版）。
2. `endStroke` 合成阶段按本笔的 `CompositeMode` 选 blend：
   - `normal` → `strokeSprite.blendMode = 'normal'`（P1-05 行为）。
   - `erase` → `strokeSprite.blendMode = 'erase'`，再 `renderer.render({ container: strokeSprite, target: committedRT, clear: false })`——把覆盖范围从 committed 的 alpha 中减掉。
3. 确认图层 `committedRT` 与 Sprite 链路保留 alpha（非 premultiply 丢失）；erase 需要 RT 有 alpha 通道。
4. （可选）实时预览：erase 预览较难，P1 可在 `pointermove` 期间近似（例如临时把 strokeSprite 以 erase 叠加在 committed sprite 上预览），保真不足可接受，**最终像素正确即可**。
5. before/after 快照逻辑与 P1-05 完全复用——erase 的撤销天然正确（before 含被擦像素）。

## Acceptance

- [x] **透明背景**上用橡皮划过 → `extract pixels` 该区域 `alpha == 0`（golden / 断言）。
- [x] 有色背景图层上擦 → 露出下层 / 透明，而非盖白。
- [x] 擦后 undo 能**还原被擦像素**；redo 再擦掉。
- [x] 擦 5000 dab，`stage` 节点数不增长。

## Out of scope

- 锁透明 / 仅擦当前层 alpha 的高级行为（→ P6）。
- 笔刷软边 / 流量（→ P4）。

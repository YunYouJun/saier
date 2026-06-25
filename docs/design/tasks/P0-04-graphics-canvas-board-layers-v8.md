---
title: P0-04 · Graphics / Sprite / name→label（canvas + board + layers）
---

# P0-04 · canvas + board + layers 迁移（Graphics / Sprite / `name`→`label`）

- **Phase / ID**: P0 / P0-04
- **Depends on**: P0-02
- **Files**: `src/canvas/index.ts`、`src/board/index.ts`、`src/layers/index.ts`、`src/layers/{scale,rotate,drag}.ts`、`src/painter.ts`（`name=` 处）
- **Effort**: M
- **Status**: 🟡 **deprecation 清理（非阻断）** —— 这些是长寿命 overlay（选框 / 手柄 / mask / 背景），会活到 raster 架构之后（见 [D7](../decisions#d7)），值得消除 deprecation 警告；但 v7 写法在 v8 仍能跑，**不阻断**，可排在 P0-02 / P0-06 之后再做。

## Context

把视图层与图层手柄的 v7 `Graphics` / `name` 用法迁到 v8（`name`→`label`、`beginFill / drawX`→`rect / circle / fill / stroke`）。这些对象在 P1 之后仍在用，所以清理不会白做。可与 [P0-03](./P0-03-graphics-brush-eraser-v8) 并行（不同文件）。

## Steps

1. **`name` → `label`**：全量替换 `.name = '...'` → `.label = '...'`（`painter.ts` stage/boundingBoxes、`canvas`、`board`、`layers` 的所有 `name` 赋值）。注意 `event.target.name` 这类读取也一并改 `label`。
2. `canvas/index.ts`：
   - `canvasShape`：`beginFill(0xFFFFFF).drawRect(...).endFill()` → `rect(...).fill(0xFFFFFF)`。
   - `clone()` 在 v8 `Graphics` 仍可用；若行为异常，改为重画一个相同 `rect().fill()`。
   - `mask` 用法不变。
3. `layers/index.ts`：
   - `boundingBox` 的 `lineStyle(1,0x3D5CAA).drawRect(...)` → `rect(...).stroke({ width: 1, color: 0x3D5CAA })`；控制点的 `beginFill(0xFFFFFF,0.5).drawRect(...).endFill()` → `rect(...).fill({ color: 0xFFFFFF, alpha: 0.5 })`；rotate 连线 `moveTo/lineTo` 后 `.stroke(...)`。
   - 控制点 `Sprite(Texture.WHITE)`：`Texture.WHITE` v8 仍在，保留。
   - `Texture.from(deleteBinSvg)`：v8 对 SVG 字符串 / data-uri 的 `Texture.from` 行为可能不同，**优先改 `await Assets.load(deleteBinSvg)`**；若 `deleteBinSvg` 是内联 SVG 字符串，转成 data-uri 或走 `Assets`。验证删除图标能正常显示。
4. `layers/{scale,rotate,drag}.ts`、`board/drag.ts`：核对其中是否有 `lineStyle/drawX` / `name`，一并迁移。

## Acceptance

- [ ] `pnpm -F pixi-painter typecheck` 通过；全仓 `rg "\.name\s*=" packages/pixi-painter/src` 不再有 Pixi 对象赋值残留。
- [ ] `examples/vue`：导入图片后出现选择框 + 8 个缩放点 + 旋转手柄 + 删除图标（图标可见）；缩放 / 旋转 / 拖拽 / 删除均工作。
- [ ] 画布背景与 mask 裁剪正常。

## Out of scope

- 把 `EditableLayer` 改造成真正的栅格绘画图层（→ P1/P5）。

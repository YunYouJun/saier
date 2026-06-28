---
title: P1-08 · 集成进 pixi-painter（切换绘画管线）
---

# P1-08 · 集成：把 `pixi-painter` 的 brush/eraser 切到新管线

- **Phase / ID**: P1 / P1-08
- **Depends on**: P1-03、P1-04、P1-05、P1-06、P1-07；运行依赖 P0-02
- **Files**: `packages/pixi-painter/src/{painter,brush/index,eraser/index,canvas/index,features/history}.ts`
- **Effort**: L
- **Status**: ✅ 已完成

## Context

把现有「每笔一个 `Graphics`」替换成 `core` + `RenderTextureBackend` 管线，**对外 API 尽量不变**（`useTool` / `painter.brush.setSize` / `history.undo`）。`pixi-painter` 依赖 `@saier/core` + `@saier/pixi`。

## Steps

1. **装配**（在 `painter.init()`，P0-02 之后）：
   - `const backend = new RenderTextureBackend({ renderer: app.renderer, stage: canvas.layersContainer })`。
   - `const doc = new Document()`；建一个默认 `RasterLayer` 并 `backend.createLayer(layer.id)`、`doc.setActive(layer.id)`。
   - `const undo = new UndoManager(); undo.attach(backend)`。
   - `const engine = new SimpleBrushEngine()`；`const controller = new PainterController(...)`。
2. **brush 管线**（重写 `brush/index.ts` 的 pointer 流程，保留类名 / 公共方法）：
   - `pointerdown`：`engine.beginStroke({ color, baseSize })`；`backend.beginStroke(activeLayerId)`。
   - `pointermove`：`const docPt = toDocument(event)`（用现有 `getLocalPosition(canvas.layersContainer)`，P1 仅支持未变换图层，见 [interfaces · 坐标](../interfaces#坐标与变换正确性)）；`engine.addPoint(docPt).forEach(d => backend.paintDab(activeLayerId, d, 'normal'))`。
   - `pointerup/out`：`engine.endStroke().forEach(...paintDab)`；`const patch = backend.endStroke(activeLayerId); undo.record(patch)`。
   - **删掉**旧的 `new Graphics()` 累积绘制与 `graphicsPool`。
3. **eraser**：同 brush，但 `paintDab(..., 'erase')`；删掉画白逻辑。
4. **history 对接**：`PainterHistory.undo/redo` 委托给 `UndoManager`（或直接用 UndoManager 并保留 `painter.history.undo()` 包装），保持现有键盘快捷键可用。
5. **保留**：brush 光标圈、`EditableLayer` 图片导入 / 变换、selection、缩放平移（都是 Pixi overlay / 视图层，按 [D7](../decisions#d7) 不动）。
6. `painter.brush.setSize/setColor` 等转调 `controller`（不再写 `PainterBrush` 静态——若一步到位有风险，可暂留静态读、但新绘制走 engine 的值，UI 静态清理留 P5）。

## Acceptance

- [x] `examples/vue`：brush 连续画线、改尺寸/颜色生效；eraser **真擦透明**；undo/redo 正常。
- [x] 一次 stroke **不再新增** `Graphics` 子节点；连续多笔 `stage` 子节点数稳定。
- [x] 图片导入 + 变换 + selection + 缩放平移仍工作（未回归）。
- [x] `pnpm typecheck` / `lint` 绿。

## Out of scope

- 在被缩放 / 旋转的图层上绘画（→ P6）。
- 多笔刷类型 / stabilizer（→ P3/P4）；UI 去静态字段（→ P5）。

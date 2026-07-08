---
title: P1-04 · Document / RasterLayer / UndoManager
---

# P1-04 · `core`：`Document` / `RasterLayer` / `UndoManager`

- **Phase / ID**: P1 / P1-04
- **Depends on**: P1-02
- **Files**: `packages/core/src/document/**`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

绘画文档的框架无关模型。**像素不在这里**——像素在 backend（[D5](../decisions#d5)）；这里持有图层的逻辑信息（id / 顺序 / opacity / 可见）与撤销栈。`UndoManager` 存 [`StrokePatch`](../interfaces#表面后端-surface-backend) 并通过 `backend.applyPatch` 回放（[D4](../decisions#d4)：禁止全画布快照）。

## Steps

1. `RasterLayer`：`{ id, label, visible, opacity, blendMode }`（纯数据；像素句柄在 backend）。
2. `Document`：
   - `layers: RasterLayer[]` + `activeLayerId`；`addLayer / removeLayer / moveLayer / setActive`。
   - 每次结构变化 emit `layers:change`（供 UI / adapter 订阅）。
3. `UndoManager`（替代现有 `features/history.ts` 的能力，但语义升级）：
   - `record(patch: StrokePatch)`：压栈、清空 redo、容量上限（沿用 ~25）。
   - `undo() / redo()`：调 `backend.applyPatch(patch, 'undo'|'redo')`，并维护双栈。
   - emit `history:change`。
   - 注入 `backend`（构造或 `attach(backend)`），保持 core 不直接依赖 Pixi。
4. 单测用一个 **fake backend**（内存里的二维数组）验证 patch 往返。

## Acceptance

- [x] `test/undo.spec.ts`：用 fake backend，record→undo→redo 后「画布」状态与各时刻一致。
- [x] `Document` 增删 / 排序 / 改 opacity 触发 `layers:change`。
- [x] 容量上限生效；redo 在新 record 后被清空。
- [x] 仍无 pixi.js。

## Out of scope

- tile patch（P2，`applyPatch` 先按整 bbox 位图实现）。
- 蒙版 / 剪贴 / 锁透明（→ P6）。

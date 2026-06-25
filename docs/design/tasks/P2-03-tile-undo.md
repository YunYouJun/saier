---
title: P2-03 · tile 撤销（TilePatch）
---

# P2-03 · `core`：tile 撤销（`TilePatch[]`）

- **Phase / ID**: P2 / P2-03
- **Depends on**: P2-01、P1-04（UndoManager）
- **Files**: `packages/core/src/document/UndoManager.ts`、`src/surface/**`、`test/`
- **Effort**: M
- **Status**: 🟡 条件性

## Context

把 P1 的「bbox 区域位图快照」升级成 **tile 级 before/after**（[D4](../decisions#d4)）。撤销只触达**脏 tile**，内存与速度都更优。`StrokePatch.before/after` 改用 `TilePatch[]`（[interfaces](../interfaces#表面后端-surface-backend)）。

## Steps

1. `beginStroke`：记录本笔将写的 tile 集；对每个**首次将被弄脏**的 tile，拷贝其 `data` 作为 `before`（只拷脏 tile，不拷全图）。
2. `endStroke`：对每个脏 tile 拷 `after`，组装 `TilePatch[]` → `StrokePatch`。
3. `applyPatch(patch,'undo'|'redo')`：把对应 tile 的 `before`/`after` 写回 `TiledSurface` 并 `markDirty`，触发 adapter 重传这些 tile。
4. `UndoManager` 对 `StrokePatch.before/after` 既能吃 `ImageBitmap|Uint8Array`（P1）也能吃 `TilePatch[]`（P2）——保持接口不变（[D5](../decisions#d5)）。

## Acceptance

- [ ] `test/tile-undo.spec.ts`：画跨多 tile 一笔 → undo 后逐 tile == 画前；redo == 画后。
- [ ] 撤销只复制 / 恢复**脏 tile**（数量断言：未触碰的 tile 不进 patch）。
- [ ] 与 P1 的 UndoManager 行为兼容（容量、双栈、事件）。

## Out of scope

- 非绘制操作（fill / filter / transform）的撤销（后续阶段）。

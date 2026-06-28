---
title: P2-06 · 切换后端 + 大画布/内存验收
---

# P2-06 · 切换 tile 后端 + parity / 大画布 / 内存验收

- **Phase / ID**: P2 / P2-06
- **Depends on**: P2-03、P2-04、P2-05、P1-08（集成点）
- **Files**: `packages/pixi-painter/src/painter.ts`（后端选择）、`test/`、`examples/*`
- **Effort**: M
- **Status**: ✅ 已完成（P2 出口）

## Context

把 `pixi-painter` 的 backend 从 `RenderTextureBackend`（P1）切到 `PixiTileTextureBackend`（P2），或做成**可选**（option 选后端）。因为两者同实现 [`SurfaceBackend`](../interfaces#表面后端-surface-backend)，切换不应触动 `BrushEngine` / `Document` / UI（[D5](../decisions#d5) 的回报兑现）。

## Steps

1. `painter.init()` 按 option（如 `backend: 'rendertexture' | 'tiled'`，默认先留 rendertexture）装配后端；其余装配代码不变。
2. **parity**：用 tile 后端重跑 P1-09 的三断言（节点数、真橡皮、undo 像素一致），确认行为等价。
3. 大画布 / 内存 / 性能基准（P2 专属验收）。

## Acceptance

- [x] tile 后端下 P1-09 三断言仍全绿（行为 parity）。
- [x] **4096×4096** 画布连续涂抹：内存平稳（不随笔数单调上升），稀疏 tile 生效。
- [x] 撤销只恢复脏 tile（数量断言，承 P2-03）。
- [x] 一帧内多 dab 合并为一次上传（承 P2-05）。
- [x] `pnpm build` / `typecheck` / `lint` / `test` 全绿；demo 冒烟通过。

## Out of scope

- 混色 / smudge / 水彩（→ P7，建立在 tile + CPU 光栅器之上）。

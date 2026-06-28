---
title: P1-05 · RenderTextureBackend（normal 绘制 + 撤销快照）
---

# P1-05 · `pixi`：`RenderTextureBackend`（normal 绘制 + 显示 + 撤销）

- **Phase / ID**: P1 / P1-05
- **Depends on**: P1-02（契约）、P1-01
- **Files**: `packages/pixi/src/{RenderTextureBackend,dab-cache}.ts`、`test/`
- **Effort**: L
- **Status**: ✅ normal + undo spike 已完成

## Context

实现 [`SurfaceBackend`](../interfaces#表面后端-surface-backend)：每图层一张 `RenderTexture`，戳印**渲染进 RT**（不进 scene graph，所以画多少笔节点数都不涨）。撤销用**受影响 bbox 的区域快照**（[D4](../decisions#d4)，禁止全画布快照）。本卡只做 **normal 绘制 + undo**；erase 在 [P1-06](./P1-06-real-eraser)。

> 关键取舍——**scratch RT 方案**：当前笔迹画进一张共享 `strokeRT`（透明），`endStroke` 时才按 bbox 合成进图层 `committedRT`。这样：① 撤销 before/after 只需读 bbox 区域；② 天然支持后续「整笔不透明度 / erase 合成」。直接画进 committed 会导致「before 必须在落第一笔前快照、但 bbox 未知」——故否决。

## Steps

1. **构造**：`new RenderTextureBackend({ renderer, stage })`，`stage` 是要挂图层 Sprite 的容器（P1-08 传入现有 `canvas.layersContainer`，使其随 board 变换）。
2. `createLayer(id)`：`committedRT = RenderTexture.create({ width, height })`；`sprite = new Sprite(committedRT)`，加入 `stage`；登记 `id → { committedRT, sprite }`。
3. **dab 缓存**：预渲染一张软/硬圆 dab 纹理（一次），`paintDab` 复用并按 `radius` 缩放、按 `color`/`opacity` tint——避免每 dab `new Graphics`（5000 dab 性能）。
4. `beginStroke(layerId)`：清空共享 `strokeRT`，`dirty = DirtyRect.empty()`，挂 `strokeSprite` 到该层做实时预览。
5. `paintDab(layerId, dab, 'normal')`：把 dab 节点定位到 `dab.x/y`、缩放到 `radius`、tint=color、alpha=opacity，`renderer.render({ container: dabNode, target: strokeRT, clear: false })`；`dirty = union(dirty, fromCircle(dab))`；返回该 dab 的 `DirtyRect`。
6. `endStroke(layerId)`：
   - `before = extract.pixels({ target: committedSprite, frame: dirty })`（v8 返回 `{ pixels, width, height }`）。
   - 把 `strokeRT` 的 `dirty` 区域合成进 `committedRT`（`renderer.render({ container: strokeSprite, target: committedRT, clear: false })`）。
   - `after = extract.pixels({ ..., frame: dirty })`；清 `strokeRT` / 收起预览。
   - 返回 `StrokePatch{ layerId, rect: dirty, before, after }`。
7. `applyPatch(patch, dir)`：取 `dir==='undo'?before:after`，写回 `committedRT` 的 `rect` 区域。**子区域替换**要点：先用 erase 把该 rect 清零，再把快照像素作为 Texture（`normal`）画回；注意 Pixi **premultiplied alpha**（用 P1-02 的 premultiply 辅助核对）。
8. `getDisplayHandle(id)` 返回该层 `sprite`（core 不依赖其类型）。

## Acceptance

- [x] `createLayer` 后画布出现该层 sprite，可被 board 缩放 / 平移带动。
- [x] **连续 5000 dab，`stage` 子节点数不增长**（dab 进 RT，非场景图）——计数断言。
- [x] golden：画一笔 → `endStroke` 后 committed 像素与基准一致。
- [x] undo→redo 后该层像素与各时刻一致（区域回写正确，含 alpha）。

## Out of scope

- erase（→ P1-06）。
- tile（→ P2）；带 transform 图层（→ P6）。

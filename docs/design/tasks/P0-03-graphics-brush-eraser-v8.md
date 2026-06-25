---
title: P0-03 · Graphics 迁移（brush + eraser）
---

# P0-03 · Graphics API 迁移：brush + eraser

- **Phase / ID**: P0 / P0-03
- **Depends on**: P0-02
- **Files**: `packages/pixi-painter/src/brush/index.ts`、`src/eraser/index.ts`
- **Effort**: M
- **Status**: ⚪ **可选 / 建议跳过** —— brush/eraser 的 v7 `Graphics` 在 v8 是 deprecated 垫片（**能跑**，仅警告）；P1 会用 raster 引擎替换这两个文件。除非你想立刻消除 deprecation 警告，否则**跳过本卡，留给 P1 删除**。下方迁移配方仅作参考。

## Context

v8 把 v7 的 `beginFill / endFill / lineStyle / drawX` 标为 **deprecated（保留垫片，仍可用）**，新写法是「**先描述路径，再 `fill()` / `stroke()`**」。若选择执行本卡，只**等价迁移 API、不改行为**（真橡皮、戳印渲染是 P1）。

v7 → v8 速查：

| v7                                           | v8                                                         |
| -------------------------------------------- | ---------------------------------------------------------- |
| `g.beginFill(c).drawCircle(x,y,r).endFill()` | `g.circle(x,y,r).fill(c)`                                  |
| `g.lineStyle(w,c).moveTo(a,b).lineTo(x,y)`   | `g.moveTo(a,b).lineTo(x,y).stroke({ width: w, color: c })` |
| `drawRect` / `drawRoundedRect`               | `rect` / `roundRect`                                       |
| `new Graphics().lineStyle(1,0x000000)`       | `new Graphics()`（描边在画完路径后 `.stroke(...)`）        |

## Steps

1. `brush/index.ts`：
   - 笔刷光标 `circle`：`drawCircle(0,0,r)` → `circle(0,0,r)`，描边改 `.stroke({ width: 1, color: 0x000000 })`；`setSize` 里 `clear()` 后重画同理。
   - `pointerMove` 的 dab：`graphics.beginFill(color).lineStyle(0,color).drawCircle(x,y,r)` → `graphics.circle(x, y, r).fill(color)`。
   - 连接线：`graphics.lineStyle(w,color).moveTo().lineTo()` → `graphics.moveTo(...).lineTo(...).stroke({ width: w, color })`。
   - `pointerUp` 的 `endFill()` 删除；`this.graphics.fill` 这种存在性判断按新逻辑调整（改判 `graphics.context` 是否有内容或自己记录 flag）。
2. `eraser/index.ts`：同样把 `beginFill/lineStyle/drawCircle` → `circle().fill()` / `stroke()`。**保持画白色**（真橡皮是 P1）；`BLEND_MODES.ERASE` 注释保持原样。
3. 行为对齐：迁移后单笔的视觉结果应与迁移前一致（同色、同粗细、同连续性）。

## Acceptance

- [ ] `pnpm -F pixi-painter typecheck` 通过。
- [ ] `examples/vue`：brush 能连续画线、改尺寸 / 颜色生效；笔刷光标圈随指针移动且随缩放缩放。
- [ ] eraser 仍能（以白色）擦、撤销可还原。
- [ ] 一次 `pointerdown→move→up` 仍是**一个** `Graphics`（行为未变；真正去 Graphics 化是 P1）。

## Out of scope

- 真橡皮 / destination-out（→ P1）。
- 戳印渲染 / RenderTexture（→ P1）。

---
title: P0-01 · 盘点 v7 API + 确认 Pixi 版本
---

# P0-01 · 盘点 v7 API 使用面 + 确认 Pixi 版本

- **Phase / ID**: P0 / P0-01
- **Depends on**: —
- **Files**: `packages/pixi-painter/src/**`（只读盘点）、`packages/pixi-painter/package.json`
- **Effort**: S

## Context

依赖已是 **pixi.js 8.19.0**，`pnpm build:lib` **能过**。已验证的关键事实：v8 **保留**了 `beginFill / drawCircle / lineStyle / endFill`、`app.view` 等 **deprecated 垫片**（能 build、能跑，仅 console 警告）。**唯一阻断运行的是 `Application` async-init**——`new Application(options)` 只打印 deprecation、不建 renderer，而构造函数链里同步读 `app.renderer` 会 throw。

所以本卡不是"找出所有 v7 API 去迁"，而是**给每个 v7 风格调用分三类**，决定谁必须改、谁可延后、谁等 P1 删——避免给将被删除的代码做无用迁移。**只盘点分类，不改代码。**

## Steps

1. 确认安装树只有 pixi 8.x：`pnpm why pixi.js`。
2. 全量 grep v7 风格调用（记文件:行）：
   ```bash
   rg -n "new Application\(|app\.view|app\.renderer|app\.screen|\.beginFill|\.endFill|\.lineStyle|drawCircle|drawRect|BLEND_MODES|\.name\s*=" packages/pixi-painter/src
   ```
3. 把命中项分到三个桶：
   - **🔴 breaking（必修，阻断运行）**：构造链里在 `await app.init()` 之前同步访问 `app.renderer / app.screen / app.view.width` 处（`painter.ts`、`board/index.ts`、`canvas/index.ts`）。→ 全部归 [P0-02](./P0-02-application-bootstrap-v8)。
   - **🟡 deprecated（能跑，可延后清理）**：`beginFill / drawCircle / lineStyle`、`app.view`、`name`（v8 有垫片，仅警告）。长寿命 overlay 部分 → [P0-04](./P0-04-graphics-canvas-board-layers-v8)。
   - **⚪ 被 P1 取代（P0 别碰）**：brush / eraser 的 Graphics 累积绘制 → P1 用 raster 引擎删除（[P0-03](./P0-03-graphics-brush-eraser-v8) 标可选）。
4. 顺带记两个 v8 行为变化备查：`Texture.from(deleteBinSvg)`（SVG / data-uri 可能需 `Assets.load`）、`extract.pixels(...)` 返回 `{ pixels, width, height }`。

## Acceptance

- [ ] 产出一份**三桶清单**（🔴 / 🟡 / ⚪，逐文件:行），贴回本卡或 PR。
- [ ] 确认安装树只有 pixi 8.x。
- [ ] 🔴 桶已全部指派到 P0-02。

## Out of scope

- 不改任何运行时代码（纯盘点分类）。

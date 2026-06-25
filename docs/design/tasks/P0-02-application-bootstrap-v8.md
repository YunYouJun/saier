---
title: P0-02 · Application 引导迁移到 v8
---

# P0-02 · Application 引导迁移（async init / `view`→`canvas`）

- **Phase / ID**: P0 / P0-02
- **Depends on**: P0-01
- **Files**: `packages/pixi-painter/src/painter.ts`、`src/board/index.ts`、`src/canvas/index.ts`（凡读 `app.view` / `app.screen` / `app.renderer` 处）
- **Effort**: M
- **Status**: 🔴 **P0 唯一的运行阻断修复** —— 不做这张，`createPainter()` 在 v8 直接 throw（构造里同步读 `app.renderer`，但 renderer 要 `await init()` 才建）。

## Context

v8 的渲染器初始化是**异步**的：`new Application()` 不再同步建好 renderer，必须 `await app.init(...)`。当前 `Painter` 构造函数里同步 `new Application({ view })` 并立刻访问 `app.stage` / `app.screen` / `app.renderer.resolution` / `app.view.width`——这些在 v8 必须等 `app.init()` 之后。

**采用的模式**（保持对外 API 兼容）：`createPainter()` 仍同步返回 `Painter`；构造函数只 `this.app = new Application()` + 存 options；把**所有依赖 renderer 的初始化挪进 `async init()`**（examples 已经是 `createPainter()` 后 `await painter.init()` 的用法，无需改调用方）。

## Steps

1. `painter.ts`：
   - 构造函数：`this.app = new Application()`，仅保存 `options`；**移除**所有访问 `app.stage/screen/renderer/view` 的代码。
   - `async init()` 开头：
     ```ts
     await this.app.init({
       canvas: this.options.view, // v7 的 `view` → v8 `canvas`
       background: 0x333333, // v7 `backgroundColor` → `background`
       width,
       height,
       antialias: true,
       resolution: this.options.resolution ?? (window.devicePixelRatio || 1),
       preference: 'webgl', // 生产用 WebGL（见 D3）
       ...this.options.pixiOptions,
     })
     ```
   - 把原构造函数里 stage 设置、`addChild`、board/canvas/brush/eraser 创建、事件绑定**整体下移**到 `app.init()` 之后。
2. 全局替换 `app.view` → `app.canvas`（注意 `app.canvas.width` 等）。
3. `app.destroy(false, {...})` 核对 v8 签名：`app.destroy({ removeView: false }, { children: true, texture: true, textureSource: true })`。
4. `board/index.ts`、`canvas/index.ts` 里 `app.view.width / app.renderer.resolution` 改为 `app.canvas.width / app.renderer.resolution`，并确保它们在 `init()` 之后才被调用（因 board/canvas 现在在 init 内创建）。
5. 保留 `import 'pixi.js/math-extras'`（v8 仍有效）。

## Acceptance

- [ ] `pnpm -F pixi-painter typecheck` 通过。
- [ ] `examples/vue` 启动：画布出现、可平移 / 滚轮缩放（不报 `app.view`/renderer 未就绪错误）。
- [ ] `painter.destroy()` 不抛错。

## Out of scope

- Graphics 形状 API 迁移（→ [P0-03](./P0-03-graphics-brush-eraser-v8) / [P0-04](./P0-04-graphics-canvas-board-layers-v8)）。
- extract 迁移（→ [P0-05](./P0-05-extract-export-v8)）。

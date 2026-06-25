---
title: P0-05 · extract / 导出 API 迁移
---

# P0-05 · extract / 导出 API 迁移到 v8

- **Phase / ID**: P0 / P0-05
- **Depends on**: P0-02
- **Files**: `packages/pixi-painter/src/painter.ts`（`extractCanvas`）、调用方 `examples/vue`（download / extract 按钮）、`packages/controls`
- **Effort**: S

## Context

`extractCanvas('image'|'base64'|'canvas'|'pixels')` 走 `app.renderer.extract.*`。v8 的 extract 大体同名，但：

- `extract.image(...)` / `base64(...)` 返回 **Promise**（v7 也是 Promise，确认 `await`）。
- `extract.pixels(...)` 在 v8 返回 **`{ pixels, width, height }`**（不再是裸 `Uint8Array`）——`'pixels'` 分支的返回类型变了，调用方需适配。
- extract 方法在 v8 接受 `target` 或 `{ target, ... }` 选项对象。

## Steps

1. `painter.ts` `extractCanvas`：核对四个分支签名；`'pixels'` 分支返回值结构改为 `{ pixels, width, height }`（或在此卡内决定只返回 `pixels` 字段以保持旧形状，并在 JSDoc 注明）。
2. 检查 `examples/vue` 的 `PainterControls.vue` download / extract：`extractCanvas('base64')` 仍返回 string，`<a download>` 正常。
3. `examples/vue` composable `usePixiPainter` 里 `extractCanvas('canvas')` 后 `toBlob`：确认 v8 返回的 canvas 仍是可 `toBlob` 的 `HTMLCanvasElement`/`ICanvas`（必要时 `as HTMLCanvasElement`）。

## Acceptance

- [ ] `pnpm -F pixi-painter typecheck` 通过。
- [ ] `examples/vue`：点「下载」得到正确 PNG；点「extract」目标画布显示截图。
- [ ] `'pixels'` 分支返回结构已在 JSDoc / 类型上明确。

## Out of scope

- PNG/PSD 工程文件导出（→ P8）。

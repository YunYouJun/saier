---
title: P7-07 · 混色预设 + Vue UI（smudge / watercolor + 参数）
---

# P7-07 · 预设与 UI：把混色交到用户手里

- **Phase / ID**: P7 / P7-07
- **Depends on**: P7-00（tile 默认）、P7-01、P7-04、P4-05（笔刷 UI）
- **Files**: `packages/core/src/brush/BrushPreset.ts`、`packages/vue/src/**`（笔刷面板 / 参数条）、`packages/saier/src/painter.ts`（后端门控）、`packages/vue/test/`
- **Effort**: M

## Context

把 P7 的混色 / 水彩做成**可切换的预设 + 可调的参数滑块**，沿用 [P4-05](./P4-05-brush-ui) 的笔刷 UI 与 [D7](../decisions#d7) 薄皮约定——UI 只经 `PainterController` setter/事件，不碰 core 内部。

> 后端门控（[D11](../decisions#d11) 方案 A，[P7-00](./P7-00-tile-default-backend) 已落）：tile 已是默认后端，混色笔刷开箱即用；UI 无需切后端，仅在用户**显式**选了非 tile 后端时禁用混色预设并提示。

## Steps

1. **预设**：补齐 `smudge` / `blender` / `watercolor` 默认预设（参数来自 P7-04 / P7-05），出现在 preset picker。
2. **UI 参数**：参数面板按当前引擎条件渲染 P7 滑块——`smudge`（取色量）、`persistence`（留色）、`colorAmount`（自色）、`dilution`（稀释）、`wetEdge`（湿边开关 / 强度）、`density`（浓度）、纸纹开关 + 强度；全部经 controller setter（`setSmudge` 等）。
3. **后端门控**：tile 默认（[P7-00](./P7-00-tile-default-backend)）下混色开箱即用；仅当用户**显式**选 `backend: 'rendertexture'` 时，混色预设灰显并提示「需 tile 后端」。
4. **demo**：`examples/vue` 与 `site` 经共享 `usePainter()`（[P5-04](./P5-04-use-painter-composable)）即得新笔刷，无需各自接线。
5. 测试：UI 改滑块 → `brush:change` 携带新参数；引擎切换时面板条件渲染正确；demo 冒烟。

## Acceptance

- [ ] preset picker 可选 smudge / watercolor，参数滑块即时驱动 core（经 controller，不碰内部）。
- [ ] tile 默认下混色笔刷开箱即用；显式选非 tile 后端时混色预设灰显 + 提示。
- [ ] `examples/vue` 与 `site` 共享同一 `usePainter()` 即得新笔刷；冒烟通过。

## Out of scope

- 笔刷工作室 / 自定义预设持久化（后续）；新增 core 引擎逻辑（P7-04/05/06）。

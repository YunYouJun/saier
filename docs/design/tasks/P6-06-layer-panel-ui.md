---
title: P6-06 · 图层面板 UI（锁透明 / 剪贴 / 蒙版）
---

# P6-06 · `@saier/vue`：锁透明 / 剪贴 / 蒙版的面板控件

- **Phase / ID**: P6 / P6-06
- **Depends on**: P6-01..05、P5-03（Vue 图层面板）
- **Files**: `packages/vue/components/PainterLayerPanel.vue`、`packages/vue/composables/usePainter.ts`、`site/app/**`、`examples/vue/**`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成（默认发布 UI 暴露锁透明 / 剪贴；蒙版 UI 保持 experimental / 非默认）

## Result

`usePainter().layerActions` 暴露 `setLockAlpha` / `setClip`,`PainterLayerPanel.vue` 每个图层行加锁透明、剪贴切换钮(active 高亮、剪贴底层禁用),site 首页 + examples/vue 两个 demo 都接线消费,经 controller(无库静态直写)。蒙版 API / 像素路径已验证，但**默认发布 UI 暂不暴露蒙版增删 / 启停 / 绘画目标切换**，避免把高级能力过早承诺为正式功能。

## Context

P5 已有 Vue 图层面板（增删 / 排序 / 显隐 / opacity / blend）。本卡补 P6 能力的 chrome：锁透明开关、剪贴开关、蒙版增删与「内容 / 蒙版」绘画目标切换、蒙版缩略图。严守 [D7](../decisions#d7)：UI 只通过 `usePainter()` → controller 命令操作，**不**直接读写库静态字段或 Pixi scene graph。

## Steps

1. `usePainter()` 暴露 P6 命令镜像：`setLockAlpha/setClip/addMask/removeMask/setMaskEnabled/setPaintTarget`，并把 `lockAlpha/clip/mask` 纳入 layer 的响应式快照（core → UI 单向镜像 + UI → core 经命令）。
2. `PainterLayerPanel.vue`：每个图层行加锁透明图标钮、剪贴图标钮、蒙版区（缩略图 + 加/删 + 启停）；选中蒙版时高亮当前绘画目标（content / mask）。
3. 剪贴层在面板用缩进 / 箭头等视觉表达「贴向下层」。
4. `examples/vue` 与 `site` 通过共享 `usePainter()` 自动获得这些控件（不各写一套）。
5. 验收用 grep + 冒烟：UI 不出现 `PainterBrush.*` 静态写、不读 `canvas.container.children`；`pnpm build` / `pnpm test:e2e` demo 冒烟通过。

## Acceptance

- [x] 面板可切换锁透明、剪贴，且即时反映到画布。
- [x] 所有默认发布操作经 controller（grep 验收：无库静态字段直写、无 Pixi scene graph 读取）。
- [x] `examples/vue` 与 `site` 共用同一 `usePainter()`，无重复装配。
- [x] demo 构建 / browser 测试覆盖默认发布 UI。

## Deferred / experimental

- [ ] 蒙版增删 / 启停 / 绘画目标切换 UI。底层 API 与像素路径已验证，默认发布 UI 暂不承诺。

## Out of scope

- 自由变换手柄的 UI 重做；蒙版默认 UI；core 行为正确性（已在 P6-02..05 验收）。

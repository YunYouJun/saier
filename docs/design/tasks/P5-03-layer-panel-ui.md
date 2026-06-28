---
title: P5-03 · Vue 图层面板
---

# P5-03 · `@saier/vue`：图层面板

- **Phase / ID**: P5 / P5-03
- **Depends on**: P5-01、P5-02
- **Files**: `packages/controls/components/**`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

P5 要让 Vue UI 读 controller state，而不是读 `painter.canvas.container.children`。图层面板是这一原则的第一块真实 UI：它镜像 `document.layers`，把用户操作发送给 controller / painter。

## Result

新增 `PainterLayerPanel.vue`，按 controller snapshot 展示 top-to-bottom 图层列表，支持 active 选择、显隐、opacity、blend mode、重命名、上移 / 下移、增删与缩略图。面板没有读取 Pixi scene graph。

## Steps

1. 新增 `PainterLayerPanel.vue`：列出图层、缩略图、active 状态、显隐、opacity、blend mode、上移/下移、增删。
2. 面板只消费 controller snapshot；不访问 Pixi scene graph。
3. `examples/vue` 与 site 挂载该面板，并与现有 toolbar / options bar 保持独立。
4. 缩略图先以 painter 提供的 async extract 入口更新，失败时有稳定占位。

## Acceptance

- [x] 图层面板增删 / 排序 / 改透明度即时反映。
- [x] 面板不读 `canvas.container.children`。
- [x] UI 不直接引用 `PainterBrush.*` 静态字段。

## Out of scope

- 图层分组、蒙版、剪贴、锁透明（→ P6）。

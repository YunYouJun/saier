---
title: P9-06 · Custom brushes and compact brush UI
---

# P9-06 · 自定义笔刷与紧凑笔刷 UI

- **Phase / ID**: P9-06
- **Depends on**: P9-01、P9-04
- **Files**: `packages/core/src/controller/`、`packages/vue/components/BrushPresetPicker.vue`、`packages/vue/components/PainterOptionsBar.vue`
- **Effort**: M

## Context

默认笔刷数量增加后，横向大按钮条会吞掉过多面板空间。主流绘画软件通常把“笔刷组 / 标签”和“当前组里的笔刷列表”分开，参数编辑另放：Krita 有 brush preset docker + tag，Procreate 是左侧 brush sets / 右侧 brush list，Clip Studio 也用工具 / 子工具 / 属性分层。

## Steps

1. `BrushPreset` 增加 `group` / `source` / `custom` / `tags` 元数据。
2. `PainterController.brush` 支持 `registerPreset()` / `createCustomPreset()` / `removePreset()`。
3. `@saier/vue` 的 `BrushPresetPicker` 改为分组紧凑列表，提供保存当前笔刷与删除自定义笔刷入口。
4. 保持参数面板和笔刷选择面板职责分离：选择器只发事件，`PainterOptionsBar` 调用 painter/controller。

## Acceptance

- [x] 用户可把当前参数保存为自定义笔刷，并立即切换使用。
- [x] 自定义笔刷可删除；删除当前自定义笔刷时回退到默认笔刷。
- [x] 笔刷列表按组呈现，不再横向铺满所有 preset。
- [x] Vue 测试覆盖保存自定义笔刷和紧凑分组面板。

## Out of scope

- 自定义笔刷跨刷新持久化（发布前作为 host 示例补充）。
- 完整 Brush Studio。

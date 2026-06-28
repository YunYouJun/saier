---
title: P4-05 · 笔刷 UI（预设选择 + 参数）
---

# P4-05 · `@saier/vue`：笔刷 UI（预设切换 + 参数面板）

- **Phase / ID**: P4 / P4-05
- **Depends on**: P1-07（controller）、P4-01（registry）
- **Files**: `packages/vue/components/BrushPicker.vue`、`BrushParams.vue`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

让用户切换笔刷、调参数——纯 DOM 面板，**走 controller**（[D7](../decisions#d7)），不碰 core 内部静态。验证 controller 表面够用、UI 薄皮模式成立。

## Result

已新增 `BrushPresetPicker.vue`，`PainterOptionsBar.vue` 通过 controller state 镜像 preset / size / opacity / spacing / hardness / flow，改值调用 painter brush 实例 API；`PainterControls.vue` 的颜色选择也改为走 controller/实例 API。

## Steps

1. `BrushPicker`：列举 `BrushRegistry` 的 preset（缩略图 + 名称），点选 → `controller.setBrushPreset(id)`。
2. `BrushParams`：size / opacity / spacing / hardness / flow 滑块，双向绑 `controller`（`on('brush:change')` 镜像、改值调 setter）。
3. controller 按需补 `setBrushPreset` / `setBrushParam`（回 [P1-07](./P1-07-headless-controller) 扩接口）。
4. **不**直接引用 `PainterBrush.*` 静态（[D7](../decisions#d7) 红线）。

## Acceptance

- [x] UI 切笔刷即时生效；参数滑块改值即时反映到笔迹。
- [x] 面板状态由 `controller.getState()` 驱动，无对 core 静态字段的直接引用（grep 断言）。
- [x] core 端改笔刷（如快捷键）→ 面板同步（事件回流）。

## Out of scope

- 笔刷编辑器 / 自定义 preset 持久化（后续）；React 版（按需）。

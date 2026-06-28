---
title: P5-01 · 图层栈模型与 controller 命令
---

# P5-01 · `@saier/core`：图层栈模型与 controller 命令

- **Phase / ID**: P5 / P5-01
- **Depends on**: P1-04、P1-07
- **Files**: `packages/core/src/document/**`、`packages/core/src/controller/**`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

P1 已有 `Document` / `RasterLayer` 的基础模型，但 P5 要把图层栈变成 UI 可用的完整命令面：增删、排序、激活、显隐、透明度、blend mode、重命名都必须从 controller 进入，而不是 UI 直接改 Pixi scene graph 或库静态字段。

## Result

`Document` 已补齐 label / blend mode setter，并在创建与更新时 clamp opacity。`PainterController.layer` 现在暴露 add / remove / move / setActive / setVisible / setOpacity / setBlendMode / setLabel，UI 可只通过 controller 操作图层栈。

## Steps

1. 补齐 `Document` 的 layer property setter：`setLabel`、`setBlendMode` 等，保持 clamp 与 no-op 不重复 emit。
2. 在 `PainterController` 暴露 `layer.*` 命令集合：`add/remove/move/setActive/setVisible/setOpacity/setBlendMode/setLabel`。
3. controller 的 `layers:change` snapshot 仍保持防御性拷贝，UI 只读 snapshot。
4. 单测覆盖命令转发、active fallback、clamp、事件与防御性快照。

## Acceptance

- [x] UI 所需图层命令都能从 controller 调用。
- [x] `Document` 的图层顺序、显隐、opacity、blend mode、label 修改都会触发 `layers:change`。
- [x] 无 Pixi 依赖。

## Out of scope

- 像素存储、蒙版、剪贴、锁透明（→ P6）。

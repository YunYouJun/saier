---
title: P1-07 · headless controller 表面
---

# P1-07 · `core`：headless controller 表面

- **Phase / ID**: P1 / P1-07
- **Depends on**: P1-04
- **Files**: `packages/core/src/controller/**`、`src/index.ts`、`test/`
- **Effort**: S
- **Status**: ✅ 已完成（D7 铺路；UI 真正改造在 P5）

## Context

按 [D7](../decisions#d7)，UI 面板应绑定一个**框架无关 controller**，而不是直接戳 `PainterBrush.color` 这类静态字段。本卡只**暴露 controller 表面 + 事件**；Vue / React 薄皮的接入与现有 `controls` 的迁移是 [P5](../roadmap#p5-图层栈能力)。

## Steps

1. 定义 `PainterController`（或挂在 painter facade 上）：
   - 命令式：`setTool(tool)`、`brush.setSize(n)`、`brush.setColor(rgba)`、`brush.setOpacity(n)`、`setActiveLayer(id)`。
   - 状态快照：`getState()` 返回 `{ tool, brush: { size, color, opacity }, layers, activeLayerId }`（纯数据，可被框架镜像）。
   - 事件（复用现有 emitter 风格）：`on('tool:change' | 'brush:change' | 'layers:change' | 'history:change')`。
2. 事实来源放在 core（不在框架响应式）；setter 改值后 emit 对应事件。
3. 单测：`setBrushSize` → `getState().brush.size` 更新且触发 `brush:change`。

## Acceptance

- [x] controller 暴露上述命令 / 快照 / 事件，纯 node 可测、无 Pixi。
- [x] 改任一笔刷参数会 emit `brush:change` 且 `getState()` 同步。
- [x] 文档/JSDoc 标注：UI 应只读 `getState()` + 订阅事件 + 调 setter，**不得**直接写 core 内部字段。

## Out of scope

- 改 `@saier/vue` 的 Vue 组件、去掉 `v-model="PainterBrush.color"`（→ P5）。
- React 薄皮（→ P5/按需）。

---
title: P9-01 · BrushEngine registry
---

# P9-01 · 外部 `BrushEngine` 注册表

- **Phase / ID**: P9-01
- **Depends on**: P4-01、P7-08
- **Files**: `packages/core/src/brush/BrushPreset.ts`、`packages/saier/src/painter.ts`、`packages/saier/src/brush/index.ts`、`packages/core/test/`
- **Effort**: M

## Context

Roadmap P9 的目标是让 libmypaint / Hokusai 风格引擎成为插件，而不是继续往 `createBrushEngineFromPreset()` 的 `switch` 里塞内置分支。P9 的第一步是把「preset 数据」和「engine factory」解耦：preset 只声明 `engine` id，factory 由 registry 提供。

**已落地（2026-07-01）**：新增 `BrushEngineRegistry` / `BrushEngineRegistration`，内置 simple / airbrush / calligraphy / smudge 以同一注册机制提供；`createBrushEngineFromPreset()` 接收 registry；`Painter` 暴露 `brushEngineRegistry` 并支持 `PainterOptions.brushEngines`。

## Steps

1. 新增 `BrushEngineRegistry`：`register()` / `unregister()` / `has()` / `getDescriptor()` / `create()`。
2. 用 registry 承载内置 engine factory，保留 `createBrushEngineFromPreset(preset, options)` 的默认行为。
3. `Painter` 持有实例级 registry，允许用户在 `init()` 前注册外部 engine。
4. 缺失 engine 时抛明确错误，不静默 fallback 到 simple。

## Acceptance

- [x] 外部 engine factory 可创建实现 `BrushEngine` 的实例，无需改 core switch。
- [x] 缺失 engine id 时有明确错误。
- [x] 内置 preset 行为不回归。

## Out of scope

- 真实 libmypaint WASM 编译 / 加载。
- `.myb` 参数映射。

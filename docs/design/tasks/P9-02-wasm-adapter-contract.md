---
title: P9-02 · WASM brush adapter contract
---

# P9-02 · WASM / 实验引擎适配契约

- **Phase / ID**: P9-02
- **Depends on**: P9-01
- **Files**: `packages/core/src/brush/`、`packages/core/test/`
- **Effort**: M

## Context

外部引擎可能是同步 JS、异步 WASM、或需要额外资源的实验实现。core 的热路径仍应保持同步 `BrushEngine` 契约；WASM 初始化、资源加载和失败回退应在注册前完成。

**已落地（2026-07-01）**：`loadBrushEngineRegistration()` 把异步 loader 解析为同步 `BrushEngineRegistration`；注册到 `BrushEngineRegistry` 之后，stroke 热路径仍只调用同步 factory。

## Steps

1. 约定 adapter 初始化流程：异步加载发生在 app 层，注册到 core 的 factory 必须同步返回 `BrushEngine`。
2. 记录 engine descriptor：`label`、`experimental`、`requiresSurfaceSampler`、`supportsMixingControls`。
3. 为 WASM adapter 写 fake engine 单测，覆盖初始化失败不污染默认 registry。

## Acceptance

- [x] 文档说明异步加载边界：加载在注册前，stroke 热路径同步。
- [x] fake WASM adapter 可被注册、创建、销毁，不影响内置笔刷。

## Out of scope

- 选择具体 WASM 工具链。

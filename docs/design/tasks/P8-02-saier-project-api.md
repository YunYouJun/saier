---
title: P8-02 · saier 工程导出 / 导入 API
---

# P8-02 · saier 工程导出 / 导入 API：active document save/load

- **Phase / ID**: P8 / P8-02
- **Depends on**: P8-01、P5-04、P7-00
- **Files**: `packages/saier/src/painter.ts`、`packages/saier/test/project-format.browser.spec.ts`
- **Effort**: M

## Context

`@saier/core` 负责纯格式，`saier` umbrella 负责把 active document 的真实 backend surface 接进去。当前可完整保存的是 tiled backend：它暴露 `getSurface(layerId)`，CPU tile 是像素真相；RenderTexture backend 没有廉价 CPU surface，必须明确拒绝工程保存，避免产生假完整文件。

**已落地（2026-06-30）**：`Painter.exportProject()` 导出 active document；`Painter.importProject()` 把工程文件导入为新 document，并写回 content/mask tile surface。

## Steps

1. `exportProject(options)`：flush uploads，读取 active session 的 `Document` + tiled surfaces，附带 document name/id metadata。
2. `importProject(project, options)`：反序列化 core project，创建新 document session，按 layer/mask id 写回 tile pixels。
3. 导入后刷新 clip/mask derived display，确保 mask 导入后立即显示正确。
4. RenderTexture backend 调用工程导出时抛出清晰错误。
5. 浏览器测试覆盖真实 tiled backend 保存再导入。

## Acceptance

- [x] active tiled document 可导出为 `SaierProjectFile`。
- [x] 导入后新 document 的图层属性、mask、像素与原工程一致。
- [x] RenderTexture backend 不支持工程导出时明确报错。

## Out of scope

- 多 document 一次性打包；文件选择器 UI；RenderTexture backend 的 CPU readback 导出。

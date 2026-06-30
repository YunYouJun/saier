---
title: P8-01 · 工程文件格式（Document + tile surfaces）
---

# P8-01 · 工程文件格式：保存 Document 元数据与稀疏 tile 像素

- **Phase / ID**: P8 / P8-01
- **Depends on**: P2-01、P5-01、P6-01、P7-00
- **Files**: `packages/core/src/format/project.ts`、`packages/core/test/project-format.spec.ts`
- **Effort**: M

## Context

P8 的核心验收是「保存 → 读取还原图层」。`Document` 只保存图层元数据，像素在 `SurfaceBackend`；P7 后默认 tile 后端已把 CPU `TiledSurface` 作为像素真相。因此工程文件格式以 **Document layer state + sparse tile surfaces** 为第一版，不依赖 Pixi，也不通过 canvas extract 反推像素。

**已落地（2026-06-30）**：新增 `saier.project` v1 schema，包含 document 尺寸、active layer、layer attributes（visible / opacity / blend / lock alpha / clip / transform / mask）与每个 layer/mask surface 的非空 tile（base64）。

## Steps

1. 定义 `SaierProjectFile`：`format/version/width/height/tileSize/activeLayerId/metadata/layers/surfaces`。
2. `serializeSaierProject()` 从 `Document` + `resolveSurface(id)` 生成纯 JSON 可存储结构。
3. `deserializeSaierProject()` 还原 `Document` 与 `Map<surfaceId,TiledSurface>`。
4. 只写非空 tile；透明区域保持稀疏，避免大画布全量保存。
5. 单测覆盖图层属性、mask 引用、active layer、metadata 与像素 round-trip。

## Acceptance

- [x] 工程文件能保存 / 读取还原图层顺序、属性、mask 引用和 active layer。
- [x] 图层与 mask 的 tile 像素逐位一致。
- [x] 缺失 surface 时明确报错，不生成不完整工程文件。

## Out of scope

- 压缩容器 / 二进制包格式；PSD 导出（P8 可选后续）。

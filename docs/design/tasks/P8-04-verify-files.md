---
title: P8-04 · P8 验收（工程文件 / 回放）
---

# P8-04 · P8 验收：工程 round-trip 与 stroke replay determinism

- **Phase / ID**: P8 / P8-04
- **Depends on**: P8-01、P8-02、P8-03
- **Files**: `packages/core/test/**`、`packages/saier/test/project-format.browser.spec.ts`
- **Effort**: M

## Context

P8 的出口标准是 Roadmap 的两句话：**保存 → 读取还原图层；同一笔迹回放像素一致**。验收必须同时覆盖 core 纯逻辑和浏览器真实 backend。

**已落地（2026-06-30）**：新增 Node tests 覆盖 project schema 与 shodo replay；新增 browser spec 覆盖 active tiled document 导出、导入为新 document、RenderTexture backend 门控。

## Steps

1. Node：工程文件 round-trip 图层属性 / mask / metadata / tile pixels。
2. Node：shodo stroke record replay 两次，像素逐位一致。
3. Browser：真实 `PixiTileTextureBackend` 导出 active document 并导入为新 document。
4. Browser：导入后验证 content layer、mask surface、layer metadata。
5. 完整 gates：`pnpm typecheck` / `pnpm lint` / `pnpm test`，并按需跑 lib/site/docs 构建。

## Acceptance

- [x] 保存 → 读取还原图层与像素。
- [x] 同一笔迹回放像素一致。
- [x] Browser tiled backend 工程导出 / 导入通过；RenderTexture backend 明确不支持工程导出。

## Out of scope

- PSD 导出；用户态文件 picker / download UI。

---
title: P2-02 · CPU dab 光栅器
---

# P2-02 · `core`：CPU dab 光栅器

- **Phase / ID**: P2 / P2-02
- **Depends on**: P2-01
- **Files**: `packages/core/src/surface/rasterizer.ts`、`test/`
- **Effort**: L
- **Status**: 🟡 条件性

## Context

P1 的 dab 在 GPU（RenderTexture render）光栅化；P2 改为 **CPU 把 `BrushDab` 写进 tile 像素缓冲**。这是 tile 路线的核心算法件，也是 P7 混色的基础（CPU 能读能算）。**确定性**、零 Pixi、可单测。

> 诚实提示：这等于第二套 dab 光栅化（GPU 一套、CPU 一套）。这是 [D1](../decisions#d1) 阶段化的已知代价——RenderTexture 先行让你早交付，CPU 光栅器只在需要混色 / 大画布时才付出。

## Steps

1. `rasterizeDab(surface, dab, mode)`：
   - 算 dab 包围盒 → 命中 tiles → 对每个覆盖像素算覆盖率（**抗锯齿**：到圆心距离的平滑边缘；`hardness` 控制软硬）。
   - **opacity accumulation**：`mode='normal'` 用 source-over 把 `color×coverage×opacity` 合进 tile 像素；`mode='erase'` 用 destination-out 减 alpha。
   - premultiplied alpha 一致（与 P1-02 辅助 + adapter 上传约定对齐）。
   - `markDirty(dab bbox)`。
2. 单笔内同一像素多 dab 叠加要正确累积（不过冲、不发黑）。
3. 与 `SurfaceBackend.paintDab` 对接：tile 后端的 `paintDab` 即调用本光栅器。

## Acceptance

- [ ] `test/rasterizer.spec.ts`：单 dab 覆盖率 / 边缘 AA 符合预期（采样若干像素断言）。
- [ ] erase dab 使被覆盖像素 `alpha` 下降到 0。
- [ ] 同输入两次像素逐字节一致（确定性）。
- [ ] 跨 tile 边界的 dab 在两 tile 上无缝。

## Out of scope

- 取色混合 / smudge / 湿边（→ P7，复用本光栅器与 tile 读写）。
- 戳印纹理笔尖（→ P4）。

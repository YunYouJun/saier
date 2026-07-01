---
title: P9-04 · Engine capability UI gating
---

# P9-04 · Engine capability UI gating

- **Phase / ID**: P9-04
- **Depends on**: P9-01
- **Files**: `packages/core/src/controller/PainterController.ts`、`packages/vue/components/PainterOptionsBar.vue`、`packages/vue/test/`
- **Effort**: S

## Context

外部 engine 可能需要 tiled sampler、可能是 experimental，也可能尚未加载。UI 不能靠 `preset.engine === 'smudge'` 这种硬编码判断能力。

**已落地（2026-07-01）**：`BrushPresetSummary` 携带 `engineAvailable`、`requiresSurfaceSampler`、`supportsMixingControls`、`experimental`；Vue 选笔 UI 用 summary 能力禁用不可用 preset，并用 `supportsMixingControls` 决定是否展示混色参数。

## Steps

1. controller 输出带能力标记的 `BrushPresetSummary`。
2. Vue preset picker 禁用 engine 未注册或 backend 不支持的 preset。
3. 混色参数显示改为读 `supportsMixingControls`，保留旧 summary 的 smudge fallback。

## Acceptance

- [x] 缺失外部 engine 的 preset 在 Vue UI 中不可选择。
- [x] smudge / watercolor 在无 `sampleRegion` backend 下仍禁用。
- [x] 旧 summary 形状不崩溃。

## Out of scope

- 异步下载 WASM 的 loading UI。

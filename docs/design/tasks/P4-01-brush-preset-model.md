---
title: P4-01 · BrushPreset 模型 + 注册表
---

# P4-01 · `@saier/core`：BrushPreset 模型 + 注册表

- **Phase / ID**: P4 / P4-01
- **Depends on**: P1-03（SimpleBrushEngine）、P3-03（动态）
- **Files**: `packages/core/src/brush/{BrushPreset,registry}.ts`、`test/`
- **Effort**: M
- **Status**: 🟡 P4 地基

## Context

把"一支笔"数据化：`BrushPreset` 描述一支笔的所有参数，喂给 `BrushEngine` 驱动 dab。先有数据模型 + 注册表，后面 pen/pencil/airbrush/marker 都是它的实例。

## Steps

1. `BrushPreset`：`{ id, name, engine: 'simple'|'calligraphy', tipId, spacing, hardness, flow, sizeCurve, opacityCurve, minSize/maxSize, minOpacity/maxOpacity, blend: CompositeMode|'multiply'..., taperIn/Out }`（复用 [P3-03](./P3-03-pressure-dynamics) 的曲线/动态）。
2. `BrushRegistry`：注册 / 取用 preset；内置默认集（P4-03/04 填充）；可被 UI 列举（[P4-05](./P4-05-brush-ui)）。
3. `BrushEngine` 消费 preset：`beginStroke(ctx)` 的 `ctx` 由 preset + 当前颜色/基础尺寸解析而来。
4. 纯数据 + 纯逻辑，零 Pixi，可单测。

## Acceptance

- [ ] 用不同 preset 驱动 `SimpleBrushEngine`，产出的 dab 序列按参数可见不同（spacing/hardness/flow）。
- [ ] 注册表可增删列举；默认集存在。
- [ ] 仍无 pixi.js。

## Out of scope

- 笔尖纹理渲染（→ P4-02）、具体笔种（→ P4-03/04）、UI（→ P4-05）。

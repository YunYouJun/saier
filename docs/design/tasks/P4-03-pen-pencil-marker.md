---
title: P4-03 · pen / pencil / marker 预设
---

# P4-03 · `@saier/core`：pen / pencil / marker 预设

- **Phase / ID**: P4 / P4-03
- **Depends on**: P4-01、P4-02
- **Files**: `packages/core/src/brush/presets/`、`test/`
- **Effort**: M
- **Status**: ✅ 已完成

## Context

三支"不随时间累积"的基础笔，都是 `BrushPreset` + `SimpleBrushEngine` 的实例，验证 preset 模型 + 笔尖系统够用。

## Result

默认 registry 已包含 `pen` / `pencil` / `marker`。pen 使用 hard round tip，pencil 使用 textured tip，marker 使用 chisel tip + `max-alpha` dab accumulation；tile 与 RT 后端都用 stroke-local scratch 保证单笔内不过度叠深、跨笔仍可叠加。

## Steps

1. **pen**：硬边 `round-hard`、高 opacity、小 spacing、压感→size 为主——干净线稿。
2. **pencil**：略软 + 纹理 tip（轻微颗粒）、opacity 中、压感→opacity 为主——铅笔质感。
3. **marker**：半透明、`multiply`-ish 叠加，但**单笔内不过度叠深**——同一笔反复经过同一处不应越来越黑（用"单笔 max alpha 缓冲"：一笔内每像素只取最大覆盖，结束才合成进图层）。
4. 都注册进 `BrushRegistry`。

## Acceptance

- [x] pen/pencil/marker 三种产出肉眼可辨（golden）。
- [x] **marker 单笔自叠不发黑**：一笔来回涂同一处，alpha 不超过单笔上限（断言）。
- [x] 跨笔叠加仍会加深（marker 的"多层"特性保留）。

## Out of scope

- airbrush 的时间累积（→ P4-04）；真实水彩混色（→ P7）。

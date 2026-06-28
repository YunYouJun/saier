---
title: P4-06 · 笔刷家族验收
---

# P4-06 · 笔刷家族验收（≥4 笔 + 行为断言）

- **Phase / ID**: P4 / P4-06
- **Depends on**: P4-03、P4-04、P4-05
- **Files**: `test/`、`examples/*`
- **Effort**: S
- **Status**: ✅ 已完成

## Context

把 [roadmap P4](../roadmap#p4-笔刷家族) 的验收落成自动化测试 + demo 冒烟。

## Result

已补 core brush-family 行为测试与 RenderTexture 后端浏览器像素测试；默认 UI 可列举并切换 pen / pencil / marker / airbrush / calligraphy。

## Steps

1. golden：pen / pencil / marker / airbrush 各画一笔，与基准比对。
2. 行为断言：marker 单笔不发黑（[P4-03](./P4-03-pen-pencil-marker)）；airbrush 停驻累积（[P4-04](./P4-04-airbrush)）。
3. UI 冒烟：`examples/vue` 切 ≥4 种笔刷、调参生效。
4. 确定性：各笔刷同输入（airbrush 同注入时钟）→ 同像素哈希。

## Acceptance

- [x] ≥4 种笔刷 golden 通过且互不相同。
- [x] marker / airbrush 专属行为断言通过。
- [x] `examples/vue` UI 切换 + 调参主观通过。
- [x] `pnpm build` / `typecheck` / `lint` / `test` 全绿。

## Out of scope

- 锁透明 / 蒙版（→ P6）；混色 / 水彩（→ P7）。

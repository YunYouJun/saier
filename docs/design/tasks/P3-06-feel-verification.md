---
title: P3-06 · 跟手验收 + 手感基准
---

# P3-06 · 跟手验收：确定性回放 + 延迟 + 手感基准

- **Phase / ID**: P3 / P3-06
- **Depends on**: P3-02、P3-03、P3-04；P0-06（测试地基）
- **Files**: `test/`、`examples/*`
- **Effort**: M
- **Status**: ✅ 已完成（P3 出口）

## Context

把"跟手对不对"这个产品级问题落成可量化验收。`跟手 / stabilizer` 是这类工具的灵魂——它好不好直接决定产品成败，所以要可测、可回归。

> **建议提前 spike**（[Risks #3](../roadmap#risks)）：stabilizer / pressure curve 不必等 P1/P2 全落地。可在**现有管线**先做一个最小可玩验证（哪怕临时挂在旧 Graphics 笔刷上），尽早回答"手感对不对"，再决定投入。

## Steps

1. **确定性回放**：录一组输入点（含 pressure/time），跑两次，断言最终像素哈希一致（依赖 P3-02/03/04 去随机）。
2. **stabilizer 分级**：0/轻/中/强 各跑同一手抖输入，断言平滑度单调提升（轨迹方差 / 曲率指标）。
3. **延迟测量**：从 pointer 事件到 dab 落地的延迟（强 stabilizer 下滞后可控，不"拖泥带水"）。
4. **慢速圆 / 直线**：golden 比对无锯齿、无转角发飘。
5. demo 冒烟：`examples/vue` 真机（触屏 + 笔）手感主观过关；记录基准录像/截图。

## Acceptance

- [x] 上述 1–4 为自动化测试且绿（`pnpm test`）。
- [x] 同输入回放像素哈希一致（确定性回归）。
- [x] stabilizer 四档平滑度可量化区分。
- [x] `examples/vue` 触屏 + 笔手感主观通过，基准留档（当前回合以自动化 touch/pen routing + demo 冒烟替代实体设备手测）。

## Out of scope

- 笔刷质感（纹理 / 混色，→ P4/P7）；性能极限（→ P2 指标）。

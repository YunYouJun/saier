---
title: Testing & Determinism
---

# 测试与确定性策略

> 贯穿所有阶段。raster 引擎相比 Graphics 版本最大的好处之一：**可被像素级验证**。每个阶段的「验收标准」都应落到可自动化的测试。

## 确定性（determinism）

- 所有笔刷运算在 **document space**（见 [D2](./decisions#d2)），与 zoom / DPR 解耦。
- `Stabilizer` / `BrushEngine` **不依赖** `Date.now()` / `Math.random()`；需随机时用可注入 seed。
  - 具体债：`shodo` 现有 `stroke-engine.ts` 的 `_drawStroke` 用了 `Math.random()` 抖动，收割时要改成 seeded。
- 目标：**同一组输入点 → 同样的像素输出**，这是回放、协作与 golden-image 测试的前提。

## 测试分层

| 层                   | 工具                               | 测什么                                                                                                                       |
| -------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 单元（纯逻辑）       | vitest（node）                     | `BrushEngine` 产 dab、`UndoManager` patch 往返、坐标变换、`PressureCurve` / `Stabilizer`。`core` 不依赖 Pixi，可纯 node 测。 |
| 像素（golden image） | vitest + Pixi `extract` / headless | 每个笔刷 / 操作存基准 PNG，CI 用像素差阈值比对。                                                                             |
| 集成 / 交互          | `@vitest/browser` 或 Playwright    | 画线 → extract → 断言；撤销 / 重做像素一致。                                                                                 |

## 关键断言（对应各阶段验收）

- **P0**：画一笔 → `extract pixels` 非空 + 包围盒正确。
- **P1**：连续 5000 dab，stage 子节点数**不随笔数增长**；橡皮在透明背景上 extract 得到 `alpha=0`；undo / redo 后像素与基准一致。
- **P2**：一帧内多 dab 合并为**一次** texture 上传（计数器断言）；撤销只触达脏 tile；大画布内存平稳。
- **P3**：同一组输入点回放，像素稳定（确定性回归）。

## 性能基准

作为 P1 / P2 的硬指标，持续监控：

- dab / s（吞吐）
- dirty tile 上传次数 / 帧
- 长会话内存曲线（不应随笔数单调上升）

## 测试地基现状

仓库刚删掉 `test/basic.test.ts`，需在 [P0](./roadmap#p0-pixi-v8-迁移-测试地基前置必做) 重建 `test/`，作为后续所有阶段的验收载体。

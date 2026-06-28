---
title: P1-09 · 验收：架构分水岭三断言 + 冒烟
---

# P1-09 · P1 验收：分水岭三断言 + demo 冒烟（M2 出口）

- **Phase / ID**: P1 / P1-09
- **Depends on**: P1-08、P0-06（测试地基）
- **Files**: `test/`、`examples/*`
- **Effort**: M
- **Status**: ✅ M2 出口已达成

## Context

把 [roadmap P1](../roadmap#p1-rasterlayer-rendertexture-后端-真橡皮架构分水岭) 的验收落成自动化测试，作为里程碑 **M2** 出口。复用 P0-06 的 headless 像素地基。

## Steps

1. **节点数不随笔数增长**：程序化画 5000 dab，断言 `canvas.layersContainer.children.length`（或 stage 子节点数）在绘制前后**不变**（图层 sprite 恒定，dab 进 RT）。
2. **真橡皮**：透明背景层上画一笔再擦，`extract.pixels` 断言被擦区域 `alpha == 0`；未擦区域不变。
3. **撤销像素一致**：画一笔，记 `after`；undo 后 `extract` == 画前；redo 后 == `after`（golden / 哈希比对）。
4. **确定性**：同一组输入点跑两次，最终图层像素哈希一致。
5. **demo 冒烟**：`examples/vue` brush/eraser/undo 手测通过；`examples/react` 能画线。
6. 勾掉 [`tasks/index`](./) 的 P1 清单；如发现 P1-05/06 的子区域回写或 premultiplied alpha 有偏差，回写对应卡。

## Acceptance

- [x] 上述 1–4 全部为**自动化测试**且绿（`pnpm test`）。
- [x] `examples/vue` / `examples/react` 冒烟通过。
- [x] `pnpm build`、`typecheck`、`lint` 全绿。
- [x] M2 出口确认：P1 全卡勾掉，demo「能当线稿工具用」。

## Out of scope

- 性能调优（dab/s、批量上传）属 P2 指标。
- 任何 P2+ 功能。

---
title: P9-00 · Public beta release gate
---

# P9-00 · 面向用户发布前的必要功能门槛

- **Phase / ID**: P9-00
- **Depends on**: P6-07、P7-08、P8-04
- **Files**: `docs/guide/`、`site/`、`packages/*/README.md`、release checklist
- **Effort**: M

## Context

P9 不应把首次用户发布卡死在 libmypaint / `.myb` 的完整兼容上。外部 brush engine 是差异化探索；用户发布前真正必须稳定的是：核心绘画闭环、文件安全、回退路径、文档与示例。

## 必需功能（public beta）

1. **绘画闭环**：pen / pencil / marker / airbrush / calligraphy / smudge / watercolor 至少可在同一 UI 切换；压感、stabilizer、触屏单指画 / 双指缩放可用。
2. **图层闭环**：增删 / 排序 / 显隐 / opacity / blend mode / lock alpha / clipping 可用；mask API / 像素路径可作为实验能力存在，但不在默认 UI 中承诺为正式功能。
3. **历史与文件安全**：undo / redo 对普通绘画、橡皮、混色、图层变更可回退；`exportProject()` / `importProject()` round-trip；PNG 导出可用。
4. **性能与内存底线**：默认 tiled backend；长会话不随笔数线性增长；大画布稀疏绘制不分配整图；用户可看到基础诊断或错误提示。
5. **集成体验**：`saier`、`@saier/core`、`@saier/pixi`、`@saier/vue` 的 README / getting started 与 `examples/vue`、`examples/react`、site demo 同步。
6. **兼容与回退**：不支持当前 backend 的 preset 必须禁用或给出清晰错误；实验 / 外部 engine 必须可被隔离，不影响内置笔刷。

## Steps

1. 把上述必需功能拆成 [release checklist](../public-beta-checklist)，区分 **blocking** / **experimental**。
2. 将不稳定或未默认开放的能力（例如 mask UI、外部 WASM engine）在 UI / 文档中标记为 experimental 或隐藏。
3. 跑完整 gate：`pnpm lint`、`pnpm typecheck`、`pnpm test`、`pnpm build`、`pnpm docs:build`。
4. 手动验收 site / examples：新建画布、绘画、图层操作、保存/读取、导出、触屏/压感抽样。

## Acceptance

- [x] release checklist 写入 docs，并和 site 可见能力分离。
- [x] 未稳定能力列为 experimental，不作为默认发版 blocker。
- [x] 完整 gate 被列入 release checklist；真正发版前执行。

## Out of scope

- 完整 PSD 兼容。
- 完整 `.myb` 解析与 libmypaint 行为一致性。
- 多人协作 / 云端同步。

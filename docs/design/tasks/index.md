---
title: Tasks
---

# 任务卡（codex 执行单元）

> [Roadmap](../roadmap) 给出阶段与验收；本目录把阶段**拆成可独立执行、独立验收的任务卡**。
> 一张卡 ≈ 一个聚焦的 PR。codex 一次领一张，做完跑通「验收」再领下一张。

## 卡片约定

每张卡固定字段：

- **Phase / ID**：所属阶段与编号（如 `P0-03`）。
- **Depends on**：前置卡（没有则写 `—`）。
- **Files**：预计触碰的文件（指路，不是硬约束）。
- **Effort**：S（<0.5d）/ M（~1d）/ L（>1d）。
- **Context**：为什么做、背景。
- **Steps**：有序步骤。
- **Acceptance**：可勾选、尽量可自动化的验收项。
- **Out of scope**：明确不在本卡内做的事（防止范围蔓延）。

通用规则（同 [`AGENTS.md`](https://github.com/YunYouJun/pixi-painter/blob/main/AGENTS.md)）：

- 一次只做一张卡；保持 `examples/vue`、`examples/react`、site `/shodo` 可运行。
- 收尾前跑 `pnpm lint` + `pnpm typecheck`。
- 决策与维护者意图冲突 → 先问。
- 非请勿 commit。

## P0 — Pixi v8 迁移 + 测试地基

> 目标：让 `createPainter()` 在 v8 真正跑起来 + 建测试地基。
>
> **现实校正（已验证）**：v8 依赖已就位且 `build:lib` 能过；v7 的 `beginFill` 等在 v8 是 **deprecated 垫片（能跑）**；**唯一阻断运行的是 `Application` async-init**。所以 P0 硬核 = **P0-02 + P0-06**，其余多为可选 / 延后清理。
>
> **✅ 已完成（M1 达成）**：P0-02 + P0-04 迁 v8 并验证；P0-05 extract API v8 兼容；P0-06 测试地基（`pnpm test` vitest 5 + `pnpm test:e2e` examples/site）；P0-07 examples/vue · site · react 均在 v8 跑通。P0-03（brush/eraser Graphics）按设计**跳过**——P1 用 raster 引擎删除这两文件。

| ID                                               | 卡片                                             | 状态               | Depends on | Effort |
| ------------------------------------------------ | ------------------------------------------------ | ------------------ | ---------- | ------ |
| [P0-01](./P0-01-audit-and-pin-pixi)              | 盘点并分类 v7 风格调用（🔴/🟡/⚪）               | 建议先做           | —          | S      |
| [P0-02](./P0-02-application-bootstrap-v8)        | **Application async-init 修复（唯一运行阻断）**  | 🔴 必做            | P0-01      | M      |
| [P0-03](./P0-03-graphics-brush-eraser-v8)        | Graphics：brush + eraser                         | ⚪ 可选（P1 会删） | P0-02      | M      |
| [P0-04](./P0-04-graphics-canvas-board-layers-v8) | Graphics / `name→label`：canvas + board + layers | 🟡 可延后清理      | P0-02      | M      |
| [P0-05](./P0-05-extract-export-v8)               | extract / 导出 API 核对                          | 🟡 低优先          | P0-02      | S      |
| [P0-06](./P0-06-test-foundation)                 | 测试地基（vitest + headless 像素断言）           | 🔴 必做            | P0-02      | M      |
| [P0-07](./P0-07-verify-examples-and-demos)       | 回归：examples + demo 冒烟                       | 必做               | P0-02, 06  | S      |

**P0 出口（里程碑 M1）✅ 已达成**：`build:lib` / `build:react` / `typecheck` / `test`(vitest 5) / `test:e2e`(examples + site) 全绿；examples/vue · site · react 均在 v8 运行。

## P1 — RasterLayer + RenderTexture 后端 + 真橡皮（架构分水岭）

> 目标：笔迹从「Graphics 累加」→「戳印进图层 `RenderTexture`」；引入栅格图层、真橡皮、bbox 区域撤销。落两个新包 `@saier/core`（**无 Pixi**）+ `@saier/pixi`。
>
> 依赖链：`01 → 02 →（03,04,07）`；`05 → 06`（pixi 侧）；`08` 汇合 03/04/05/06/07；`09` 验收。**core 侧（02/03/04/07）纯 TS，可与 pixi 侧（05/06）并行。**

| ID                                           | 卡片                                  | 包           | Depends on     | Effort |
| -------------------------------------------- | ------------------------------------- | ------------ | -------------- | ------ |
| [P1-01](./P1-01-scaffold-packages)           | 脚手架 core + pixi 两包               | both         | —              | M      |
| [P1-02](./P1-02-core-contracts-and-geometry) | 核心契约 types + 几何                 | core         | 01             | M      |
| [P1-03](./P1-03-simple-brush-engine)         | SimpleBrushEngine（spacing + 圆 dab） | core         | 02             | M      |
| [P1-04](./P1-04-document-rasterlayer-undo)   | Document / RasterLayer / UndoManager  | core         | 02             | M      |
| [P1-05](./P1-05-rendertexture-backend)       | RenderTextureBackend（normal + 撤销） | pixi         | 02             | L      |
| [P1-06](./P1-06-real-eraser)                 | 真橡皮（erase 合成）                  | pixi         | 05             | M      |
| [P1-07](./P1-07-headless-controller)         | headless controller 表面（D7）        | core         | 04             | S      |
| [P1-08](./P1-08-integrate-pixi-painter)      | 集成进 pixi-painter（切绘画管线）     | pixi-painter | 03,04,05,06,07 | L      |
| [P1-09](./P1-09-verify-watershed)            | 验收：分水岭三断言 + 冒烟             | test         | 08             | M      |

**P1 出口（里程碑 M2）**：5000 dab 节点数不增长 + 真橡皮 `alpha=0` + undo 像素一致，三断言**自动化**通过；demo「能当线稿工具用」。

## P2 — TiledSurface + tile undo（条件性）

> 目标：图层像素从「一张 RenderTexture」→「256×256 CPU tile」；绘制改 **CPU 光栅化**（为 P7 混色铺路）；撤销改 tile patch；脏 tile 每帧批量上传。**[D1](../decisions#d1) 下 P2 是条件性的**——RenderTexture（P1）够用就先不做，要做大画布 / 混色 / 低内存撤销时再上。
>
> 依赖链：core 侧 `01 → 02`、`01 + P1-04 → 03`；pixi 侧 `01 + P1-05 → 04 → 05`；`06` 切换 + 验收。

| ID                                   | 卡片                                | 包           | Depends on   | Effort |
| ------------------------------------ | ----------------------------------- | ------------ | ------------ | ------ |
| [P2-01](./P2-01-tiled-surface)       | TiledSurface / Tile / dirty 模型    | core         | P1-02        | M      |
| [P2-02](./P2-02-cpu-dab-rasterizer)  | CPU dab 光栅器（AA + 累积 + erase） | core         | P2-01        | L      |
| [P2-03](./P2-03-tile-undo)           | tile 撤销（TilePatch）              | core         | P2-01, P1-04 | M      |
| [P2-04](./P2-04-pixi-tile-backend)   | PixiTileTextureBackend（显示）      | pixi         | P2-01, P1-05 | L      |
| [P2-05](./P2-05-batched-tile-upload) | 脏 tile 批量上传（rAF）             | pixi         | P2-04        | M      |
| [P2-06](./P2-06-switch-and-verify)   | 切后端 + 大画布 / 内存验收          | pixi-painter | P2-03,04,05  | M      |

**P2 出口（里程碑 M3 起步）**：tile 后端下 P1 三断言 parity；4096² 内存平稳；撤销只触脏 tile；每帧合并上传。

## P3 — 输入质感：跟手（可与 P1 / P2 并行）

> 目标：让线条「跟手、顺、压感舒服」——这类工具的灵魂。core 侧输入层 + 收割 shodo。**可与 P1/P2 并行**，建议[提前 spike](./P3-06-feel-verification) 在现有管线先验手感。
>
> 依赖链：`01 → 02`、`01 + P1-03 → 03`；`02,03 → 04`；`05` 触屏（并行）；`06` 验收。

| ID                                         | 卡片                                       | 包   | Depends on  | Effort |
| ------------------------------------------ | ------------------------------------------ | ---- | ----------- | ------ |
| [P3-01](./P3-01-pointer-sampler)           | PointerSampler + coalesced + 压感归一      | core | P1-02       | M      |
| [P3-02](./P3-02-stabilizer)                | Stabilizer（moving avg → exp → lazy/rope） | core | P3-01       | M      |
| [P3-03](./P3-03-pressure-dynamics)         | PressureCurve + 动态（size/opacity/taper） | core | P1-03       | M      |
| [P3-04](./P3-04-harvest-shodo-calligraphy) | 收割 shodo → CalligraphyEngine             | core | P3-02,03    | M      |
| [P3-05](./P3-05-touch-gestures)            | 触屏 / 手势（双指缩放 vs 单指画）          | pixi | viewport    | M      |
| [P3-06](./P3-06-feel-verification)         | 跟手验收：确定性回放 + 延迟 + 基准         | test | P3-02,03,04 | M      |

**P3 出口**：stabilizer 四档可量化区分；慢速圆无抖；确定性回放像素一致；触屏单指画 / 双指缩放分得清；真机手感留档。

## P4 — 笔刷家族

> 目标：≥4 种笔刷（pen / pencil / marker / airbrush）+ shodo 毛笔，统一 `BrushEngine` 接口、统一 UI 切换。建立在 P1-03 引擎 + P3-03 动态之上。

| ID                                   | 卡片                          | 包        | Depends on   | Effort |
| ------------------------------------ | ----------------------------- | --------- | ------------ | ------ |
| [P4-01](./P4-01-brush-preset-model)  | BrushPreset 模型 + 注册表     | core      | P1-03, P3-03 | M      |
| [P4-02](./P4-02-tip-stamp-system)    | 笔尖 / 戳印系统（两后端渲染） | core+pixi | P1-05, P2-02 | M      |
| [P4-03](./P4-03-pen-pencil-marker)   | pen / pencil / marker 预设    | core      | P4-01,02     | M      |
| [P4-04](./P4-04-airbrush)            | airbrush（时间累积流量）      | core      | P4-01,02     | M      |
| [P4-05](./P4-05-brush-ui)            | 笔刷 UI（预设切换 + 参数）    | vue       | P1-07, P4-01 | M      |
| [P4-06](./P4-06-verify-brush-family) | 笔刷家族验收                  | test      | P4-03,04,05  | S      |

**P4 出口**：≥4 笔刷 UI 可切；airbrush 停驻累积、marker 单笔不发黑；golden 通过。

## 后续阶段（P5+）

P5–P9 的任务卡按需续写（`P5-01-*.md` …），参照同一格式与依赖链。优先级与取舍见 [Roadmap](../roadmap) 与 [Risks](../roadmap#risks)。

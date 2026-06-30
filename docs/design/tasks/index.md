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

通用规则（同 [`AGENTS.md`](https://github.com/YunYouJun/saier/blob/main/AGENTS.md)）：

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
>
> **✅ 已完成（M2 达成）**：P1-01 脚手架；P1-02 核心契约；P1-03 `SimpleBrushEngine`；P1-04 `Document` / `RasterLayer` / `UndoManager`；P1-05 `RenderTextureBackend` normal + bbox undo；P1-06 真橡皮；P1-07 headless controller；P1-08 `pixi-painter` 绘画管线集成；P1-09 分水岭自动化验收 + examples/site 冒烟。

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

**P1 出口（里程碑 M2）✅ 已达成**：5000 dab 节点数不增长 + 真橡皮 `alpha=0` + undo 像素一致 + deterministic pixels，分水岭断言**自动化**通过；demo 构建 / e2e 冒烟通过。

## P2 — TiledSurface + tile undo（条件性）

> 目标：图层像素从「一张 RenderTexture」→「256×256 CPU tile」；绘制改 **CPU 光栅化**（为 P7 混色铺路）；撤销改 tile patch；脏 tile 每帧批量上传。**[D1](../decisions#d1) 下 P2 是条件性的**——RenderTexture（P1）够用就先不做，要做大画布 / 混色 / 低内存撤销时再上。
>
> 依赖链：core 侧 `01 → 02`、`01 + P1-04 → 03`；pixi 侧 `01 + P1-05 → 04 → 05`；`06` 切换 + 验收。
>
> **✅ 已完成（M3 起步达成）**：P2-01 `TiledSurface` / `Tile` / dirty 模型；P2-02 CPU dab 光栅器；P2-03 `TilePatch` undo / redo；P2-04 `PixiTileTextureBackend`；P2-05 dirty tile rAF 合并上传；P2-06 `pixi-painter` 可选 tile 后端 + parity / 4096² 稀疏验收。

| ID                                   | 卡片                                | 包           | Depends on   | Effort |
| ------------------------------------ | ----------------------------------- | ------------ | ------------ | ------ |
| [P2-01](./P2-01-tiled-surface)       | TiledSurface / Tile / dirty 模型    | core         | P1-02        | M      |
| [P2-02](./P2-02-cpu-dab-rasterizer)  | CPU dab 光栅器（AA + 累积 + erase） | core         | P2-01        | L      |
| [P2-03](./P2-03-tile-undo)           | tile 撤销（TilePatch）              | core         | P2-01, P1-04 | M      |
| [P2-04](./P2-04-pixi-tile-backend)   | PixiTileTextureBackend（显示）      | pixi         | P2-01, P1-05 | L      |
| [P2-05](./P2-05-batched-tile-upload) | 脏 tile 批量上传（rAF）             | pixi         | P2-04        | M      |
| [P2-06](./P2-06-switch-and-verify)   | 切后端 + 大画布 / 内存验收          | pixi-painter | P2-03,04,05  | M      |

**P2 出口（里程碑 M3 起步）✅ 已达成**：tile 后端下 P1 三断言 parity；4096² 稀疏 tile 验收通过；撤销只触脏 tile；每帧合并上传。

## P3 — 输入质感：跟手（可与 P1 / P2 并行）

> 目标：让线条「跟手、顺、压感舒服」——这类工具的灵魂。core 侧输入层 + 收割 shodo。**可与 P1/P2 并行**，建议[提前 spike](./P3-06-feel-verification) 在现有管线先验手感。
>
> 依赖链：`01 → 02`、`01 + P1-03 → 03`；`02,03 → 04`；`05` 触屏（并行）；`06` 验收。
>
> **✅ 已完成**：P3-01 coalesced `PointerSampler`；P3-02 四档 `Stabilizer`；P3-03 pressure curves / velocity fallback / taper；P3-04 `CalligraphyEngine` + shodo 格式草案 + `/shodo` demo bridge；P3-05 touch gesture router；P3-06 确定性回放 / 平滑度 / 延迟边界自动化验收。

| ID                                         | 卡片                                       | 包   | Depends on  | Effort |
| ------------------------------------------ | ------------------------------------------ | ---- | ----------- | ------ |
| [P3-01](./P3-01-pointer-sampler)           | PointerSampler + coalesced + 压感归一      | core | P1-02       | M      |
| [P3-02](./P3-02-stabilizer)                | Stabilizer（moving avg → exp → lazy/rope） | core | P3-01       | M      |
| [P3-03](./P3-03-pressure-dynamics)         | PressureCurve + 动态（size/opacity/taper） | core | P1-03       | M      |
| [P3-04](./P3-04-harvest-shodo-calligraphy) | 收割 shodo → CalligraphyEngine             | core | P3-02,03    | M      |
| [P3-05](./P3-05-touch-gestures)            | 触屏 / 手势（双指缩放 vs 单指画）          | pixi | viewport    | M      |
| [P3-06](./P3-06-feel-verification)         | 跟手验收：确定性回放 + 延迟 + 基准         | test | P3-02,03,04 | M      |

**P3 出口 ✅ 已达成**：stabilizer 四档可量化区分；慢速圆无抖；确定性回放像素一致；触屏单指画 / 双指缩放分得清；真机手感留档当前以自动化 touch/pen routing + demo 冒烟替代实体设备手测。

## P4 — 笔刷家族

> 目标：≥4 种笔刷（pen / pencil / marker / airbrush）+ shodo 毛笔，统一 `BrushEngine` 接口、统一 UI 切换。建立在 P1-03 引擎 + P3-03 动态之上。
>
> **✅ 已完成**：`BrushPreset` / registry / factory；tip stamp 系统；pen / pencil / marker / airbrush / calligraphy 默认集；airbrush time tick；marker 单笔 max-alpha；Vue preset picker + 参数面板；core + RT 后端行为验收。

| ID                                   | 卡片                          | 包           | Depends on   | Effort |
| ------------------------------------ | ----------------------------- | ------------ | ------------ | ------ |
| [P4-01](./P4-01-brush-preset-model)  | BrushPreset 模型 + 注册表     | ✅ core      | P1-03, P3-03 | M      |
| [P4-02](./P4-02-tip-stamp-system)    | 笔尖 / 戳印系统（两后端渲染） | ✅ core+pixi | P1-05, P2-02 | M      |
| [P4-03](./P4-03-pen-pencil-marker)   | pen / pencil / marker 预设    | ✅ core      | P4-01,02     | M      |
| [P4-04](./P4-04-airbrush)            | airbrush（时间累积流量）      | ✅ core      | P4-01,02     | M      |
| [P4-05](./P4-05-brush-ui)            | 笔刷 UI（预设切换 + 参数）    | ✅ vue       | P1-07, P4-01 | M      |
| [P4-06](./P4-06-verify-brush-family) | 笔刷家族验收                  | ✅ test      | P4-03,04,05  | S      |

**P4 出口 ✅ 已达成**：≥4 笔刷 UI 可切；airbrush 停驻累积、marker 单笔不发黑；golden / 像素行为断言通过。

## P5 — 图层栈能力

> 目标：`Document.layers` 成为图层 UI 与 Pixi 显示的事实来源；支持普通 RasterLayer 的增删、排序、显隐、opacity、blend mode、缩略图，并完成 Vue bootstrap 去重。

| ID                                       | 卡片                          | 包           | Depends on | Effort |
| ---------------------------------------- | ----------------------------- | ------------ | ---------- | ------ |
| [P5-01](./P5-01-layer-stack-controller)  | 图层栈模型与 controller 命令  | core         | P1-04,07   | M      |
| [P5-02](./P5-02-pixi-layer-display-sync) | Pixi 图层显示状态同步         | core+pixi    | P5-01      | M      |
| [P5-03](./P5-03-layer-panel-ui)          | Vue 图层面板                  | vue          | P5-01,02   | M      |
| [P5-04](./P5-04-use-painter-composable)  | 共享 `usePainter()` bootstrap | vue+examples | P5-01,02   | M      |
| [P5-05](./P5-05-verify-layer-stack)      | 图层栈验收                    | test         | P5-01..04  | S      |

**P5 出口 ✅ 已达成**：图层面板增删 / 排序 / 改透明度即时反映；导出合成结果正确；UI 不再直接引用 `PainterBrush.*` 静态字段；`examples/vue` 与 `site` 共用同一 `usePainter()`。

## P6 — 锁透明 / 剪贴 / 蒙版 / 带 transform 图层绘画

> 目标：把图层从「显隐 + opacity + blend」升级到专业绘画手感——锁透明、剪贴图层、图层蒙版，并补齐 [interfaces.md 第 3 点](../interfaces#坐标与变换正确性)推迟的**带 transform 图层逆变换绘画**（硬骨头）。四能力先在 [P6-01](./P6-01-layer-attributes-model) 落模型，再分别落像素 / 显示，最后 UI + 验收。
>
> 依赖链：`01 →（02,03,04,05）`；`04` 复用 `02` 的合成；`06` 汇合 01..05 的 UI；`07` 验收。**core 侧（02/04/05 的算法）与 pixi 显示侧可部分并行。**
>
> **进度**：✅ P6-01 图层属性模型 · ✅ P6-02 锁透明(两后端 parity) · ✅ P6-03 剪贴(RT,extract 安全派生遮罩) · ✅ P6-05 变换绘画(≤1.5px) · ✅ P6-06 UI(锁/剪贴开关) · ✅ P6-07 验收(已发布功能)。🚧 **P6-04 蒙版**:像素存储 / 绘画重定向 / undo 通,但**显示重算撞 Pixi v8 RenderTexture 同帧采样墙**,已脚手架 + WIP 标记,蒙版显示 + UI 延后。

| ID                                          | 卡片                                                | 包        | Depends on          | Effort |
| ------------------------------------------- | --------------------------------------------------- | --------- | ------------------- | ------ |
| [P6-01](./P6-01-layer-attributes-model)     | 图层属性模型 + controller（锁/剪贴/蒙版/transform） | core      | P1-04, P5-01        | M      |
| [P6-02](./P6-02-lock-alpha)                 | 锁透明合成（两后端）                                | core+pixi | P6-01, P1-05, P2-02 | L      |
| [P6-03](./P6-03-clipping-layers)            | 剪贴图层（显示 + 导出）                             | pixi      | P6-01, P5-02        | M      |
| [P6-04](./P6-04-layer-mask)                 | 图层蒙版（独立 raster + 目标切换）                  | core+pixi | P6-01, P6-02, P5-02 | L      |
| [P6-05](./P6-05-transformed-layer-painting) | 带 transform 图层绘画（逆变换落点）                 | core+pixi | P6-01, P1-02, P3-01 | L      |
| [P6-06](./P6-06-layer-panel-ui)             | 图层面板 UI（锁/剪贴/蒙版）                         | vue       | P6-01..05, P5-03    | M      |
| [P6-07](./P6-07-verify-layer-features)      | P6 验收                                             | test      | P6-02..06           | S      |

**P6 出口（里程碑 M4 起步）目标**：锁透明只改已有像素不扩边；剪贴层只在下层不透明区显示、导出 = 屏显；蒙版可画黑遮蔽 / 画白露出且独立 undo；缩放 / 旋转图层上落点准确（≤ 1px）。

## P7 — 绘画的灵魂：混色 / smudge / 水彩（里程碑 M4）

> 目标：让笔刷会**取色、混色、晕染**——smudge 拖色、两色自然过渡、水彩湿边 / 纸纹可开关。Roadmap P7：「先 stamp brush（笔尖 mask + spacing + opacity accumulation + blend kernel），再做取色混合」。
>
> **已定的两条地基决策**（据 Krita / MyPaint / SAI 工业实践）：取色 = **读回画布像素**，CPU `TiledSurface.readRegion` 廉价、GPU 无廉价读回 → 混色在 CPU tile 上逐 dab 读-改-写（[D10](../decisions#d10)）；**tile 升为默认绘画后端**、CPU tile = 像素真相 / GPU 仅显示（[D11](../decisions#d11) 方案 A）。这引入地基卡 [P7-00](./P7-00-tile-default-backend)——切默认后端 + 把 P6 剪贴 / 蒙版显示移植到 tile。
>
> 依赖链：`00`（地基）∥ `01`（模型）先行；`01 →（02,03）`；`02,03 → 04`；`04 → 05`；`02 → 06`；UI `07` 接 00,04；验收 `08` 汇合 00,04..07。先做核心切片 **00 → 01 → 02 → 03 → 04 → 08**（tile 默认 + smudge 拖色即「能用」），水彩 / 纸纹 / UI（05/06/07）为可增量后补。
>
> **进度（2026-06-30）**：✅ P7-00 tile 默认 + P6 显示移植 · ✅ P7-01 参数模型 · ✅ P7-02 density/dilution 沉积 · ✅ P7-03 `sampleRegion` 读回 · ✅ P7-04 smudge 引擎 + 逐 dab 交错 · ✅ P7-05 湿边 / 水彩近似 · ✅ P7-06 纸纹 · ✅ P7-07 预设 + Vue UI · ✅ P7-08 完整验收（拖色 / 过渡 / 湿边 / 纸纹 / undo-redo / 确定性 / 后端门控）。

| ID                                           | 卡片                                     | 包         | Depends on          | Effort |
| -------------------------------------------- | ---------------------------------------- | ---------- | ------------------- | ------ |
| [P7-00](./P7-00-tile-default-backend)        | **地基**：tile 默认后端 + P6 显示移植    | pixi+saier | P2-06, P6-03, P6-04 | L      |
| [P7-01](./P7-01-mixing-model)                | 混色 / 沉积模型（types + preset + ctrl） | core       | P4-01, P2-02        | M      |
| [P7-02](./P7-02-stamp-deposit-kernel)        | stamp 沉积内核（density/dilution/边缘）  | core       | P7-01, P2-02        | L      |
| [P7-03](./P7-03-surface-sampler)             | 表面取色采样（`sampleRegion`，[D10]）    | core+pixi  | P7-01, P2-01        | M      |
| [P7-04](./P7-04-smudge-engine)               | smudge 引擎（取色 + persistence + 自色） | core       | P7-02, P7-03        | L      |
| [P7-05](./P7-05-watercolor-dilution-wetedge) | 水彩：稀释 + 湿边（wet edge）            | core       | P7-02, P7-04        | L      |
| [P7-06](./P7-06-paper-texture)               | 纸纹（paper texture）调制                | core       | P7-02               | M      |
| [P7-07](./P7-07-presets-and-ui)              | 混色预设 + Vue UI（tile 默认，无需切换） | vue+saier  | P7-00, P7-04, P4-05 | M      |
| [P7-08](./P7-08-verify-mixing)               | P7 验收（拖色/过渡/湿边/纸纹/确定性）    | test       | P7-04..07           | M      |

**P7 出口（里程碑 M4）目标**：smudge 能拖动已有颜色；两色交界自然过渡；湿边 / 纸纹可开关；混色描边可 undo / redo；同输入确定性像素一致。

## P8 — 文件 / 序列化（里程碑 M5）

> 目标：工程文件保存 / 读取还原图层；笔迹以 `{X,Y,T,P}` + 操作流格式可存储并确定性回放。PSD 导出是 Roadmap P8 的可选项，不阻塞本阶段验收。
>
> **进度（2026-06-30）**：✅ P8-01 `saier.project` v1 schema（Document + sparse tile surfaces）· ✅ P8-02 `Painter.exportProject()` / `importProject()` tiled backend API · ✅ P8-03 shodo stroke record + replay · ✅ P8-04 Node + browser 验收。

| ID                                     | 卡片                                       | 包    | Depends on       | Effort |
| -------------------------------------- | ------------------------------------------ | ----- | ---------------- | ------ |
| [P8-01](./P8-01-project-format-schema) | 工程文件格式（Document + tile surfaces）   | core  | P2-01, P5-01, P7 | M      |
| [P8-02](./P8-02-saier-project-api)     | saier 工程导出 / 导入 API                  | saier | P8-01, P7-00     | M      |
| [P8-03](./P8-03-stroke-replay-format)  | 笔迹回放格式（shodo `{X,Y,T,P}` 收割）     | core  | P3-04, P7-08     | M      |
| [P8-04](./P8-04-verify-files)          | P8 验收（工程 round-trip / replay pixels） | test  | P8-01..03        | M      |

**P8 出口（里程碑 M5 核心）目标**：保存 → 读取还原图层；同一笔迹回放像素一致。

## 后续阶段（P9+）

P9 的任务卡按需续写（`P9-01-*.md` …），参照同一格式与依赖链。优先级与取舍见 [Roadmap](../roadmap) 与 [Risks](../roadmap#risks)。

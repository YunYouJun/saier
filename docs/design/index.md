---
title: Design Overview
---

# 设计总览：从「Graphics 画板」到「优雅的在线绘画运行时（saier）」

> 本节（`/design/`）是 **saier**（体验优雅的在线绘画运行时）架构演进的**单一事实来源（source of truth）**，
> 写给人类维护者与执行 Agent（codex / Claude）阅读和执行。
>
> - 想知道**为什么这么改**、**现状如何** → 看本页。
> - 想知道**按什么顺序做** → 看 [Roadmap](./roadmap)。
> - 想知道**接口契约** → 看 [Core Interfaces](./interfaces)。
> - 想知道**关键取舍** → 看 [Decisions](./decisions)。
> - 想知道**怎么验收** → 看 [Testing & Determinism](./testing)。
> - 想知道**笔迹录制 / 回放怎么做** → 看 [Stroke Recording](./stroke-recording)。
> - 想知道**云端房间协作怎么做** → 看 [Cloud Rooms](./cloud-rooms)。
> - 想知道**YunLeFun 测试账号怎么建、怎么标记、怎么清理** → 看 [YunLeFun Test Accounts](./test-accounts)。

## 给执行 Agent 的使用约定

- 这是一份**多阶段重构计划**，不是一次性任务。一次只做一个阶段（P-x），跑通验收标准再进入下一个。
- 重构期间**保持现有 demo 可运行**（`examples/vue`、`examples/react`、`site` 的 `/shodo` 页）。每个阶段结束后 demo 不能比上一阶段更差。
- 不确定的架构决策见 [Decisions](./decisions)，与维护者意见冲突时**先问再写**。
- 术语：**document space** = 画布文档像素坐标（与缩放 / 旋转无关）；**screen space** = 屏幕 / stage 坐标。**所有笔刷运算一律在 document space。**

## 现状诊断（基于当前代码，逐文件核对）

| 维度       | 现状                                                                                                                               | 文件                                           | 问题                                                                                                                                     |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 笔迹模型   | 每一笔 = 一个 `Graphics`，`pointerDown` new、`pointerMove` 里 `drawCircle`+`lineTo` 累加                                           | `packages/pixi-painter/src/brush/index.ts`     | scene graph 随笔数膨胀；无法做像素累积 / 混色 / 湿边                                                                                     |
| 图层       | 笔迹**平铺**进单个 `layersContainer`；`EditableLayer` 只是导入图片的变换手柄，不是绘画图层                                         | `canvas/index.ts`、`layers/index.ts`           | 没有真正的栅格图层栈（opacity / 锁透明 / 蒙版 / 剪贴都无处落脚）                                                                         |
| 橡皮       | 画白色圆 `0xFFFFFF`，**不是真擦除**（`BLEND_MODES.ERASE` 被注释掉）                                                                | `eraser/index.ts`                              | 透明 / 有色背景下表现错误                                                                                                                |
| 撤销       | action 回调式，brush 的 undo = `graphics.visible = false`                                                                          | `features/history.ts`、`brush/index.ts`        | 撤销的 Graphics 永不释放（长会话内存增长）；无法自然处理 fill / filter / transform                                                       |
| 输入       | 直接用 `event.pressure * size`，无曲线、无 stabilizer、无 coalesced events                                                         | `brush/index.ts`                               | 不跟手；鼠标 pressure=0.5 未特判                                                                                                         |
| 视图层     | board 平移、滚轮缩放、mask 裁剪、boundingBox、brush cursor **已完善**                                                              | `board/index.ts`、`canvas/index.ts`            | ✅ 这是要**保留**的 Pixi 显示层                                                                                                          |
| Pixi 版本  | `node_modules` 实装 **8.19.0**，但 `pixi-painter/src` 全是 **v7 API**（`new Application({view})`、`Graphics.beginFill/lineStyle`） | `painter.ts`                                   | ⚠️ **迁移债**：当前核心代码在 v8 下跑不起来，必须先迁移                                                                                  |
| `shodo` 包 | 已有**戳印式 stroke engine**：velocity→笔锋粗细、4 点滑动平均（≈stabilizer）、加速度出锋 taper、可序列化回放格式                   | `packages/shodo/src/{stroke-engine,tablet}.ts` | 从 tiny.js 移植未改完（残留 `new Tiny.Sprite`）；仍是「每 dab 一个 Sprite」= 同样的 scene-graph 爆炸。**应收割其算法，而非当 demo 扔着** |

**结论**：「每一笔一个 `Graphics`」不可持续。要迁移到 **raster / tile 模型**，让 Pixi 退居显示与交互层。

## 对原始建议的 5 点修正

原始建议方向正确（raster 化、Pixi 退居显示层），但有 5 处需要补强，这是本设计方案的增量价值：

1. **先迁移 Pixi v8，再谈 raster**。当前是 v7 代码 + v8 依赖，且 raster 方案依赖的 `ImageSource / CanvasSource / BufferImageSource`、新 `RenderTexture`、WebGPU 都在 v8。v8 迁移是 **P0 前置**，不是可选项。
2. **RenderTexture 先行，Tile 后置**。第一个里程碑用「**每图层一张 RenderTexture + 戳印渲染**」即可一次解决 Graphics 爆炸、真橡皮、笔迹累积、真图层四件事；undo 用**笔迹包围盒区域快照**（不是全画布快照）。**只有当真要做 smudge / 大画布 / 低内存撤销时再引入 tile**。两者共用同一套 `BrushEngine` 与 `SurfaceBackend` 抽象——backend 从第一天就可替换，所以不是返工。见 [Decisions · D1](./decisions#d1)。
3. **收割 `shodo`**。`stroke-engine.ts` 的速度→粗细曲线、滑动平均 stabilizer、出锋 taper，以及 `tablet.ts` 的可序列化笔迹格式，直接喂给 core 的输入层、`BrushEngine` 与未来的工程文件格式。
4. **坐标 / 变换正确性单列为硬骨头**。pointer → 图层像素空间，在 board 缩放 / 旋转 / 平移 + 图层自身 transform 叠加下极易出错，必须在 core 输入层一次性收口。见 [Interfaces · 坐标与变换](./interfaces#坐标与变换正确性)。
5. **确定性 + 测试策略**。raster 引擎可做 golden-image / 像素哈希测试；笔刷运算一律 document space、与缩放解耦，保证可复现。仓库刚删掉 `test/basic.test.ts`，需重建测试地基。见 [Testing](./testing)。

## 目标定位

不是 “A PixiJS brush library”，而是：

> **saier —— 一个体验优雅的在线绘画运行时（web painting runtime）。** Pixi 负责显示与交互；绘画数据 / 笔刷 / 图层 / 撤销放进可脱离 Pixi 的 raster engine。

定位**不是复刻单一软件**，而是融合多家之长、把「画意手感」搬到 web 上——SAI 只是参考之一：

| 参考来源               | 借鉴                              | 落到                       |
| ---------------------- | --------------------------------- | -------------------------- |
| **SAI**                | 跟手 / stabilizer、压感手感、轻量 | P3 输入                    |
| **Procreate**          | 手势、笔刷工作室、克制优雅的 UI   | P4 / P5 / D7               |
| **Krita / MyPaint**    | 笔刷引擎、混色 / smudge、`.myb`   | P4 / P7 / P9               |
| **Photoshop**          | 图层栈、混合模式、蒙版 / 剪贴     | P5 / P6                    |
| **tldraw / Concepts**  | 无限画布、矢量 overlay、顺滑      | viewport / overlay（已有） |
| **Procreate / Fresco** | 水彩 / 湿画                       | P7                         |

差异化护城河 = **画意手感**（raster 笔刷质感 + 跟手）——正是这次 raster 引擎重构的意义。在线画板虽挤（Excalidraw / tldraw / Photopea …），但它们多偏**矢量 / 协作**，绘画手感是空位。

## 目标包结构

```
packages/
  core/            # ★ 与 Pixi 无关，纯 TS，可单测
    input/                 # PointerSampler, PressureCurve, Stabilizer, coalesced events
    brush/                 # BrushEngine 接口 + SimpleBrushEngine + (收割 shodo) CalligraphyEngine
    surface/               # SurfaceBackend 接口, DirtyRect, (P2) TiledSurface/Tile
    document/              # Document, RasterLayer, LayerGroup, Mask, Selection, UndoManager
    format/                # 笔迹录制 / 回放（saier.stroke-log）, 工程文件
    math/                  # 坐标变换、包围盒

  pixi/            # ★ core <-> Pixi 的唯一桥
    PixiViewport           # 复用现有 board/canvas 的 pan/zoom/rotate
    PixiLayerRenderer      # RasterLayer -> Sprite/Texture
    RenderTextureBackend   # P1：SurfaceBackend 的 Pixi RenderTexture 实现
    PixiTileTextureBackend # P2：SurfaceBackend 的 tile 实现
    PixiCursorOverlay      # 复用现有 brush.circle
    PixiSelectionOverlay   # 复用现有 boundingBoxes

  saier/                   # umbrella runtime：默认装配 core + pixi + 兼容 API
  vue/                     # @saier/vue：Vue UI 面板（纯 DOM；绑定到 core controller）
  shodo/                   # @saier/shodo：CalligraphyEngine 的实验场 / 算法来源
```

::: tip 兼容性策略
`pixi-painter` 是历史 npm 包名。正式发布时保留为 deprecated compatibility alias，主包与文档统一使用 `saier` / `@saier/*`。
:::

## UI / 交互分层

「UI 面板交给框架」是对的，但要切清三层（详见 [Decisions · D7](./decisions#d7)）：

- **面板 / chrome**（工具栏、图层列表、笔刷滑块、取色器）→ **Vue / DOM**（`@saier/vue`）。
- **画布内 overlay**（笔刷光标、选区、变换手柄）→ **pixi**（Pixi，随缩放变换、逐帧重绘）。
- **落笔输入热路径**（`pointermove → dab`）+ **状态事实来源** → **core**（headless controller）。Vue 只做薄皮镜像，不持有事实来源。

下一步 → [Roadmap (P0–P13)](./roadmap)

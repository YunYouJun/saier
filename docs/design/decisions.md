---
title: Decisions (ADR)
---

# 关键架构决策（ADR）

> 这些是会影响多个阶段、且不易回退的取舍。与维护者既有计划冲突时，**先确认再动手**。

## 决策速查

| #   | 决策            | 推荐                                                                            | 备选 / 触发切换的条件                                     |
| --- | --------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------- |
| D1  | 显示 / 存储后端 | **P1 用每图层 RenderTexture；P2 再上 256×256 tile**                             | 若一开始就要 20k×20k 画布 / smudge，则直接上 tile（更重） |
| D2  | 笔刷运算坐标系  | **一律 document space**，与 zoom / DPR 解耦                                     | 无                                                        |
| D3  | Pixi 版本       | **先迁 v8（WebGL renderer 生产稳定）**                                          | WebGPU 仅作实验开关                                       |
| D4  | 撤销粒度        | P1 笔迹区域快照；**P2 tile before / after patch**                               | 单张全画布快照 = 禁止                                     |
| D5  | backend 可替换  | `SurfaceBackend` 接口从 P1 就抽象出来                                           | 无（这是不返工的关键）                                    |
| D6  | 输入采集        | Pixi federated event 够用；**另留 DOM `getCoalescedEvents()` 接入点**给极致采样 | 无                                                        |
| D7  | UI 分层         | **面板→Vue/DOM；overlay→pixi；输入+状态→core(headless controller)**             | UI 状态的事实来源禁止搬进框架响应式                       |
| D8  | 品牌 / 包分层   | **品牌 = `saier`；scope 统一 `@saier/*`；可复用 UI 拆包、`site` 只消费**        | 已发布包实际改名（republish）须维护者确认                 |

## D1 — RenderTexture 先行，Tile 后置 {#d1}

**背景**：原始建议直接上 tile surface。tile 是正确的终局（大画布 / 低内存 undo / CPU 混色），但作为**起点**过重。

**决策**：P1 用「每图层一张 RenderTexture + 戳印渲染」，P2 才引入 256×256 tile。

**理由**：

- RenderTexture 方案在现有 Pixi 栈上**增量最小**，却已一次性解决：Graphics 爆炸、真橡皮、笔迹累积、真图层。
- 因为 [`SurfaceBackend`](./interfaces#表面后端-surface-backend) 接口从第一天抽象，换 tile 不返工。
- 让执行 Agent 能更早交付可用线稿工具（M2），降低风险。

**触发改为 tile-first**：若产品目标明确包含 20k×20k 级画布、或一开始就要 smudge / 水彩。→ 这会重排 [P1 / P2](./roadmap) 工作量分配。

## D2 — 笔刷运算一律 document space {#d2}

所有 dab 的位置 / 半径都在文档像素坐标。缩放画布只改显示，不改笔刷的文档尺寸；导出按文档分辨率。这是[确定性测试](./testing)的前提，也避免 DPR / zoom 串味。

## D3 — 先迁 Pixi v8 {#d3}

依赖已是 v8.19 且 `build:lib` 能过。但**运行**仍坏在一处真·breaking：v8 `Application` 是 async-init，`new Application(options)` 只警告、不建 renderer，而当前构造函数同步读 `app.renderer` → throw。（注意：v7 的 `beginFill / drawCircle`、`app.view` 在 v8 是 deprecated 垫片，**能跑、非阻断**——别误以为整个 v7 API 面都坏了。）raster 方案依赖的 `ImageSource / CanvasSource / BufferImageSource`、新 `RenderTexture` 都在 v8。**生产用 WebGL renderer**（稳定），WebGPU 仅作实验开关。所以 [P0](./roadmap#p0-pixi-v8-迁移-测试地基前置必做) 的硬核 = 修 Application init + 测试地基（不是全面 API 迁移）。

## D4 — 撤销粒度：禁止全画布快照 {#d4}

- P1：截取受影响**包围盒**的 before / after 位图（区域快照）。
- P2：tile before / after patch，撤销只恢复脏 tile。
- **禁止**：单张整画布快照做 undo（内存爆炸、长会话不可用）。

## D5 — backend 从第一天就可替换 {#d5}

`SurfaceBackend` 是 core 与 Pixi 之间唯一的像素接口。core 不依赖任何 Pixi 类型（`getDisplayHandle` 返回 `unknown`）。这让未来可以同时支持：

```
Canvas2D backend
Pixi RenderTexture backend   // P1
Pixi tile texture backend    // P2
WebGL framebuffer backend
WebGPU backend
WASM brush backend
```

## D6 — 输入采集双通道 {#d6}

Pixi 的 federated event（带 pressure / tilt / pointerType）作为通用交互路径保留；同时在 DOM 层留 `pointermove` + `getCoalescedEvents()` 接入点，给绘画提供更细粒度的原始点（更平滑曲线）。两者都支持。

## D7 — UI 分层：面板交给框架，画布与状态留在 core {#d7}

**背景**：「UI 面板交互层直接交给 Vue」是对的，但「UI / 交互」常把三件不同的东西混在一起，必须按归属切清。

| 这层是什么                                                    | 归谁                          | 为什么                                                                        |
| ------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| 面板 / chrome：工具栏、图层列表、笔刷滑块、取色器、菜单、弹窗 | **Vue / DOM**（`@saier/vue`） | 排版 / 文本输入 / 无障碍 / 主题，DOM 完胜；用 Pixi 画面板是反模式             |
| 画布内 overlay：笔刷光标、选区蚂蚁线、变换手柄、吸管预览      | **pixi**（Pixi）              | 活在 document / screen 空间，随缩放 / 平移变换、逐帧重绘                      |
| 落笔输入热路径：`pointermove → dab`                           | **core**                      | Vue 响应式 / 事件**绝不能**夹在指针与笔刷引擎之间，否则延迟 + GC 毁掉「跟手」 |

**状态边界**：core 暴露 headless controller（命令式 setter + emitter / 可观察快照），Vue 只做薄皮镜像：

```ts
// core（框架无关）
painter.setTool('brush')
painter.brush.setColor('#f70a8d')
painter.on('brush:change', (snap) => { /* ... */ })

// @saier/vue（Vue 薄皮）
export function usePainter(painter: Painter) {
  const brush = reactive({ size: 10, color: '#000' })
  painter.on('brush:change', s => Object.assign(brush, s)) // core → UI
  watch(() => brush.size, v => painter.brush.setSize(v)) // UI → core
  return { brush }
}
```

**当前需修复的泄漏**（rewrite 时清理，见 [Roadmap P1/P5](./roadmap)）：

- `packages/controls` 的 `PainterControls.vue` 用 `v-model="PainterBrush.color"`、`PainterOptionsBar.vue` 直接写 `PainterBrush.enablePressure` —— UI 在操纵库的**静态内部状态**，应改走 controller API。
- `examples/vue` 的 `usePixiPainter` 直接读 `painter.canvas.container.children` 当图层数据 —— rewrite 后应读 `document.layers`（框架无关模型），而非 Pixi 场景图。

**禁止**：把 UI 状态的**事实来源**搬进框架响应式（Vue ref / React state）。core 保持框架无关（成本≈0，`Painter` 本就是带 emitter 的普通类），这样 Vue 面板与未来的 React `usePainter` 是同一 core 的两张皮。

## D8 — 包分层与命名：UI 是包，不是 `site` 的私产 {#d8}

**背景**：「支持用户直接使用的 UI 都放在 `site` 里吗？」——**不应该**。现在 UI 是散的：可复用组件在 `packages/controls`（Vue），组装好的编辑器散落在 `examples/vue` 与 `site/`，而 `site/` 同时扛「落地页 + 文档 + 交互 demo」。把可用 UI 埋进 `site` 会让它**无法发布、无法复用**。

**决策**：按「库 / 应用 / 展示」三类分层——

- **可发布的库（SDK）**：`@saier/core`（引擎，无 Pixi）、`@saier/pixi`（Pixi 后端）、`@saier/vue`（UI 面板组件）、可选 `@saier/react`。
- **展示 / 应用**：`site`（落地 + 交互 demo，**只消费** `@saier/vue`，不自己定义面板）、`examples/*`（最小集成片段）、`docs`（VitePress 书面文档）。
- 原则：**可复用 UI = 包**；`site` 只组装与展示。一个开箱即用的整装编辑器 = `saier`（umbrella，re-export core + pixi + 默认装配）。

**命名（已决定）**：品牌 = **`saier`**（赛尔，独立开源品牌，与 PaintTool SAI 无关，取刀锋 / 笔锋意象）。scope 统一 `@saier/*`：

| 包             | 角色                                                       | 状态                                                                                   |
| -------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `saier`        | 品牌 / umbrella 整装包（re-export core + pixi + 默认装配） | 由现 `pixi-painter` 迁移（restructure；过渡期保留 `pixi-painter` 作 deprecated alias） |
| `@saier/core`  | 引擎，**无 Pixi**                                          | P1 新建                                                                                |
| `@saier/pixi`  | Pixi 后端（与未来 `@saier/canvas` / `webgpu` 并列）        | P1 新建                                                                                |
| `@saier/vue`   | Vue UI 面板                                                | 由 `@pixi-painter/controls` 迁移                                                       |
| `@saier/shodo` | 书法引擎                                                   | **已改名**（原 `plugin-shado` 拼写错）                                                 |

目录约定 `packages/{core,pixi,vue,shodo,saier}`（dir 与包名后缀一致）。**品牌张力已消解**：核心刻意与 Pixi 无关，而 `saier` 本就不含 pixi，名实相符。

**执行进度**：① shodo 包名**已修** → `@saier/shodo`（安全、零引用）；② 全部设计文档已统一到 `@saier/*` 口径；③ 新包 `@saier/core` / `@saier/pixi` 在 [P1-01](./tasks/P1-01-scaffold-packages) 建包时落地；④ **已发布包的实际改名**（`pixi-painter → saier`、`@pixi-painter/controls → @saier/vue`）涉及 republish + deprecate alias，作为 restructure 步骤、动手前再确认。

**更大的问题（先于命名）**：core / pixi 拆成**独立发布包**还是 `saier` 内部**模块**？拆包 = 发布 / 版本开销，换"core 连 pixi 都 import 不到"的硬隔离 + 可复用；不拆 = 同样纪律靠目录 + lint 边界，省开销、可后续再拆（YAGNI）。鉴于你偏 monorepo 多包风格、且硬隔离对解耦有真实价值，**倾向拆包**——这决定 [P1-01](./tasks/P1-01-scaffold-packages) 的形态。

---

## 明确的非目标 / 暂不做

- 不在早期做 16-bit / float / HDR 管线、不自研 WebGL / WebGPU renderer（满足「放弃 Pixi」条件前不碰）。
- 不把绘制核心搬进 Worker（P7 之后再评估）。
- 不追求 PSD 完整兼容（P8 仅可选导出）。
- 不在 P1 引入 tile（避免过度工程，按 D1）。

### 何时才值得彻底脱离 Pixi、纯原生重写

满足下列多条时再考虑（否则现在纯重写大概率是亏的）：

1. 要做 16-bit / float / HDR 绘画管线；
2. 要完全自定义 GPU blend / compute brush simulation；
3. 要把绘制核心放 Worker、主线程只显示；
4. 要非常大的画布（20k×20k、几十上百图层）；
5. 需要确定性像素输出，不想被 Pixi premultiplied alpha / texture format 影响；
6. 准备长期维护自己的 WebGL / WebGPU renderer。

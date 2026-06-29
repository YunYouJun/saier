---
title: Decisions (ADR)
---

# 关键架构决策（ADR）

> 这些是会影响多个阶段、且不易回退的取舍。与维护者既有计划冲突时，**先确认再动手**。

## 决策速查

| #   | 决策            | 推荐                                                                                  | 备选 / 触发切换的条件                                                   |
| --- | --------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| D1  | 显示 / 存储后端 | **P1 用每图层 RenderTexture；P2 再上 256×256 tile**                                   | 若一开始就要 20k×20k 画布 / smudge，则直接上 tile（更重）               |
| D2  | 笔刷运算坐标系  | **一律 document space**，与 zoom / DPR 解耦                                           | 无                                                                      |
| D3  | Pixi 版本       | **先迁 v8（WebGL renderer 生产稳定）**                                                | WebGPU 仅作实验开关                                                     |
| D4  | 撤销粒度        | P1 笔迹区域快照；**P2 tile before / after patch**                                     | 单张全画布快照 = 禁止                                                   |
| D5  | backend 可替换  | `SurfaceBackend` 接口从 P1 就抽象出来                                                 | 无（这是不返工的关键）                                                  |
| D6  | 输入采集        | Pixi federated event 够用；**另留 DOM `getCoalescedEvents()` 接入点**给极致采样       | 无                                                                      |
| D7  | UI 分层         | **面板→Vue/DOM；overlay→pixi；输入+状态→core(headless controller)**                   | UI 状态的事实来源禁止搬进框架响应式                                     |
| D8  | 品牌 / 包分层   | **品牌 = `saier`；scope 统一 `@saier/*`；可复用 UI 拆包、`site` 只消费**              | 已发布包实际改名（republish）须维护者确认                               |
| D9  | 蒙版语义        | **图层蒙版按灰度亮度（luminance）显隐；剪贴（clip）按下层 alpha**                     | 纯 alpha 蒙版与主流软件相反、无法表达灰阶柔边                           |
| D10 | 取色读回路径    | ✅ **已定**：`SurfaceSampler.sampleRegion` 注入笔刷、CPU tile 原生实现、逐 dab 交错采 | 纯协调器交错为备选（业界均逐 dab 串行）                                 |
| D11 | 混色后端        | ✅ **已定（方案 A）**：**tile 升为默认绘画后端**；CPU tile = 像素真相、GPU 仅显示     | GPU 混色须自研 renderer（见[末尾](#何时才值得彻底脱离-pixi纯原生重写)） |

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

**执行进度**：① shodo 包名**已修** → `@saier/shodo`（安全、零引用）；② 全部设计文档已统一到 `@saier/*` 口径；③ 新包 `@saier/core` / `@saier/pixi` 在 [P1-01](./tasks/P1-01-scaffold-packages) 建包时落地；④ **已发布包的实际改名已完成**：`packages/pixi-painter → packages/saier`（包名 `pixi-painter → saier`）、`packages/controls → packages/vue`（`@pixi-painter/controls → @saier/vue`），全仓引用 / 别名 / CI 发布路径已切换，typecheck·lint·test·build 全绿。**遗留**：npm 上 `pixi-painter` 的 deprecate alias 包仍待在首次 republish 时发布（纯发布期工作）。

**包拆分（已决定）**：**最小拆分 + lockstep 版本**。只拆承重的一刀——`@saier/core`（无 pixi 依赖）⊥ `@saier/pixi`，让**依赖图**强制"核心与 Pixi 解耦"这个命题（比 lint 可靠）；`core` 内再加 ESLint `no-restricted-imports` 禁 `pixi.js` 作双保险。其余不过度拆：`@saier/shodo` 已是包、`@saier/vue` 可晚点独立、`saier`(umbrella) re-export 串起来。全部 **lockstep 一起 bump**（像 `@vue/*`），消掉独立版本负担、可后续再调。→ [P1-01](./tasks/P1-01-scaffold-packages) 维持原样（core + pixi 两包）。

## D9 — 图层蒙版按灰度亮度显隐，剪贴按下层 alpha {#d9}

**决策**：图层蒙版（layer mask, [P6-04](./tasks/P6-04-layer-mask)）的露出系数取蒙版像素的**灰度亮度**（BT.601 加权 `reveal = dot(maskRGB, vec3(0.299, 0.587, 0.114))`），而**非**直接取蒙版 alpha；剪贴层（clipping, [P6-03](./tasks/P6-03-clipping-layers)）维持**按下层 alpha** 裁切。二者在 `RenderTextureBackend.computeMaskedDisplay` 内按 `DisplayMaskMode`（`'luminance'` / `'alpha'`）分流，由 `painter.syncDisplayMasks` 在 `mask.enabled` / `clip` 分支分别注入。

**理由**：

- **对齐行业心智**：Photoshop / Procreate / SAI2 / Krita（透明度蒙版）/ Clip Studio 的图层蒙版一律「白显、黑遮、灰=部分」的灰度语义，可在蒙版里画灰阶柔边。若改用 alpha，则「在蒙版上画黑色不透明」会变成全显（alpha=1），与所有参考软件相反、违反直觉。
- **与剪贴正交**：剪贴已按下层 **alpha / 形状** 裁切；蒙版若也用 alpha，则两者语义重叠、难以区分。用亮度让「蒙版=灰度调制」与「剪贴=下层形状」职责清晰。
- **预乘下天然成立**：Pixi 预乘纹理中蒙版像素 `m=(R·a,G·a,B·a,a)`，`dot(m.rgb, w) = a·straightLuminance`（权重和=1），已把蒙版自身 alpha 折入——「画黑」与「擦空（a=0 ⇒ rgb=0）」都落到 `reveal=0`，两条隐藏路径统一，shader 内无需 un-premultiply。
- **显示是纯 alpha 衰减**：`out = content × reveal` 等价于内容直 alpha × reveal、直 rgb 不变，非破坏、不改本色，可单 pass GPU 合成。

**实现**：单 pass 全屏 quad（`Mesh` + 自定义 `Shader`，仅 `glProgram`，生产 WebGL renderer 够用）采样 content + mask 两张 committedRT，输出 `content × reveal` 进派生 RT，仍 `extract` / 导出安全；剪贴沿用原双 pass erase 合成。自定义 vertex 直接写 clip-space `gl_Position`、绕过 Pixi projection，故 quad 的 UV 行序需匹配 Pixi 其它 RenderTexture 朝向（已用 y 方向单测兜底）。

**代价 / 备选**：纯 alpha 蒙版实现更简单，但与主流软件相反且无法表达灰阶柔边——仅在未来需要「通道 / 矢量蒙版」时再作为独立特性引入。

## D10 — 取色混合的读回路径：SurfaceSampler {#d10}

> ✅ **已定（2026-06-29，据 Krita / MyPaint / SAI 的工业实践）**。涉及 [P7-03](./tasks/P7-03-surface-sampler) / [P7-04](./tasks/P7-04-smudge-engine)。

**背景**：smudge / 取色混合必须**读回画布**（取笔下区域的平均色），但 [`BrushEngine`](./interfaces#笔刷-brush) 的契约是「只产 dab、不知后端」。读回能力要既不污染该契约、又保持 core 与 Pixi 无关（[D5](#d5)）、还可确定性单测。

**业界对照**：MyPaint / Krita / SAI 的混色引擎都**直接读 tile surface**（`get_color()` 取笔下圆盘平均色）、维护一个颜色桶（MyPaint `smudge_state = state·smudge_length + sample·(1−smudge_length)`）、并**逐 dab 串行**取色→混合→落笔。saier 用「注入 `SurfaceSampler`」替代「引擎直接耦合后端」，是保留可测性的等价适配；逐 dab 串行则与业界完全一致（非可选项）。

**决策**：

1. 在 `SurfaceBackend` 增**可选** `sampleRegion?(layerId, rect): RGBA`（返回去预乘的直通色），core 不依赖 Pixi 类型；CPU `TiledSurface` 用现成 `readRegion` 原生实现，GPU 后端不实现（见 [D11](#d11)）。
2. smudge 引擎通过注入的 `SurfaceSampler` 取色（而非自己持后端句柄），从而可用 fake sampler 纯逻辑单测。
3. 集成层对 smudge 走**逐 dab 交错**（`sample → mix → paintDab`），让第 N+1 dab 的取色能看到第 N dab 刚落的像素——否则同一 `addPoint` 批内取色读到旧像素，快速描边「拖不动色」。

**理由**：把「读」收口成一个可选纯接口，既不破坏笔刷契约，又让 CPU tile 零成本提供、GPU 显式不提供；逐 dab 交错是「拖色」正确性的必要条件。**确定性**成立：采样是 surface 状态的纯函数，surface 状态确定演化。

**备选**：纯协调器模式（引擎只产「位置 + 动态」，颜色全由协调器采样后填）——更彻底但改动面更大；先用注入式，必要时再演进。

## D11 — tile 升为默认绘画后端，混色在 CPU tile 上做 {#d11}

> ✅ **已定（方案 A，2026-06-29）**。涉及 [P7-00](./tasks/P7-00-tile-default-backend) / [P7-04](./tasks/P7-04-smudge-engine) / [P7-07](./tasks/P7-07-presets-and-ui)。

**背景**：当前默认后端是 GPU `RenderTextureBackend`（tile 后端 `backend: 'tiled'` 为 P2-06 引入的**可选**项）。GPU 后端无廉价像素读回，逐 dab GPU→CPU readback 会毁掉「跟手」。

**业界对照**：与 saier 架构最像、且可考据的桌面绘画引擎——**Krita / MyPaint / SAI——混色全在 CPU tile 上做、GPU 只负责显示**。在 GPU 上做混色的（Photoshop Mixer / Procreate）都各自维护**自研渲染器**（Mercury / Metal，可控 framebuffer ping-pong / compute），不在 Pixi 之上可行。

**决策（方案 A）**：**tile 升为默认绘画后端**——CPU tile 是像素真相、GPU 仅作显示。混色 / smudge / 水彩在 tile 上逐 dab 读-改-写（与 [D1](#d1)「要 smudge 就上 tile」一致）。`RenderTextureBackend` 保留为显式可选 / 实验；若显式选了非 tile 后端，混色笔刷禁用。

**连带工作（已排期为 [P7-00](./tasks/P7-00-tile-default-backend)）**：P6 的剪贴 / 蒙版**显示重算**目前仅接在 `RenderTextureBackend`（`painter.syncDisplayMasks` 内 `instanceof RenderTextureBackend` 门控）。tile 升为默认前，须把剪贴 / 蒙版显示移植到 tile 路径（CPU 合成脏 tile → 上传显示，符合「tile = 真相」），保证切默认后端 P6 不回归。锁透明已是两后端 parity（P6-02），无需移植。

**触发改为 GPU 混色**：满足 [decisions 末尾](#何时才值得彻底脱离-pixi纯原生重写)「自定义 GPU blend / compute brush」条件、且愿维护自研 renderer 时再议。

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

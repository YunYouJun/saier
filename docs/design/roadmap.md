---
title: Roadmap (P0–P14)
---

# Roadmap：P0–P14 执行计划

> 按阶段推进，逐阶段提交。每阶段给出：目标 / 范围 / 产出文件 / 验收标准（尽量可自动化）/ 明确不做的事。
> 阅读前请先读 [Overview](./) 与 [Decisions](./decisions)；接口契约见 [Interfaces](./interfaces)；验收方法见 [Testing](./testing)。

优先级映射原始建议：P0↔抽象 core、P1↔RasterLayer+Surface、P2↔dirty 更新、P3↔tile undo、P4↔输入、P5↔笔刷种类、P6↔锁透明 / 剪贴 / 蒙版、P7↔混色、P8↔文件 / stroke replay、P9↔外部 brush engine。下表把它们重排为**可增量交付**的顺序，并插入 v8 迁移、shodo 收割、云同步、平台 shell 与云端房间。

## P0 — Pixi v8 迁移 + 测试地基（前置，必做）

> 📋 细化任务卡：[`tasks/`](./tasks/)，codex 按卡逐个执行、逐个验收。

::: warning 现实校正（已用源码 + 实编译验证）
依赖已是 v8.19，`pnpm build:lib` **能通过**。v8 **保留**了 `beginFill / drawCircle / lineStyle / endFill`、`app.view` 等 **deprecated 垫片**——它们能 build、能跑（仅 console 警告）。

**唯一阻断运行的是 `Application` async-init**：v8 的 `new Application(options)` 只打印 deprecation、**不创建 renderer**，而当前构造函数同步读 `app.renderer.resolution`（`painter.ts`、`board/index.ts`）→ 运行时 throw。

所以 P0 硬核只有两件：**修 Application 引导** + **建测试地基**。Graphics 的 v7 写法**不必在 P0 迁**——P1 会用 raster 引擎删掉 brush/eraser 的 Graphics，迁了白迁。
:::

- **目标**：让 `createPainter()` 在 v8 真正跑起来（修 Application init）+ 建可自动化验收的测试地基。**只修阻断点，不重构行为。**
- **范围（必做）**：
  - `painter.ts`：`Application` 改 `await app.init({ canvas, ... })`，把同步访问 `app.renderer / app.screen` 的代码下移到 init 之后（[P0-02](./tasks/P0-02-application-bootstrap-v8)，P0 唯一的运行阻断修复）。
  - 重建 `test/`：headless 跑「画一笔 → extract pixels → 断言非空 + 包围盒」（[P0-06](./tasks/P0-06-test-foundation)）。
- **范围（可选 / deprecation 清理，不阻断）**：
  - 长寿命 overlay（canvas mask、board、layers 选框 / 手柄）的 v7 `Graphics`、`name`→`label`：消除警告，但可延后（[P0-04](./tasks/P0-04-graphics-canvas-board-layers-v8)）。
  - brush / eraser 的 Graphics：**P0 不迁**，留给 P1 删除（[P0-03](./tasks/P0-03-graphics-brush-eraser-v8) 标为可选）。
- **验收**：`examples/vue` 能画线 / 橡皮 / 撤销且**无运行时 throw**；`pnpm test` ≥1 像素断言通过。
- **不做**：任何 raster 重构；为将被 P1 删除的 brush/eraser Graphics 做迁移。

## P1 — RasterLayer + RenderTexture 后端 + 真橡皮（架构分水岭）

- **目标**：笔迹从「Graphics 累加」改为「戳印渲染进图层 RenderTexture」；引入真正的栅格图层与真橡皮。
- **范围**：
  - `core`：`BrushEngine`（先 `SimpleBrushEngine`：spacing + 圆 dab + pressure→size/opacity）、`SurfaceBackend` 接口、`Document` / `RasterLayer`、`UndoManager`。
  - `pixi`：`RenderTextureBackend`（`paintDab` 用 `renderer.render(dabSprite, { renderTexture, clear: false })`；erase 用 erase blend / destination-out 写入图层 RT）、`PixiLayerRenderer`（图层 RT → Sprite）。
  - 撤销：`endStroke` 截取受影响包围盒的 before / after 位图（`StrokePatch`），`applyPatch` 回贴。
  - `pixi-painter` 内部把 brush / eraser 实现切到新管线（保留旧 API 形态）。
  - `core` 暴露 **headless controller 表面**（`setTool` / `brush.setColor` / `brush.setSize` / `on('tool:change' | 'brush:change')`），为 UI 薄皮化铺路（见 [D7](./decisions#d7)）。
- **产出**：`packages/core/`、`packages/pixi/` 初版。
- **验收**：
  - 连续画 5000 个 dab，stage 子节点数**不随笔数增长**（不再是每笔一个 Graphics）。
  - 橡皮在**透明背景**上能擦出透明（extract alpha=0）。
  - 撤销 / 重做后图层像素与操作前 / 后一致（golden-image 比对）。
- **不做**：tile、混色、smudge、带 transform 图层的绘画。

## P2 — TiledSurface + tile undo（仅当需要大画布 / 低内存撤销时）

- **目标**：把 `SurfaceBackend` 换成 256×256 tile 实现，撤销变成 tile before / after patch，dirty tile 批量上传。
- **范围**：`core/surface/{TiledSurface,Tile,DirtyRect}`；`pixi/PixiTileTextureBackend`（CPU tile buffer → 每帧 `requestAnimationFrame` 批量更新脏 tile 的 Pixi Texture）；`UndoManager` patch 改 `TilePatch[]`。
- **验收**：4096×4096 画布连续涂抹，内存平稳；撤销只恢复脏 tile；一帧内多 dab 合并为一次上传（可用计数器断言）。
- **不做**：每帧全图上传、`cacheAsTexture` 用在活动绘画层。

## P3 — 输入质感：跟手（可与 P1 / P2 并行）

- **目标**：让线条「跟手、顺、压感舒服」。
- **范围**：`core/input/`：`PointerSampler`（coalesced events）、`PressureCurve`（可配置；鼠标无压感 fallback 策略，**不要硬编码 0.5**）、`Stabilizer`（先 moving average + exponential smoothing，再做 rope / lazy-brush）、min/max size & opacity、spacing、taper in/out、anti-alias。
- **收割 shodo**：`stroke-engine.ts` 的 4 点滑动平均、velocity→size 曲线、加速度出锋 → 抽成 `Stabilizer` 与 `CalligraphyEngine` 的复用件。
- **验收**：stabilizer 强度 0 / 轻 / 中 / 强四档可调且肉眼可见差异；慢速画圆无明显锯齿 / 抖动；回放同一组输入点像素稳定（确定性）。

## P4 — 笔刷家族

- **范围**：`SimpleBrushEngine` 扩展为 pen / pencil / airbrush / marker（spacing、硬度、流量累积、戳印纹理 `tipId`）；shodo 的毛笔作为 `CalligraphyEngine` 接入同一 `BrushEngine` 接口。
- **验收**：≥4 种笔刷在同一 UI 切换；airbrush 停驻时浓度随时间累积；marker 半透明叠加正确。

## P5 — 图层栈能力

- **范围**：`Document` 支持多 `RasterLayer`、opacity、显隐、顺序、blend mode（显示用 Pixi blend，存储是各自像素）；图层缩略图。
- **UI 脱离库静态**（见 [D7](./decisions#d7)）：把 `@saier/vue` 的 `v-model="PainterBrush.color"`、`PainterBrush.enablePressure` 等直接操纵静态字段改为走 controller API；图层面板读 `document.layers` 而非 `painter.canvas.container.children`。
- **bootstrap 去重**（见 [D8](./decisions#d8)）：把画板装配（`createPainter` + `await init()` + 默认图层 / 工具 + extract 接线）抽成 `@saier/vue` 的 `usePainter()` composable，`examples/vue` 与 `site` **都消费它**——消除当前各写一套 bootstrap 的重复（正是 site demo 漏调 v8 `init()` 而坏掉的根因；快修已落，结构性去重在此）。
- **验收**：图层面板增删 / 排序 / 改透明度即时反映；导出合成结果正确；UI 不再直接引用 `PainterBrush.*` 静态字段；`examples/vue` 与 `site` 共用同一 `usePainter`（无重复 bootstrap）。

## P6 — 锁透明 / 剪贴 / 蒙版 / 带 transform 图层绘画

- **范围**：lock alpha、clipping layer、layer mask；补齐[图层逆变换绘画](./interfaces#坐标与变换正确性)。
- **验收**：锁透明下只改已有像素的颜色不扩边；剪贴图层只在下层不透明区显示；在被缩放 / 旋转的图层上落点准确。

## P7 — 绘画的灵魂：混色 / smudge / 水彩

- **范围**（依赖 P2 tile）：brush density、paint amount、color mixing、dilution、persistence、smudge、paper texture、edge softness；先 stamp brush（笔尖 mask + spacing + opacity accumulation + blend kernel），再做取色混合。
- **验收**：smudge 能拖动已有颜色；两色交界自然过渡；湿边 / 纸纹可开关。

## P8 — 文件 / 序列化

- **范围**：PNG 导出（已有 extract 基础）；工程文件（图层 + 元数据）；**笔迹录制 / 回放协议**（见 [Stroke Recording](./stroke-recording)），从 shodo `tablet.ts` 的 `{X,Y,T,P}` 迁到 `saier.stroke-log.v1`，做成可存储 / 回放 / 协作基础；PSD 导出为可选。
- **验收**：保存 → 读取还原图层；同一笔迹回放像素一致。

## P9 — 外部 brush engine 插槽 + 发布前收口

- **目标**：把 `BrushEngine` 真正产品化为可替换插槽，同时收口 public beta 发布前的必要能力。libmypaint / Hokusai / `.myb` 是 P9 的实验方向，但**不是首次用户发布的 blocker**。
- **范围（发布前必做）**：
  - `core`：`BrushEngineRegistry` / `BrushEngineRegistration`，外部 engine factory 可按 id 注册；缺失 engine 不静默 fallback。
  - `saier`：`Painter` 暴露实例级 `brushEngineRegistry`，并支持 `createPainter({ brushEngines, brushPresets })` 注入。
  - `@saier/vue`：preset summary 携带 `engineAvailable` / `requiresSurfaceSampler` / `supportsMixingControls` / `experimental`，UI 禁用不可用 preset。
  - release gate：内置绘画、图层、undo/redo、项目保存读取、PNG 导出、examples/docs/site 与当前 UI 承诺一致。
- **范围（可选 / 后续）**：
  - `MyPaintBrushEngineWasm` adapter；`.myb` 参数映射；Hokusai 风格实验水彩。
  - 对外部 engine 做 golden parity（仅在选定具体引擎后才有意义）。
- **验收**：fake WASM / 实验 engine 可实现 `BrushEngine` 并在 UI 中切换，不改 core 其它部分；未注册 engine 的 preset 被禁用或创建时报明确错误；内置 preset 不回归。

面向用户发布前的必要功能详见 [P9-00](./tasks/P9-00-public-beta-release-gate)。

## P10 — Beta 运营 / 云端笔刷库 / 持久化加固

- **目标**：P9 public beta 之后，把 YunLeFun 账号级体验补成可长期使用的云同步闭环，优先支持自定义笔刷跨设备同步。
- **范围（优先级）**：
  - [P10-01](./tasks/P10-01-brush-cloud-sync)：自定义笔刷库云同步。笔刷库以 `saier.brush-library.v1` 小型 JSON 文件存入共享云空间，与项目文件共用普通用户 100MiB / 会员 1GiB 配额；单个笔刷库额外限制 256KiB。
  - [P10-02](./tasks/P10-02-cloud-project-library)：云端项目库增强（最近文件、重命名、删除确认、导入失败提示）。
  - [P10-03](./tasks/P10-03-autosave-crash-recovery)：autosave / crash recovery（本地草稿优先，云同步失败不丢数据）。
  - [P10-04](./tasks/P10-04-browser-compatibility)：浏览器兼容矩阵与性能基线（Chrome / Edge / Safari，1024² / 4096²）。
  - [P10-05](./tasks/P10-05-release-flow)：发布流程收口（`saier` 主包、`pixi-painter` deprecated alias、changelog）。
- **验收**：账号 A 保存自定义笔刷后刷新 / 新浏览器登录仍可见；删除后云端和本地都消失；账号 B 不可见；笔刷库文件不出现在项目文件列表；笔刷库上传占用共享 quota 且替换旧库不持续增长。
- **不做**：真实 `MyPaintBrushEngineWasm`、完整 `.myb` parity、笔尖纹理二进制同步、完整 Brush Studio。

## P11 — 平台感知 UI shell / 移动端前置解耦

- **目标**：在不引入 native runtime 的前提下，把桌面浮动面板 shell 从通用 shell 概念中拆出，为移动端 app-like UI、Electron 桌面客户端和 Capacitor/Ionic 移动端打包建立边界。
- **范围（优先级）**：
  - [P11-00](./tasks/P11-00-platform-shell-contract)：平台边界与 shell contract。`/` 保持唯一主入口，内部 shell mode 预留 `desktop | mobile`，Electron / Capacitor 只通过 platform adapter 接入。
  - [P11-01](./tasks/P11-01-desktop-shell-split)：桌面 shell 拆分。当前浮动面板系统迁为 `SiteDesktopPainterShell`，面板状态机抽到 `useDesktopPainterPanels()`。
  - [P11-02](./tasks/P11-02-mobile-shell-skeleton)：移动端 shell 骨架。`/` 按 viewport / pointer 自动选择 shell，移动端使用 app-like frame + 底部 panel sheet，仍复用同一批 painter slots。
- **验收**：桌面视觉和行为不回归；`index.vue` 仍做状态编排但不再直接绑定桌面 shell 名称；移动端和 native packaging 后续能复用同一 shell contract；移动端窄屏不再渲染桌面浮动面板。
- **不做**：Electron spike、Capacitor/Ionic scaffold、最终移动端触控面板重写。

## P12 — Native packaging / platform adapter spike

- **目标**：在 P11 shell 边界之上验证 Electron PC 客户端和 Capacitor/Ionic 移动端 app 的打包路径。P12 只接 platform adapter，不改 painter core。
- **范围（优先级）**：
  - [P12-00](./tasks/P12-00-platform-adapter-contract)：平台 adapter contract。Web / Electron / Capacitor 通过同一组文件、分享、生命周期、native capability API 接入。
  - [P12-01](./tasks/P12-01-electron-packaging-spike)：Electron packaging spike。验证 site renderer、preload 安全边界和本地工程文件打开 / 保存。
  - [P12-02](./tasks/P12-02-capacitor-ionic-spike)：Capacitor / Ionic packaging spike。验证 mobile shell、状态栏 / 安全区 / 分享 / 下载 adapter。
- **验收**：Web 构建不回归；Electron / mobile 包能启动并加载对应 shell；native 能力只通过 adapter 进入 site orchestration；`@saier/*` 不引入 native runtime 依赖。
- **不做**：自动更新、代码签名、App Store / Play Store 发布、原生渲染重写。

## P13 — 云端房间共享画布

- **目标**：在 P8 stroke replay、P10 shared storage、P11/P12 shell 和 platform adapter 边界之上，支持云端房间共享画布。先做房间共享观看和房主绘制广播，再逐步开放多人编辑；Saier 协作后端使用 dedicated `saier-room-api`，不复用已有 YunLeFun `room-api`。
- **范围（优先级）**：
  - [P13-00](./tasks/P13-00-collaboration-protocol)：协作协议与边界。确定 server authoritative operation log、snapshot、presence、权限和重连策略。
  - [P13-01](./tasks/P13-01-room-snapshot-viewer)：房间 snapshot viewer。创建房间、分享链接、加入后只读加载当前画布。
  - [P13-02](./tasks/P13-02-host-stroke-broadcast)：房主绘制实时广播。preview 走 presence，commit 进入服务端排序 log。
  - [P13-03](./tasks/P13-03-room-command-sync)：文档与图层命令同步。同步 layer / document semantic commands。
  - [P13-04](./tasks/P13-04-reconnect-snapshots)：断线重连与 snapshot 压缩。
  - [P13-05](./tasks/P13-05-multi-editor-permissions)：多人编辑权限、driver 模式、图层锁和冲突边界。
  - [P13-06](./tasks/P13-06-verify-collaboration)：双客户端协作验收。
  - [P13-07](./tasks/P13-07-authoritative-realtime-activities)：权威 Activity 协议、HTTP command service、outbox/watermark、NoSQL deadline 与 realtime shadow/preview。
- **验收**：A 创建房间，B 通过链接加入并看到相同 snapshot；A 绘制后 B 收到同 revision；图层命令按顺序同步；断线重连不重复应用 pending op；权限错误有提示；snapshot + ops 恢复后像素 hash 一致。
- **不做**：像素级 CRDT、离线多人合并、协作逻辑进入 painter core。

## P14 — Pictionary 房间玩法

- **目标**：在 P13-07 的权威 Activity 基础上交付第一方你画我猜，验证安全扩展边界和临时 activity canvas，不修改主工程文档。
- **范围**：
  - 根绘画界面按需加载的 Pictionary Activity 插件，内部包含创建/加入 Lobby 与房间状态；旧 `/games/pictionary`、`/games/pictionary/[roomId]` 只保留兼容跳转。
  - 2–12 人 lobby、题库、choosing/drawing/reveal/finished 状态机、私有画手 projection、猜词、计分、离线宽限和 controller takeover。
  - 固定 1024×768 单层 activity canvas，只开放 pen/marker/eraser、颜色和笔径。
  - `realtimeCommittedEvents`、`realtimePreview`、`pictionary`、`redisDeadlineAcceleration` 四个独立 feature flag。
- **验收**：HTTP/polling 单独可完成整局；答案不出现在公共 API/event/log/outbox；漏通知、Redis 故障、旧 epoch 和多 tab 不改变权威结果；主工程 operation log、snapshot revision 和 storage namespace 不变。
- **发布门槛**：上海 VPC Redis 连通、CloudRun `MinNum >= 2`、滚动 drain、100-room 容量和安全攻击矩阵通过后，才允许逐级开启 realtime flags。
- **不做**：第三方插件市场、游客、分队、语音、全球匹配和公共自定义题库市场。

## 里程碑节奏（建议）

```
M1 = P0            // v8 迁移 + 测试地基（解锁一切）
M2 = P1 (+P3 部分) // RenderTexture 图层 + 真橡皮 + 基础 stabilizer —— “能当线稿工具用”
M3 = P2 + P4 + P5  // tile + 笔刷家族 + 图层栈 —— “像绘画软件”
M4 = P6 + P7       // 锁透明 / 蒙版 + 混色 —— “有专业绘画手感”
M5 = P8 + P9 gate  // 文件 / 回放 + 外部引擎插槽 + 发布前收口
M6 = P10           // 云同步 / 持久化 / 发布运营 —— “能长期使用”
M7 = P11           // 平台 shell / 移动端前置解耦 —— “能多端演进”
M8 = P12           // Native packaging spike —— “能安装到桌面 / 移动端”
M9 = P13           // 云端房间共享画布 + 权威 Activity —— “能一起画”
M10 = P14          // Pictionary 第一方玩法 —— “能一起玩”
```

每个 M 结束：demo 可用 + 验收标准全过 + 一次提交 / 发版。

## Risks & 排序回顾 {#risks}

对整体排序的一次自检（诚实版）。**总判断：排序合理**，关键路径 `P0-02 → P1 → …` 正确，[D1](./decisions#d1)「RenderTexture 先行、tile 后置」让早期可交付。已知风险与校准：

1. **P1 偏重、风险前置**：P1 一次引入两包 + 新渲染 + 撤销 + 集成（9 卡），M1→M2 跨度大。缓解：[P1-05](./tasks/P1-05-rendertexture-backend) 先做成独立 spike（脱离集成验证 RenderTexture 绘制 + undo），过了再做 [P1-08](./tasks/P1-08-integrate-pixi-painter) 集成。
2. **两套 dab 光栅化的代价**：P1 在 GPU 光栅化 dab，P2 又在 CPU 重写一套（[P2-02](./tasks/P2-02-cpu-dab-rasterizer)）。这是 D1 阶段化的**已知成本**——用「早交付」换「重复一次光栅器」。若产品**一开始就要混色 / 大画布**，应考虑直接 tile-first（重排 P1/P2）。
3. **手感（P3）被压在 P1 之后**：`跟手 / stabilizer` 是这类绘画工具的灵魂，却排在大重构后。建议把 P3 的 stabilizer / pressure curve **提前在现有管线做一个最小验证**（P0 之后、P1 期间并行），尽早回答「手感对不对」这个产品级问题。
4. **命名 / 包分层**（见 [D8](./decisions#d8)）：**已落地**——品牌 `saier`、scope `@saier/*`、`shodo` 拼写已修；包拆分采**最小拆分**（`@saier/core` ⊥ `@saier/pixi`，依赖图强制解耦）+ **lockstep 版本**；代码层已完成 `pixi-painter→saier`、`controls→@saier/vue`，仅旧 npm alias 属发布期遗留。
5. **跨切面缺口**：① 触屏 / 手势（双指缩放 vs 画）未显式排期 → 并入 P3 输入层；② 性能预算（dab/s、上传 / 帧、内存曲线）已在 P2 / [Testing](./testing) 出现但无专卡 → 作为各 verify 卡的硬指标持续盯；③ DOM UI 无障碍 → 留待 P5。

这些都不阻断当前推进。第 4 点（restructure & naming）已按 D8 落地：`pixi-painter → saier`、`controls → @saier/vue`，仅 npm 上旧 `pixi-painter` deprecated alias 包仍属首次 republish 的发布期工作。

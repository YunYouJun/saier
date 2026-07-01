---
title: Public Beta Checklist
---

# Public beta 发布前 checklist

> 这份清单是 P9 后的发布收口，不等同于继续扩展引擎功能。目标是让用户第一次打开 site / 安装包时不会踩到明显断点。

## Blocking

- [x] **Mask 状态定稿**：P6-04 API / 像素路径已由 browser 测试覆盖；默认用户 UI 只发布 lock alpha / clipping，不把 mask UI 作为正式能力承诺。
- [x] **文档同步**：`README`、`docs/guide/`、`site` 文案统一到 `saier` / `@saier/*`，旧 `pixi-painter` 只保留为 legacy alias 说明。
- [x] **自定义笔刷说明**：已补 [Custom Brushes](../guide/custom-brushes)，覆盖 `createCustomPreset()` / `registerPreset()` / `.myb` 映射，并说明当前是运行时自定义，持久化需由宿主保存 preset 数据。
- [x] **发布 alias 策略**：正式发布主包 `saier`；旧 npm 包 `pixi-painter` 仅作为 deprecated compatibility alias 处理。发布步骤：先发布同版本 `saier`，再发布/更新 `pixi-painter` alias 包或执行 `npm deprecate pixi-painter@"<目标版本范围>" "pixi-painter has moved to saier; install saier instead"`；文档与站点不再推荐旧包名。
- [x] **完整 gate**：2026-07-01 已通过 `eslint .`、`tsc --noEmit`、`vitest`、`unbuild`(core / pixi / saier)、Nuxt production build、VitePress build。Codex runtime 的 `pnpm` 包装器会先触发非 TTY dependency purge 并失败；项目门禁用等价本地二进制验证。
- [x] **手动 smoke**：2026-07-01 已用生产构建 + Playwright 覆盖 site 新建画布、画笔、橡皮、图层、工程保存/读取、PNG 预览/下载、触控双指事件、压感事件抽样。

## Should

- [ ] **笔刷持久化示例**：给 site 增加 localStorage 或 project metadata 示例，演示自定义笔刷跨刷新保留。
- [ ] **浏览器兼容矩阵**：Chrome / Edge / Safari 当前可用性与已知限制。
- [ ] **性能基线截图**：记录 1024² / 4096² 下 dab throughput、tile 数、内存估算。
- [ ] **错误提示**：backend 不支持 sampler、外部 engine 未加载、项目导入失败时有明确 UI 文案。

## Experimental

- [ ] 真实 `MyPaintBrushEngineWasm`。
- [ ] `.myb` 像素级 parity。
- [ ] PSD 完整兼容。
- [ ] 多人协作 / 云同步。

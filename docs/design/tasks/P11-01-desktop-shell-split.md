---
title: P11-01 · Desktop shell split
---

# P11-01 · Desktop shell split

- **Phase / ID**: P11-01
- **Depends on**: P11-00 platform shell contract
- **Files**: `site/app/components/SiteDesktopPainterShell.vue`、`site/app/composables/useDesktopPainterPanels.ts`、`site/app/pages/index.vue`
- **Effort**: M

## Context

旧 `SitePainterShell` 同时代表“通用 shell 概念”和“桌面浮动面板实现”。这会让移动端 UI 只能在桌面浮窗系统上硬加响应式，也会让 Electron / Capacitor 的平台入口边界不清。P11-01 把桌面 shell 命名和面板状态机拆出来，保持桌面体验不变。

## Acceptance

- [x] 桌面布局组件命名为 `SiteDesktopPainterShell`。
- [x] 浮动面板拖拽、合并、收起、隐藏、resize clamp 状态迁入 `useDesktopPainterPanels()`。
- [x] `/` 页面通过 shell component 选择承载同一批 slots，slot 内容不为未来 mobile shell 重复复制。
- [x] 顶部栏、菜单、toolbar、文档 tabs、导出预览、loading overlay 的桌面 DOM / class 结构保持兼容。
- [x] 不改 `@saier/core`、`@saier/pixi`、`saier`、`@saier/vue` 公共 API。

## Out of scope

- 新增 MobileShell 视觉和交互。
- Native 文件系统、自动更新、状态栏、安全区等平台能力。

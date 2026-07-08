---
title: P11-02 · Mobile shell skeleton
---

# P11-02 · Mobile shell skeleton

- **Phase / ID**: P11-02
- **Depends on**: P11-01 desktop shell split
- **Files**: `site/app/components/SiteMobilePainterShell.vue`、`site/app/composables/useSitePainterShellMode.ts`、`site/app/pages/index.vue`
- **Effort**: M

## Context

P11-00 / P11-01 已经把 shell contract 和桌面浮动面板实现拆开。P11-02 开始接入第一版移动端 app-like shell，但仍不重写 painter panels，也不引入 Electron / Capacitor / Ionic。目标是验证 `/` 单入口能按 viewport / pointer 自动选择 shell，并让后续移动端 UI 设计可以在独立 shell 内演进。

## Acceptance

- [x] 新增 `SiteMobilePainterShell`，复用同一批 shell slots，不复制 `index.vue` 的 painter panel 业务编排。
- [x] `/` 入口通过 `useSitePainterShellMode()` 按窄屏 / coarse pointer 自动选择 `desktop | mobile` shell。
- [x] 移动端 shell 使用 app-like frame：顶部状态栏、文档栏、菜单栏、画布、底部 toolbar / panel nav、底部 panel sheet。
- [x] 移动端 panel 打开时通过既有 `setPanelVisible` contract 恢复被隐藏的 panel。
- [x] 桌面 shell 和 `useDesktopPainterPanels()` 不因移动端骨架改动而改变行为。

## Out of scope

- 最终移动端触控面板组件重写。
- Electron main / preload / packager。
- Capacitor / Ionic scaffold。
- Native file system、状态栏、安全区 adapter 的真实接入。

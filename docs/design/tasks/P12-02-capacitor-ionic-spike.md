---
title: P12-02 · Capacitor / Ionic packaging spike
---

# P12-02 · Capacitor / Ionic packaging spike

- **Phase / ID**: P12-02
- **Depends on**: P12-00 platform adapter contract、P11-02 mobile shell skeleton
- **Files**: `apps/mobile/`、`site/`、`docs/design/roadmap.md`
- **Effort**: M

## Context

移动端长期更适合 Capacitor/Ionic 包：app-like shell、系统分享、状态栏、安全区、文件导入导出和移动端生命周期都不应污染 Web / core。P12-02 只验证移动包可运行和 adapter 边界，不做最终触控 UI 重写。

## Acceptance

- [x] Capacitor/Ionic shell 能加载现有 mobile shell。
- [x] 状态栏、安全区、分享 / 下载通过 platform adapter 接入。
- [x] Web 端 `/` 入口仍能按 viewport / pointer 自动选择 shell。
- [x] 构建脚手架不引入 `@saier/core` / `@saier/pixi` 的 native runtime 依赖。
- [x] 文档记录 iOS / Android dev build 和当前限制。

## Implementation Notes

- 新增 `apps/mobile` workspace package，Capacitor config 使用 `webDir: 'www'`，通过 `pnpm build:mobile` 先 `nuxt generate` 再复制静态产物。
- 站点仍复用 `/` 单入口；Web 端按 viewport / pointer 选择 shell，Capacitor native runtime 强制使用 `SiteMobilePainterShell`。
- `SitePlatformAdapter` 新增 `safeArea` / `statusBar` capability。Capacitor adapter 的状态栏、文件写入、分享使用官方 Capacitor plugin 动态接入；安全区由 mobile shell 的 `env(safe-area-inset-*)` 承载。
- P12-02 不提交 `ios/` / `android/` 平台目录；本地具备 Xcode / Android Studio 后运行 `pnpm -C apps/mobile run add:ios` / `add:android` 再 `sync`。

## Out of scope

- App Store / Play Store 发布。
- 原生画布渲染重写。
- 最终移动端触控面板组件。

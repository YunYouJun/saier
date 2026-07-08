---
title: P11-00 · Platform shell contract
---

# P11-00 · 平台边界与 shell contract

- **Phase / ID**: P11-00
- **Depends on**: P10-05 release flow closure
- **Files**: `site/app/types/painter-shell.ts`、`site/app/pages/index.vue`、`docs/design/decisions.md`
- **Effort**: S

## Context

P10 已经把 beta 运营和发布流程收口。P11 开始为移动端 app-like UI、Electron 桌面客户端和 Capacitor/Ionic 移动端打包做前置解耦，但第一步不引入 native runtime，也不改变现有桌面体验。

## Acceptance

- [x] D12 明确 Web / Electron / Capacitor 只通过 UI shell 和 platform adapter 接入，不改 painter core。
- [x] site 内部定义 `SitePainterShellMode = 'desktop' | 'mobile'`。
- [x] shell props / emits / slot contract 以 site 内部类型表达，不暴露为 npm package API。
- [x] `/` 仍是唯一主入口，本阶段 shell mode 固定为 `desktop`。
- [x] Electron / Capacitor 只进入设计边界，不新增依赖和脚手架。

## Out of scope

- 移动端 app-like shell。
- Electron main / preload / packager。
- Capacitor / Ionic scaffold。

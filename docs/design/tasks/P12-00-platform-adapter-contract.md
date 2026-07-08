---
title: P12-00 · Platform adapter contract
---

# P12-00 · Platform adapter contract

- **Phase / ID**: P12-00
- **Depends on**: P11
- **Files**: `site/app/types/platform-adapter.ts`、`site/app/composables/useSitePlatformAdapter.ts`、`site/app/composables/useBeforeUnloadGuard.ts`、`site/app/pages/index.vue`、`docs/design/decisions.md`
- **Effort**: M

## Context

P11 已经把 desktop / mobile UI shell 边界拆出来。P12 开始为 Electron 和 Capacitor/Ionic 打包做平台 adapter，但仍不改 painter core。第一步先定义 adapter contract，避免 native 能力直接渗透进 `/` 页面和 `@saier/*` 包。

## Acceptance

- [x] 定义 site 内部 `SitePlatformAdapter`，覆盖文件打开 / 保存 / 分享 / app lifecycle / native capability。
- [x] Web 默认 adapter 使用现有浏览器能力，不改变当前 site 行为。
- [x] `/` 页面只依赖 adapter contract，不直接分支 Electron / Capacitor runtime。
- [x] Electron / Capacitor 仍不进入 `@saier/core`、`@saier/pixi`、`saier`、`@saier/vue` 公共 API。

## Implementation Notes

- Web 默认 adapter 收口 `input[type=file]`、`a.download`、`navigator.share` 和 `beforeunload`。
- Electron / Capacitor 后续通过 `window.__SAIER_PLATFORM_ADAPTER__` 注入 adapter，不要求 `/` 页面检测 runtime。
- `useBeforeUnloadGuard()` 接受 adapter lifecycle，Web fallback 仅用于没有显式 adapter 的调用点。

## Out of scope

- Electron main / preload 实现。
- Capacitor / Ionic scaffold。
- App store / notarization / updater。

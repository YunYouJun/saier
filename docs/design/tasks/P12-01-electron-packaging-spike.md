---
title: P12-01 · Electron packaging spike
---

# P12-01 · Electron packaging spike

- **Phase / ID**: P12-01
- **Depends on**: P12-00 platform adapter contract
- **Files**: `apps/electron/`、`site/`、`docs/design/roadmap.md`、`package.json`、`pnpm-workspace.yaml`
- **Effort**: M

## Context

桌面端长期更适合独立 Electron 包：专业工具布局、文件系统、窗口菜单、离线使用、未来自动更新都属于 PC 客户端能力。P12-01 只做 spike，验证 Nuxt site 能作为 renderer 被 Electron shell 承载，并通过 adapter 接入 native 文件能力。

## Acceptance

- [x] Electron renderer 能加载现有 site build 或 dev server。
- [x] preload 只暴露最小 adapter API，不暴露 Node 全局对象。
- [x] 打开 / 保存 `.saier.project.json` 走 adapter，不绕过 painter orchestration。
- [x] Web 端构建不因 Electron 依赖增重或破坏。
- [x] 文档记录 dev / build / package 命令和当前限制。

## Implementation Notes

- 新增 `apps/electron` workspace package，Electron 版本跟随 npm 当前稳定 `^43.0.0`。
- `main.cjs` 只创建 `BrowserWindow`、加载 site dev server、处理 open/save file IPC。
- `preload.cjs` 通过 `contextBridge.exposeInMainWorld('__SAIER_PLATFORM_ADAPTER__', ...)` 注入 `SitePlatformAdapter` 形状的 adapter。
- BrowserWindow 保持 `contextIsolation: true`、`nodeIntegration: false`、`sandbox: true`；renderer 不获得 Node 全局对象。
- 当前 spike 不产出安装包；`pnpm build:electron` 仅验证 site production build 和 Electron main/preload 语法。

## Out of scope

- 自动更新。
- 代码签名 / notarization。
- 完整桌面菜单。
- 多窗口文档管理。

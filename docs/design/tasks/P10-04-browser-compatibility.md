---
title: P10-04 · Browser compatibility and performance baseline
---

# P10-04 · 浏览器兼容矩阵与性能基线

- **Phase / ID**: P10-04
- **Depends on**: P9-00 public beta gate、P10-03 autosave / crash recovery
- **Files**: `docs/design/browser-compatibility-matrix.md`、`docs/design/performance-baseline/`
- **Effort**: S

## Context

P10 的云同步和本地草稿让 beta 可以长期使用，但发布前还需要把“哪些浏览器能用、哪些能力有已知限制、性能基线在哪里”写成可执行的发布依据。这个卡片不扩展引擎功能，只收口兼容性和性能证据。

## Acceptance

- [x] Chrome / Edge / Safari / iPadOS Safari 有公开兼容矩阵，区分已自动化验证、支持但需手动 smoke、以及已知限制。
- [x] 1024² / 4096² 的性能基线已留档并可从矩阵跳转。
- [x] 矩阵明确 WebGL、IndexedDB、Pointer Events、local draft、cloud sync / project export 的浏览器限制。
- [x] 矩阵列出 backend sampler、外部 brush engine、项目导入失败的用户可见错误提示要求。
- [x] Public beta checklist 的浏览器兼容项指向矩阵。

## Out of scope

- 为 Safari 或 Edge 建独立自动化 farm。
- 移动端 app-like shell / 响应式布局重构。
- 针对单个浏览器做渲染质量调参。

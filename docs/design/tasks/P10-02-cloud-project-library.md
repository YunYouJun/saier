---
title: P10-02 · Cloud project library polish
---

# P10-02 · 云端项目库增强

- **Phase / ID**: P10-02
- **Depends on**: P10-01、YunLeFun `user-storage-api`
- **Files**: `site/app/composables/useYunlefunCloudFiles.ts`、`site/app/components/SiteCloudSyncDialog.vue`、`site/app/pages/index.vue`
- **Effort**: M

## Context

P10-01 打通了共享云空间和笔刷库同步。项目库还需要补齐 beta 日常使用中的基础管理能力：最近文件、重命名、删除确认和导入失败提示。

## Acceptance

- [x] 项目列表请求明确使用 `kind: 'project'`，并继续过滤掉 `kind: 'brush-library'`。
- [x] 云同步弹窗以最近更新时间倒序展示项目，并标注为最近文件。
- [x] 云端项目支持通过 generic `renameStorageFile` 重命名，不新增 Saier 专用 action。
- [x] 删除云端项目需要二次确认。
- [x] 本地工程导入和云端工程导入失败时给用户提示，不只写 console。

## Out of scope

- 后端跨文件夹移动或复制。
- 工程内容差异合并。

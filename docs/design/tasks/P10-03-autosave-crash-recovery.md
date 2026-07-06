---
title: P10-03 · Autosave and crash recovery
---

# P10-03 · autosave / crash recovery

- **Phase / ID**: P10-03
- **Depends on**: P8 project format、P10-02 cloud project library
- **Files**: `site/app/utils/projectDraft.ts`、`site/app/pages/index.vue`
- **Effort**: M

## Context

P8 已有 `.saier.project.json` 工程格式，P10 需要在云同步失败、浏览器关闭或页面崩溃时尽量保住用户当前工作。草稿优先落本地，云同步只是后续复制，不能成为唯一保存路径。

## Acceptance

- [x] 本地草稿使用独立 `saier.project-draft.v1` 外层格式包住现有工程文件。
- [x] dirty 的当前文档会在落笔、图层变更、清空和文档切换后 debounce 写入 IndexedDB。
- [x] 页面初始化时检测本地草稿，用户可选择恢复或丢弃；恢复后保留 dirty 状态。
- [x] 云端上传前先写本地草稿；云端上传失败时不清理草稿。
- [x] 本地下载保存或云端上传成功后，只有在没有其它 dirty 文档时才清理草稿。
- [x] 草稿解析 / 读写 / 清理有单测。
- [x] 草稿读取 / 恢复 / 保存 / 清理失败时有明确 UI 提示。

## Out of scope

- 多草稿版本历史。
- 多设备 / 多浏览器实例之间的草稿合并。

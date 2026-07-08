---
title: P13-03 · Room command sync
---

# P13-03 · 房间文档与图层命令同步

- **Phase / ID**: P13-03
- **Depends on**: P13-02 host stroke broadcast
- **Files**: `site/app/composables/useYunlefunCloudRooms.ts`、`site/app/composables/useSiteCloudRoomCollaboration.ts`、`site/app/utils/cloudRoomOperations.ts`、`site/app/pages/index.vue`、`packages/core/src/document/`
- **Effort**: L

## Context

绘制广播只能覆盖像素修改。真正共享画布还需要同步图层新增、删除、移动、显隐、透明度、混合模式和文档级命令。P13-03 只同步语义命令，不同步 UI 临时状态。

## Acceptance

- [x] 图层增删 / 排序 / 显隐 / opacity / blend mode 命令进入 operation log。页面 layer wrapper 生成 `layer:command` payload，后端按 revision 排序。
- [x] 高风险命令有权限校验或确认策略。后端按 owner/editor/viewer 和 room mode 拒绝写 op；viewer UI 已阻止本地写入。
- [x] 观看者按 revision 顺序应用 layer / document command。`useSiteCloudRoomCollaboration()` polling 后按 revision replay layer / document command。
- [x] 命令失败有用户可见错误提示，并不会破坏本地 painter 状态。op append 失败会保留 dirty 并显示 cloud room error；成功入云后清 dirty。
- [x] 房间内 dirty / saved 状态与云端 snapshot 策略一致。本地 optimistic 修改在 op 成功写入服务端 revision 后标记 saved；失败保持 dirty。

## Implementation Notes

- P13-01 已在 `/` 页面给只读房间的 menu / toolbar / layer panel / document tab 命令加 guard，避免 viewer 从 UI 发起本地修改。
- `saier-room-api` 已具备 document / layer command 的后端排序与权限入口。
- site-side command serialization / apply adapter 位于 `useSiteCloudRoomCollaboration()`，保持在 site 内部，不扩展 `@saier/*` 公共 API。

## Out of scope

- 多人同时编辑冲突 UI。
- 离线命令合并。
- PSD / 图片资源协作上传优化。

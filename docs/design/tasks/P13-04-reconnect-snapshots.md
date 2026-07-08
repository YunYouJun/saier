---
title: P13-04 · Reconnect and snapshots
---

# P13-04 · 断线重连与快照压缩

- **Phase / ID**: P13-04
- **Depends on**: P13-03 room command sync
- **Files**: `site/app/composables/useYunlefunCloudRooms.ts`、`site/app/composables/useSiteCloudRoomCollaboration.ts`、`docs/design/cloud-rooms.md`
- **Effort**: M

## Context

长时间房间不能无限重放 operation log。P13-04 建立 snapshot checkpoint、log 压缩和断线重连策略，让加入和恢复时间可控。

## Acceptance

- [x] 创建房间、固定 op 数、固定时间窗口都会触发 snapshot checkpoint。后端提供初始 snapshot、`createSnapshotUpload` / `finalizeSnapshotUpload` / `finalizeSnapshotText` checkpoint 状态机；site 端按固定 op 数和时间窗口调度 checkpoint。
- [x] 加入房间时从最近 snapshot + 增量 ops 恢复。加入导入 snapshot 后，site 端以 `latestSnapshotRevision` 为起点拉取 `listOperations(afterRevision)` 并按 revision replay。
- [x] 客户端落后过多时强制下载最新 snapshot。`listOperations` 在 `afterRevision < latestSnapshotRevision` 时返回 `snapshotRequired` + snapshot download；site 导入 snapshot 后再 replay snapshot revision 之后的 ops。
- [x] pending `clientOpId` 重连后幂等确认，不重复应用。后端以 `roomId + clientOpId` 去重，重复提交返回既有 operation。
- [x] snapshot + ops 恢复后像素 hash 与房主一致。当前 committed patch payload 带稳定 `patchHash`；P13-06 真实双账号 e2e 覆盖第三会话 snapshot+ops replay 后 canvas hash 与房主一致。

## Implementation Notes

- `saier-room-api` 中 checkpoint revision 绑定当前 `room.headRevision`，并更新 `latestSnapshotRevision`。
- site reconnect state machine 已维护 `lastAppliedRevision`，并在 `revision_conflict` 后先同步远端 ops 再重试一次本地 op。
- `useSiteCloudRoomCollaboration()` 在可写 session 中按 `CHECKPOINT_OP_INTERVAL = 25` 或 `CHECKPOINT_TIME_WINDOW_MS = 5min` 创建 checkpoint；浏览器 storage 上传失败且 snapshot <= 4 MiB 时走 `finalizeSnapshotText` 函数侧上传 fallback。

## Out of scope

- 二进制 tile delta 压缩。
- 离线多人合并。
- 永久历史回放 UI。

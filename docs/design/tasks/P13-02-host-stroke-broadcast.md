---
title: P13-02 · Host stroke broadcast
---

# P13-02 · 房主绘制实时广播

- **Phase / ID**: P13-02
- **Depends on**: P13-01 room snapshot viewer
- **Files**: `site/app/composables/useYunlefunCloudRooms.ts`、`site/app/composables/useSiteCloudRoomCollaboration.ts`、`site/app/utils/cloudRoomOperations.ts`、`site/app/pages/index.vue`
- **Effort**: L

## Context

在只读房间成立后，第二步让房主绘制时其它成员实时看到。低延迟 preview 可以走临时 presence，但最终状态必须由服务端排序后的 `stroke:commit` 决定。

## Acceptance

- [x] 房主 stroke commit 能以最终像素状态广播给观看者。P13 v1 使用 committed tile patch + polling，优先保证最终一致。
- [x] stroke commit 进入服务端排序 operation log。`saier-room-api.appendOperation` 已按 `baseRevision` 分配 revision，并以 `clientOpId` 幂等去重；site 端通过 `useSiteCloudRoomCollaboration()` 追加 committed tile patch payload。
- [x] 观看者按 revision 顺序 replay committed stroke。当前实现使用 polling `listOperations(afterRevision)` + committed tile patch apply，后续可替换为更轻的 `SaierStrokeCommit` payload / realtime transport。
- [x] smudge / water / sampler 类笔刷严格按服务端顺序应用。当前 data plane 传输最终 tile patch，优先保证像素一致性；语义 stroke replay 优化留到后续。
- [x] 网络乱序 / 重复消息不会造成重复 stroke。handler 单测覆盖重复 `clientOpId` 不重复写入；stale `baseRevision` 返回 `revision_conflict`。
- [x] replay 后可生成像素 hash 或 patch hash 用于一致性检查。`cloudRoomOperations` 为 committed patch 生成稳定 `patchHash`，单测覆盖确定性。

## Implementation Notes

- `cloudbase/functions/saier-room-api` 已提供 `appendOperation` / `listOperations`，作为 P13-02 的持久 op log 后端。
- `useSiteCloudRoomCollaboration()` 已接入 `updatePresence` heartbeat，成员在线态和当前工具 / 图层 presence 不进入持久 log。
- 低延迟 ghost preview 不作为 P13 v1 的 correctness gate。当前先同步 committed patch；后续如需要笔迹“正在画”的观感，再通过 presence / realtime 层补 `stroke:start` / `stroke:append` preview。
- painter 目前没有 per-instance stroke recorder 暴露给 site；当前用 committed tile patch 保证正确性。后续若要降低带宽，需要按 [Stroke Recording](../stroke-recording) 补 `SaierStrokeCommit` recorder / replay API。

## Out of scope

- 多人同时绘制。
- layer / document command 同步。
- 离线编辑。

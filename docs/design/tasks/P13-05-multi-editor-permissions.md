---
title: P13-05 · Multi-editor permissions
---

# P13-05 · 多人编辑权限与冲突边界

- **Phase / ID**: P13-05
- **Depends on**: P13-04 reconnect and snapshots
- **Files**: `site/app/components/SiteCloudRoomDialog.vue`、`site/app/composables/useYunlefunCloudRooms.ts`
- **Effort**: L

## Context

多人同时绘制要晚于只读观看和房主广播。P13-05 在已有 operation log 上开放 `driver` 和 `multi-editor` 模式，用权限、图层锁和服务端顺序控制冲突。

## Acceptance

- [x] owner 可以授予 / 撤回 editor。`saier-room-api.setMemberRole` 支持 owner 将成员设为 viewer / editor。
- [x] driver 模式同一时间只有一个 editor 能提交绘制 op。`saier-room-api.setRoomMode({ mode: 'driver', driverUserId })` 和 `appendOperation` 权限校验已覆盖该约束。
- [x] multi-editor 模式支持不同图层同时绘制。后端允许 editor 在 `multi-editor` 模式提交 op；客户端以 server revision 串行 replay committed patch。
- [x] 同一图层同时绘制按服务端 revision 合并，并在 UI 中提示冲突边界。服务端 revision 串行化已具备；UI 通过 `revision_conflict` / permission notice 提示重试边界。
- [x] 高风险 layer / document command 需要 owner 或锁。后端提供角色 / mode 权限边界；site command adapter 接入权限错误提示。
- [x] viewer / editor / owner 权限错误都有明确提示。viewer 只读 UI 阻止写入；editor / owner op append 失败映射到 cloud room error notice。

## Implementation Notes

- Handler 单测覆盖 viewer 写入被拒绝、owner 授权 editor、multi-editor 写入成功。
- `SiteCloudRoomDialog` 当前只展示成员与 role，不提供 owner 管理成员的 UI；生产多人编辑前需要补权限管理面板。

## Out of scope

- 像素级 CRDT。
- 离线多人合并。
- 语音 / 评论 / 复杂白板协作功能。

---
title: P13-00 · Collaboration protocol
---

# P13-00 · 云端房间协作协议

- **Phase / ID**: P13-00
- **Depends on**: P8-03 stroke recording / replay protocol、P10 shared storage、P11 shell contract
- **Files**: `docs/design/cloud-rooms.md`、`docs/design/decisions.md`、`docs/design/roadmap.md`
- **Effort**: M

## Context

多人共享画布不是云同步的小改版，而是新的协作子系统。P13-00 先定协议和边界：服务端排序 operation log、snapshot checkpoint、房间权限、presence 与持久 op 分离。后续 P13-01 起再逐步实现只读房间、房主绘制广播和多人编辑。

## Acceptance

- [x] D13 明确不做像素级 CRDT，采用 server authoritative ordering + snapshot + operation log。
- [x] `docs/design/cloud-rooms.md` 记录 room model、operation envelope、stroke commit payload、snapshot / reconnect / presence / security。
- [x] P13 任务链按“只读加入 → 房主绘制广播 → 命令同步 → 重连快照 → 多人编辑 → 验收”拆分。
- [x] 协作层边界限定在 site / platform adapter / dedicated `saier-room-api`，不改 `@saier/core` 公共 API。
- [x] P13 明确复用 P8-03 stroke recording / replay、P10 shared storage 和 P11 shell contract。

## Out of scope

- 实时后端实现。
- WebSocket / CloudBase realtime SDK 接入。
- 多人编辑 UI。
- 像素级 CRDT 或离线多人合并。

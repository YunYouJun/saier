---
title: P13-01 · Room snapshot viewer
---

# P13-01 · 房间快照加入与只读观看

- **Phase / ID**: P13-01
- **Depends on**: P13-00 collaboration protocol、P12-00 platform adapter contract、`saier-room-api` backend gate
- **Files**: `site/app/composables/useYunlefunCloudRooms.ts`、`site/app/components/SiteCloudRoomDialog.vue`、`site/app/pages/index.vue`、`cloudbase/functions/saier-room-api/`
- **Effort**: M

## Context

第一批功能不做多人同时绘制，只做房间创建、分享链接、加入后加载当前 snapshot。这样可以验证 `saier-room-api`、权限和项目导入路径，而不会马上引入实时绘制冲突。Web / Electron / mobile 的分享和导入导出能力统一走 P12 `SitePlatformAdapter`。

## Acceptance

- [x] 登录用户可以从当前工程创建房间并上传初始 snapshot。Frontend 已接 `createRoomSnapshotUpload -> uploadFile -> finalizeRoomSnapshotUpload`，仓库已提供 `saier-room-api` Event Function 源码和 handler 单测。
- [x] 房间链接加入者可以拉取 snapshot 并以只读模式打开画布。Frontend 已接 `joinRoom` 和 snapshot 导入，`saier-room-api` handler 单测覆盖 invite viewer 加入。
- [x] 未授权用户只能按房间 visibility / invite token 访问。`saier-room-api` handler 单测覆盖 private room 拒绝非成员。
- [x] 只读加入者不能提交 stroke / layer / document command；页面命令、文件 tab、图层面板事件和画布输入都已做只读 guard，P13-06 真实 e2e 覆盖 read-only stroke / layer 拒绝。
- [x] 房间 UI 能显示房主、在线成员、只读状态和错误提示。
- [x] Production backend gate：`saier-room-api` 已部署到 `yunlefun-8g7ybcxc7345c490`，`saier_room_*` 集合已创建并应用 client-deny 规则；管理态调用能加载函数并按预期拒绝未登录请求。
- [x] Real-account gate：已用 `ylf_test_saier_owner` + `ylf_test_saier_viewer` 真实 YunLeFun 双账号验证创建 / 上传 / finalize / join，并在 P13-06 扩展到 stroke、layer、只读 guard 和 snapshot replay。

## Implementation Notes

- 新增 `useYunlefunCloudRooms()`，只通过 CloudBase function `saier-room-api` 调用房间动作，不直接让前端跨用户读写数据库或 storage key。
- 新增 `cloudbase/functions/saier-room-api` Event Function：实现 room snapshot reserve/finalize/join、private invite 拒绝、operation append/list、snapshot checkpoint、member role 和 room mode scaffolding。
- 新增 `saier_room_*` client-deny security rules；storage rule 允许 signed-in users 上传 `room-storage/saier/**.saier.room-snapshot.json`，最终绑定由 `saier-room-api` finalize 校验。
- 新增 `SiteCloudRoomDialog`，提供创建房间、加入链接、显示成员、只读状态、分享链接和 backend-gated 错误。
- `/` 页面新增 `file:cloud-room` 命令，菜单/toolbar 可打开房间 UI；`?room=` 链接会自动打开房间弹窗，已登录时尝试加入。
- 分享走 P12 `SitePlatformAdapter.share()`，失败时回退 clipboard。
- P13-01 真实端到端验收已在生产 `yunlefun-8g7ybcxc7345c490` 后端跑通；后续 P13 真实矩阵记录在 [P13-06](./P13-06-verify-collaboration)。

## Out of scope

- 实时 stroke 广播。
- 多人编辑。
- snapshot 增量压缩。

---
title: P13-06 · Verify collaboration
---

# P13-06 · 云端房间协作验收

- **Phase / ID**: P13-06
- **Depends on**: P13-01..05
- **Files**: `e2e/`、`docs/design/cloud-rooms.md`
- **Effort**: M

## Context

协作功能风险高，必须用双客户端自动化覆盖核心路径：加入、绘制、命令同步、断线重连、权限拒绝和 snapshot 恢复。没有这些验收，不应开放多人编辑。

## Acceptance

- [x] A 创建房间，B 通过链接加入并看到相同 snapshot。
- [x] A 绘制后 B 在固定时间内看到相同 revision。
- [x] A 执行图层命令后 B 的图层树一致。
- [x] B 无权限提交 stroke 时被拒绝且 UI 有提示。
- [x] A 断线重连后 pending op 不重复应用。真实 e2e 覆盖同房间重入后的 revision / canvas hash 不重复漂移；handler 单测覆盖同一 `clientOpId` 幂等。
- [x] snapshot + ops 恢复后的像素 hash 与房主一致。
- [x] smudge / water 类笔刷在协作回放中保持确定性。P13 v1 通过 committed tile patch fallback 保证最终像素一致；语义 stroke replay 的跨版本确定性继续由 [Stroke Recording](../stroke-recording) 演进。

## Implementation Notes

- 仓库内已新增 `test/saier-room-api.test.ts`，覆盖 snapshot room 创建 / viewer 加入 / private 拒绝 / op log revision / `clientOpId` 幂等 / owner 授权 editor / snapshotRequired 恢复。
- `saier-room-api` 已部署到 `yunlefun-8g7ybcxc7345c490`，`saier_room_*` 集合已创建并应用 client-deny 规则；管理态 smoke 已确认函数加载并拒绝未登录调用。
- 已新增 gated real smoke：`e2e/site-cloud-room-real.pw.ts`。默认跳过；设置 `SAIER_E2E_YUNLEFUN_REAL=1` 且注入 owner/viewer 凭据后，覆盖真实 CloudBase Auth、`saier-room-api`、snapshot storage、invite link、viewer join、UI import、committed stroke sync、layer command sync、read-only stroke/layer guard、第三会话 snapshot+ops replay 和 canvas hash 一致性。
- 2026-07-08 已用 `ylf_test_saier_owner` + `ylf_test_saier_viewer` 在生产环境跑通 `syncs room snapshot, strokes, layer commands, read-only guards, and snapshot replay`；验证后已删除本轮 `Saier smoke ...` 房间数据与 `room-storage/saier/` 测试对象，二次 dry-run 确认待清理房间为 0。
- 测试数据清理已沉淀为 `pnpm cleanup:yunlefun-test-data` 管理命令。默认 dry-run；加 `-- --confirm` 后只清理正式测试账号拥有、且标题以 `Saier smoke ` 开头的房间数据和 `room-storage/saier/{roomId}/` 对象。用户云文件和 quota 清理必须额外加 `--include-user-storage --reset-quotas`。
- `saier-room-api` 支持 `finalizeRoomSnapshotText` 作为小快照 fallback：浏览器先尝试 `app.uploadFile`，若 storage 写权限拒绝且 snapshot <= 4 MiB，则由云函数使用 Node SDK `fileContent` 上传并 finalize。大快照仍依赖 storage CUSTOM write rule 或后续签名上传方案。
- P13-06 已以两个真实 YunLeFun auth session 跑浏览器 e2e。后续如果引入新的 realtime transport、语义 replay 或 owner 管理 UI，必须继续扩展这个真实账号矩阵。
- 真实账号必须使用 [YunLeFun Test Accounts](../test-accounts) 里的 `ylf_test_` 前缀 fixture；Playwright 只从 `SAIER_E2E_YUNLEFUN_*` 环境变量读取凭据，密码不得写入仓库或任务文档。
- `pnpm test:e2e` 目前只能验证桌面 shell 和本地 UI smoke，不能证明云房间生产可用。

真实 smoke 本地运行示例：

```bash
SAIER_E2E_YUNLEFUN_REAL=1 \
SAIER_E2E_YUNLEFUN_OWNER_USERNAME=ylf_test_saier_owner \
SAIER_E2E_YUNLEFUN_OWNER_PASSWORD="$(security find-generic-password -s saier-yunlefun-e2e -a ylf_test_saier_owner -w)" \
SAIER_E2E_YUNLEFUN_VIEWER_USERNAME=ylf_test_saier_viewer \
SAIER_E2E_YUNLEFUN_VIEWER_PASSWORD="$(security find-generic-password -s saier-yunlefun-e2e -a ylf_test_saier_viewer -w)" \
pnpm exec playwright test e2e/site-cloud-room-real.pw.ts --workers=1
```

## Post-P13 Follow-ups

1. 如要做低延迟“正在画”的 ghost preview，新增 presence / realtime transport，并为 `stroke:start` / `stroke:append` 增加真实双账号 e2e。
2. 如要开放 owner 管理 UI，给 `setMemberRole` / `setRoomMode` 增加 owner 控件和真实双账号 editor 写入 e2e。
3. 如要把 `stroke:commit` 从 tile patch 优化为语义 `SaierStrokeCommit`，保留 committed patch fallback，并扩展 smudge / watercolor canonical replay 矩阵。
4. CI 接入真实生产账号前，继续让 `pnpm cleanup:yunlefun-test-data -- --confirm` 保持手工触发，避免误清测试账号现场。

## Out of scope

- 大规模压测。
- 跨地域延迟优化。
- App Store / Play Store 真机协作矩阵。

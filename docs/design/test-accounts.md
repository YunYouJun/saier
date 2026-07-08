---
title: YunLeFun Test Accounts
---

# YunLeFun 测试账号机制

这份规范定义 `www.yunle.fun` 生产环境里的正式测试账号。它服务于 Saier 云同步、云端房间、权限和 quota smoke，不用于普通手工体验账号。

## 固定前缀

所有新建正式测试账号的用户名必须使用：

```text
ylf_test_
```

Saier 约定 4 个固定槽位：

| Slot   | Username                | UID                   | Member | 用途                                      |
| ------ | ----------------------- | --------------------- | ------ | ----------------------------------------- |
| owner  | `ylf_test_saier_owner`  | `2074792729263353858` | no     | 创建房间、上传 snapshot、普通 quota smoke |
| editor | `ylf_test_saier_editor` | `2074792750494920705` | no     | editor 权限、多人编辑提交                 |
| viewer | `ylf_test_saier_viewer` | `2074792769235202049` | no     | 只读加入、权限拒绝                        |
| member | `ylf_test_saier_member` | `2074792789766057985` | yes    | 会员 quota、150 MiB 级文件 smoke          |

历史账号 `ylfmembertest` 只作为 legacy 会员 smoke 账号保留。新测试必须迁到 `ylf_test_` 前缀。

## Marker

账号创建后必须同时写入账号资料或后台 registry marker。marker 的最小结构如下：

```json
{
  "schema": "yunlefun.test-account.v1",
  "isTestAccount": true,
  "namespace": "saier",
  "usernamePrefix": "ylf_test_",
  "slot": "owner",
  "owner": "saier",
  "resetPolicy": "delete-owned-test-data",
  "purpose": ["saier-cloud-room-owner", "saier-cloud-storage-normal"]
}
```

生产环境使用 `yunlefun_test_accounts` 作为管理态 registry，集合权限必须是 client-deny。真实账号资料表也可以冗余写入 `isTestAccount: true` 与同名 `testAccount` marker，便于 `account-api` / `user-storage-api` / 后台页面过滤。

## Production Status

2026-07-08 已在 `yunlefun-8g7ybcxc7345c490` 初始化：

- 已创建 `yunlefun_test_accounts` 集合并应用 client-deny security rule。
- 已创建 `ylf_test_saier_owner` / `ylf_test_saier_editor` / `ylf_test_saier_viewer` / `ylf_test_saier_member` 四个 ACTIVE CloudBase Auth 用户。
- 已登记 `saier:owner` / `saier:editor` / `saier:viewer` / `saier:member` 四个 registry 文档，状态为 `active`，并写入 UID。
- 已给四个标准账号创建 `user_profiles` marker；`member` 槽位已写入 active basic/month 会员态。
- 已给 legacy 会员测试账号 `ylfmembertest` 的 `user_profiles` 记录补 `isTestAccount: true` 与 `testAccount` marker；它仅用于过渡，后续 smoke 应迁到 `ylf_test_saier_member`。
- 未在文档或仓库中记录任何密码。当前本机密码存放在 macOS Keychain service `saier-yunlefun-e2e`。

## 凭据

密码不得写入仓库、文档、CloudBase 文档数据库或聊天记录。E2E 只从本地或 CI secret 读取：

```text
SAIER_E2E_YUNLEFUN_OWNER_USERNAME
SAIER_E2E_YUNLEFUN_OWNER_PASSWORD
SAIER_E2E_YUNLEFUN_EDITOR_USERNAME
SAIER_E2E_YUNLEFUN_EDITOR_PASSWORD
SAIER_E2E_YUNLEFUN_VIEWER_USERNAME
SAIER_E2E_YUNLEFUN_VIEWER_PASSWORD
SAIER_E2E_YUNLEFUN_MEMBER_USERNAME
SAIER_E2E_YUNLEFUN_MEMBER_PASSWORD
```

本地可放在 `.env.e2e.local` 或 shell secret manager；该文件已被 `.gitignore` 覆盖，不得提交。CI 使用仓库 secret 或环境级 secret。

本机已把当前密码写入 macOS Keychain，可按需导出到 shell：

```bash
export SAIER_E2E_YUNLEFUN_OWNER_USERNAME=ylf_test_saier_owner
export SAIER_E2E_YUNLEFUN_OWNER_PASSWORD="$(security find-generic-password -s saier-yunlefun-e2e -a ylf_test_saier_owner -w)"
export SAIER_E2E_YUNLEFUN_EDITOR_USERNAME=ylf_test_saier_editor
export SAIER_E2E_YUNLEFUN_EDITOR_PASSWORD="$(security find-generic-password -s saier-yunlefun-e2e -a ylf_test_saier_editor -w)"
export SAIER_E2E_YUNLEFUN_VIEWER_USERNAME=ylf_test_saier_viewer
export SAIER_E2E_YUNLEFUN_VIEWER_PASSWORD="$(security find-generic-password -s saier-yunlefun-e2e -a ylf_test_saier_viewer -w)"
export SAIER_E2E_YUNLEFUN_MEMBER_USERNAME=ylf_test_saier_member
export SAIER_E2E_YUNLEFUN_MEMBER_PASSWORD="$(security find-generic-password -s saier-yunlefun-e2e -a ylf_test_saier_member -w)"
```

`.env.e2e.example` 只记录变量名和用户名，密码字段必须留空。

## 创建流程

1. 使用 CloudBase 管理态在 `yunlefun-8g7ybcxc7345c490` 创建或重置用户名密码用户，用户名必须来自上表。
2. 在 `yunlefun_test_accounts` upsert registry 文档，`_id` 建议为 `saier:<slot>`。
3. 在 `user_profiles` 或账号资料来源写入 `isTestAccount: true` 与 `testAccount` marker；不要覆盖昵称、头像等用户可见字段以外的业务字段。
4. `member` 槽位在 `user_memberships` 写入 active basic/month 会员态；其它槽位不得有会员态。
5. 把密码写入本地/CI secret；不要在 PR、issue、任务文档或测试快照里输出。

## 重置流程

每次真实浏览器 smoke 前，后台重置这些账号拥有的数据：

- 删除 `user_storage_files` 中 `userId` 属于测试账号 uid 的 active / reserved 行，并删除对应 `user-storage/{uid}/saier/**` 对象。
- 删除 `saier_room_*` 中 owner/member 属于测试账号 uid 的房间、成员、operation、snapshot reservation 和 snapshot 行，并删除 `room-storage/saier/**` 中对应对象。
- 将 `user_storage_quotas.usedBytes` / `reservedBytes` 归零或按现有 backend 懒同步规则重算。
- 保留账号、profile、membership 和 registry marker。

删除逻辑必须按 uid 白名单执行，不允许只按时间范围或 appId 批量清理。

仓库内提供本地管理命令：

```bash
pnpm cleanup:yunlefun-test-data
```

默认是 dry-run，只列出将被清理的对象，不执行删除。常规 P13 真实浏览器 smoke 使用 `Saier smoke ` 标题前缀；确认删除本轮房间数据时执行：

```bash
pnpm cleanup:yunlefun-test-data -- --confirm
```

需要同时清理 Saier 云文件 smoke 数据和 quota 时，显式开启用户存储清理：

```bash
pnpm cleanup:yunlefun-test-data -- --confirm --include-user-storage --reset-quotas
```

安全边界：

- 命令通过 CloudBase 管理态 `mcporter` 执行，必须先能访问 `yunlefun-8g7ybcxc7345c490`。
- 房间清理默认只删除正式测试账号拥有、且标题以 `Saier smoke ` 开头的房间；需要清空这些账号拥有的所有 Saier room 数据时才使用 `--all-test-room-data`。
- 用户存储清理默认关闭，避免 P13 房间 smoke 误删 P10 quota / 云文件测试现场。
- 账号、profile、membership、registry marker 和密码 secret 永远不由该命令删除。

## 验收使用

P13-06 双客户端协作验收必须使用 `owner` + `viewer` 或 `owner` + `editor` 两套真实 YunLeFun auth session。P10 云同步 quota smoke 使用 `owner` 覆盖普通 quota，使用 `member` 覆盖会员 quota。

Saier 仓库里的 `e2e/fixtures/yunlefun-test-accounts.ts` 是可执行的 fixture source of truth；文档、后台 registry 和 Playwright 环境变量必须与它保持一致。

云房间真实 smoke 用例在 `e2e/site-cloud-room-real.pw.ts`。默认跳过，必须显式设置 `SAIER_E2E_YUNLEFUN_REAL=1` 并注入 owner/viewer 凭据。2026-07-08 已跑通生产环境 owner 创建房间、viewer 通过 invite link 只读加入、committed stroke 同步、layer command 同步、只读 stroke / layer guard、第三会话 snapshot+ops replay 和 canvas hash 一致；运行后应按本页重置流程清理 `Saier smoke ...` 房间数据和 `room-storage/saier/` 对象。

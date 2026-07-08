# Saier YunLeFun Shared Cloud Storage Rules

These rules are the production gate for Saier's YunLeFun shared cloud storage flow.

The browser no longer creates Saier cloud metadata directly. New project and brush-library uploads must go through the YunLeFun `user-storage-api` state machine:

```text
getStorageQuota -> reserveStorageUpload -> uploadFile(storageKey) -> finalizeStorageUpload
deleteStorageFile
renameStorageFile
listStorageFiles({ appId, kind, slotKey })
```

## Resources

| Resource                                                         | Rule file                                      | Permission |
| ---------------------------------------------------------------- | ---------------------------------------------- | ---------- |
| NoSQL collection `user_memberships`                              | `no-sql/user_memberships.json`                 | `CUSTOM`   |
| NoSQL collection `user_storage_quotas`                           | `no-sql/user_storage_quotas.json`              | `CUSTOM`   |
| NoSQL collection `user_storage_files`                            | `no-sql/user_storage_files.json`               | `CUSTOM`   |
| Legacy NoSQL collection `saier_cloud_files`                      | `no-sql/saier_cloud_files.json`                | `CUSTOM`   |
| NoSQL collection `saier_room_rooms`                              | `no-sql/saier_room_rooms.json`                 | `CUSTOM`   |
| NoSQL collection `saier_room_members`                            | `no-sql/saier_room_members.json`               | `CUSTOM`   |
| NoSQL collection `saier_room_snapshot_reservations`              | `no-sql/saier_room_snapshot_reservations.json` | `CUSTOM`   |
| NoSQL collection `saier_room_snapshots`                          | `no-sql/saier_room_snapshots.json`             | `CUSTOM`   |
| NoSQL collection `saier_room_operations`                         | `no-sql/saier_room_operations.json`            | `CUSTOM`   |
| NoSQL collection `yunlefun_test_accounts`                        | `no-sql/yunlefun_test_accounts.json`           | `CUSTOM`   |
| Cloud Storage bucket `7975-yunlefun-8g7ybcxc7345c490-1325586649` | `storage/saier-projects.json`                  | `CUSTOM`   |

## Runtime Policy

- CloudBase Auth `uid` is the YunLeFun global user id.
- Normal users get 100 MiB shared storage; members get 1 GiB shared storage.
- A single business file cannot exceed 200 MiB.
- Saier brush libraries are business files with `kind: 'brush-library'`, `slotKey: 'default'`, fixed file name `brush-library.saier.brushes.json`, format `saier.brush-library.v1`, and an additional 256 KiB client / backend limit.
- `user_storage_quotas._id` and `user_memberships._id` must be the CloudBase `uid`; legacy `userId` queries are only for migration compatibility.
- `user_storage_quotas` and `user_storage_files` are client read-only. All writes are made by `user-storage-api`.
- Avatars under `avatars/{uid}_*.jpg|png|webp` stay outside the shared quota for this release and are limited to 10 MiB.
- Legacy `saier/projects/**.saier.project.json` remains owner-readable/writable during the transition. New Saier project and brush-library uploads use `user-storage/{uid}/saier/{reservationId}/{fileName}`.
- `user_storage_files.kind` distinguishes project files (`project`) from the account brush library (`brush-library`). Legacy project rows without `kind` are treated as projects only when their file name ends with `.saier.project.json`.
- Cloud Storage avatar and legacy project paths use supported `.test()` regular expressions plus `resource.openid` ownership checks. CloudBase storage rules do not support dynamic uid path-prefix checks (`indexOf` / `startsWith` / `includes` are invalid), so Web Auth avatar uploads are owned by `www.yunle.fun`'s backend `account-api.uploadAvatar` flow instead of direct browser storage writes.
- New `user-storage/**` browser uploads and downloads are intentionally gated by signed-in auth, a `user-storage/` path segment, and the Saier business-file suffix (`.saier.project.json` or `brush-library.saier.brushes.json`). CloudBase storage upload/download preflight may pass either object paths or `cloud://.../user-storage/...` file ids, and it does not expose enough stable business metadata to prove the `uid/appId/reservationId/fileId` contract at this layer. Exact binding, owner-visible listing, the 200 MiB single-file limit, shared quota, singleton brush replacement, and cleanup are enforced by `user-storage-api` during reserve/finalize/delete.

## YunLeFun Test Account Registry

Formal production test accounts use the `ylf_test_` username prefix and are
registered in `yunlefun_test_accounts`. The collection is backend-private and is
only a registry for account-api / user-storage-api / smoke tooling; browser
clients must not read or mutate it. See `docs/design/test-accounts.md` for the
slot list, marker schema, secret handling, and reset policy.

Production status (2026-07-08): the `yunlefun_test_accounts` collection exists
in `yunlefun-8g7ybcxc7345c490`, has client-deny `CUSTOM` permissions, and stores
the four active `saier:{owner,editor,viewer,member}` fixture documents with UID
bindings. Passwords are stored outside CloudBase documents and outside git.

## Shared Storage Backend Gate

The security rules are not sufficient by themselves. Before enabling P10 brush cloud sync in production, deploy a dedicated `user-storage-api` storage state machine. It owns shared storage quota, reservations, file listing, finalize, delete, and app/kind policy. `account-api` remains responsible for account/profile/membership concerns only; `user-storage-api` may read account entitlements, but Saier clients must not call storage actions through `account-api`.

- `listStorageFiles({ appId: 'saier', kind: 'brush-library', slotKey: 'default', limit: 1 })`: return the current user's latest active brush-library file. The backend may also return quota, but Saier must not depend on a brush-specific response shape.
- `reserveStorageUpload({ appId: 'saier', kind: 'brush-library', slotKey: 'default', fileName: 'brush-library.saier.brushes.json', sizeBytes, contentType: 'application/json' })`: apply app/kind policy; reject unauthenticated users, `sizeBytes > 262144`, non-JSON content, non-Saier app ids, and quota overflow; reserve storage under `user-storage/{uid}/saier/{reservationId}/brush-library.saier.brushes.json`.
- `finalizeStorageUpload({ reservationId, storageKey, fileId })`: require ownership, exact reservation/storage key/file id match, and active reservation state; when policy says singleton, mark the new file active, release or delete the previous active file for the same `userId + appId + kind + slotKey`, and keep shared quota flat across replacements.
- `renameStorageFile({ appId: 'saier', kind: 'project', reservationId, fileName })`: update owner-visible project metadata without moving the storage object; reject non-project kinds, non-Saier app ids, non-JSON project names, and rows not owned by the current user.

The app/kind policy is storage metadata only. `user-storage-api` must not parse `saier.brush-library.v1`, inspect `BrushPreset`, or contain Saier brush merge logic.

The existing project uploads should keep writing `kind: 'project'` and no `slotKey`. `listStorageFiles({ appId: 'saier' })` may return all Saier business files, but clients only display files normalized as project files.

2026-07-02 browser smoke found production gaps: production storage actions still lived behind `account-api`, brush sync needed generic `kind/slotKey` policy and singleton replacement support, and `getStorageQuota` intermittently returned `同步云空间配额并发冲突，请重试`. Treat deployment of `user-storage-api` plus those fixes as blockers for real brush cloud sync.

## Saier Room Backend Gate

P13 cloud rooms use a dedicated `saier-room-api` CloudBase Event Function. The
existing YunLeFun `room-api` function is reserved for non-Saier shared spaces and
must not be overloaded with painting room behavior.

The room collections are intentionally client-private:

- `saier_room_rooms`
- `saier_room_members`
- `saier_room_snapshot_reservations`
- `saier_room_snapshots`
- `saier_room_operations`

All reads and writes go through `saier-room-api`, which enforces YunLeFun auth,
invite-token checks, owner/editor/viewer roles, server-side revision assignment,
and `clientOpId` idempotency. Browser clients may upload snapshot blobs only
after the function reserves a storage key; they must never list or mutate room
documents directly.

## Apply With CloudBase MCP

Use the canonical EnvId explicitly:

```text
yunlefun-8g7ybcxc7345c490
```

Database rules:

```js
managePermissions({
  action: 'updateResourcePermission',
  resourceType: 'noSqlDatabase',
  resourceId: 'user_memberships',
  permission: 'CUSTOM',
  securityRule: JSON.stringify(userMembershipsRule),
})

managePermissions({
  action: 'updateResourcePermission',
  resourceType: 'noSqlDatabase',
  resourceId: 'user_storage_quotas',
  permission: 'CUSTOM',
  securityRule: JSON.stringify(userStorageQuotasRule),
})

managePermissions({
  action: 'updateResourcePermission',
  resourceType: 'noSqlDatabase',
  resourceId: 'user_storage_files',
  permission: 'CUSTOM',
  securityRule: JSON.stringify(userStorageFilesRule),
})

managePermissions({
  action: 'updateResourcePermission',
  resourceType: 'noSqlDatabase',
  resourceId: 'saier_cloud_files',
  permission: 'CUSTOM',
  securityRule: JSON.stringify(saierCloudFilesRule),
})

for (const [resourceId, securityRule] of [
  ['saier_room_rooms', saierRoomRoomsRule],
  ['saier_room_members', saierRoomMembersRule],
  ['saier_room_snapshot_reservations', saierRoomSnapshotReservationsRule],
  ['saier_room_snapshots', saierRoomSnapshotsRule],
  ['saier_room_operations', saierRoomOperationsRule],
  ['yunlefun_test_accounts', yunlefunTestAccountsRule],
]) {
  managePermissions({
    action: 'updateResourcePermission',
    resourceType: 'noSqlDatabase',
    resourceId,
    permission: 'CUSTOM',
    securityRule: JSON.stringify(securityRule),
  })
}
```

Storage rule:

```js
managePermissions({
  action: 'updateResourcePermission',
  resourceType: 'storage',
  resourceId: '7975-yunlefun-8g7ybcxc7345c490-1325586649',
  permission: 'CUSTOM',
  securityRule: JSON.stringify(yunlefunStorageRule),
})
```

CloudBase MCP documents storage permission operations as bucket-scoped, so the `resourceId` is the bucket name, not the path prefix.

## Verification Checklist

After applying:

1. Non-logged-in users cannot read quota/file indexes or storage objects.
2. Logged-in normal users can upload Saier files until their 100 MiB shared quota is exhausted.
3. Logged-in members can upload Saier files until their 1 GiB shared quota is exhausted.
4. A file larger than 200 MiB is rejected by `reserveStorageUpload`; avatar and legacy project storage writes also keep storage-rule size caps.
5. Forged `userId`, `storageKey`, or `fileId` cannot finalize another user's upload.
6. `deleteStorageFile` removes the storage object and releases quota.
7. Existing `www.yunle.fun` avatar upload under `avatars/` still works for 10 MiB images.
8. `reserveStorageUpload` rejects brush-library files over 256 KiB, writes `kind: 'brush-library'` and `slotKey: 'default'`, and reserves under the owner path.
9. `finalizeStorageUpload` replaces the previous active brush library for the same `userId + appId + kind + slotKey` and releases the old file's quota.
10. Saier project lists only show `kind: 'project'` or legacy `.saier.project.json` rows; `kind: 'brush-library'` rows stay hidden from the project table.
11. `renameStorageFile` updates project display names only for the current owner and never accepts `kind: 'brush-library'`.
12. Browser clients cannot directly read or write any `saier_room_*` collection.
13. `saier-room-api` rejects forged room membership, invite token, `storageKey`, and duplicate `clientOpId` writes.
14. `yunlefun_test_accounts` is backend-private; clients cannot list fixture users or credentials.
15. `room-storage/saier/**.saier.room-snapshot.json` uploads are allowed only for signed-in users and remain capped at 200 MiB.

Official references:

- CloudBase NoSQL database security rules: https://docs.cloudbase.net/database/security-rules
- CloudBase storage security rules: https://docs.cloudbase.net/storage/security-rules
- CloudBase MCP permission tools: https://docs.cloudbase.net/en/ai/cloudbase-ai-toolkit/mcp-tools

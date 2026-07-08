# saier-room-api

CloudBase Event Function for Saier cloud rooms.

This function is intentionally separate from the existing YunLeFun `room-api`
function. `room-api` already owns non-Saier shared-space behavior, while
`saier-room-api` owns painting room snapshots, operation ordering, room members,
and collaboration permissions.

Reusable room primitives live in this function folder:

- `room-core.cjs`: pure room helpers for error codes, strict scalar parsing,
  share URLs, random ids, and hashes.
- `cloudbase-runtime.cjs`: CloudBase Event Function adapters for caller uid,
  collection CRUD helpers, revisioned operation listing, and snapshot download
  URLs.

These modules are intentionally kept inside `saier-room-api` for now so the
function deployment package stays self-contained. If another product adopts the
same primitives, promote them to a packaged internal dependency instead of
requiring sibling folders from a CloudBase function.

## Runtime

- Type: Event Function
- Runtime: `Nodejs18.15`
- Entry: `index.js`
- Function root for MCP deployment: `cloudbase/functions`

## Actions

- `createRoomSnapshotUpload`
- `finalizeRoomSnapshotUpload`
- `finalizeRoomSnapshotText`
- `joinRoom`
- `leaveRoom`
- `appendOperation`
- `listOperations`
- `createSnapshotUpload`
- `finalizeSnapshotUpload`
- `finalizeSnapshotText`
- `setMemberRole`
- `setRoomMode`
- `updatePresence`

The first three actions are the P13-01 snapshot-viewer contract. The operation,
snapshot checkpoint, permission, and presence actions are the P13 v1
collaboration data plane; site clients currently consume them through polling
plus heartbeat. A dedicated CloudBase realtime or WebSocket adapter is a later
latency optimization, not a P13 v1 correctness requirement.

## Deployment Sketch

Production backend gate status (2026-07-08):

- EnvId: `yunlefun-8g7ybcxc7345c490`
- Function: `saier-room-api`
- Runtime: `Nodejs18.15`
- Environment: `SAIER_ROOM_SHARE_ORIGIN=https://saier.yunle.fun`
- Collections created: `saier_room_rooms`, `saier_room_members`,
  `saier_room_snapshot_reservations`, `saier_room_snapshots`,
  `saier_room_operations`
- Collection permissions: `CUSTOM` with client-deny rules from
  `cloudbase/security-rules/no-sql/saier_room_*.json`
- Smoke: management invocation loads the function and rejects unauthenticated
  calls with `not_authenticated`; browser real smoke passed on 2026-07-08 with
  `ylf_test_saier_owner` creating a room, `ylf_test_saier_viewer` joining it
  read-only, committed stroke sync, layer command sync, read-only stroke/layer
  guard, and third-session snapshot+ops replay.

P13 v1 also uses `updatePresence` as a heartbeat. It updates member
`lastSeenAt`, `online`, and optional `presence` payload, then returns the
refreshed member list. Presence data is intentionally temporary; committed
operations remain the only durable painting state.

Real-account browser verification uses two YunLeFun auth sessions from the
`ylf_test_` fixture set documented in `docs/design/test-accounts.md` and the
gated `e2e/site-cloud-room-real.pw.ts` smoke path. The browser still attempts
direct `app.uploadFile` first; for small snapshots, `finalizeRoomSnapshotText`
allows the function to upload and finalize when client storage write rules are
too restrictive for browser writes.

## Test Data Cleanup

Use the repo-level management command after real-account smoke runs:

```bash
pnpm cleanup:yunlefun-test-data -- --confirm
```

The command is dry-run by default, resolves the formal `ylf_test_` Saier account
uid whitelist from `yunlefun_test_accounts` plus the documented fallback ids, and
only deletes smoke rooms whose title starts with `Saier smoke ` unless
`--all-test-room-data` is passed. It also removes the matching
`room-storage/saier/{roomId}/` objects. User cloud-file data and quota counters
are intentionally opt-in through `--include-user-storage --reset-quotas`.

```js
manageFunctions({
  action: 'createFunction',
  func: {
    name: 'saier-room-api',
    type: 'Event',
    runtime: 'Nodejs18.15',
    timeout: 30,
  },
  functionRootPath: '/absolute/path/to/saier/cloudbase/functions',
})
```

Before production deployment, create the `saier_room_*` collections listed in
`cloudbase/security-rules/README.md`, apply client-deny security rules, and run
the P13 real-account smoke suite.

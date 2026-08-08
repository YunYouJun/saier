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
- `activity-core.cjs`: pure Pictionary reducer, normalization, scores, deadlines,
  and activity/canvas fencing.
- `activity-command-service.cjs`: the shared HTTP/WebSocket transactional
  authority, dedupe, public/private projection, event/outbox and resume logic.
- `activity-workers.cjs`: retryable outbox publishing and the NoSQL-backed
  due-session scanner. Redis is an optional acceleration index only.
- `pictionary-ai-remix.cjs`: feature-gated CloudBase image-to-image adapter,
  fixed prompt policy, result persistence, and the Pictionary request workflow.

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
- `createActivityRoom`
- `joinActivityRoom`
- `activatePictionary`
- `submitActivityCommand`
- `requestActivityAiRemix`
- `resumeActivity`
- `getActivityPrivateProjection`
- `createActivityRealtimeToken`

The first three actions are the P13-01 snapshot-viewer contract. The operation,
snapshot checkpoint, permission, and presence actions are the P13 v1
collaboration data plane; site clients currently consume them through polling
plus heartbeat. A dedicated CloudBase realtime or WebSocket adapter is a later
latency optimization, not a P13 v1 correctness requirement. P13-07/P14 keeps
that property: all game commands and recovery work through this HTTP function
when realtime flags are disabled.

## Activity authority

Activity commands use CloudBase `runTransaction()` and deterministic document
IDs. A successful transaction writes the materialized public session, private
secret projection, redacted public events, command result and pending outbox
together. Commands sharing `(sessionId, userId, commandId)` are idempotent only
when their SHA-256 payload hash also matches.

The durable activity collections are:

- `saier_room_game_sessions`
- `saier_room_game_secrets`
- `saier_room_game_events`
- `saier_room_game_commands`
- `saier_room_game_outbox`
- `saier_room_game_canvas_operations`
- `saier_room_game_snapshots`

All have client-deny rules under `cloudbase/security-rules/no-sql/`. Service
entries still re-check membership, role, activity/round/phase/controller epochs
inside the transaction; database rules are not treated as business auth.

`resumeActivity` returns one of `DELTA`, `SNAPSHOT_REQUIRED`, `SESSION_ENDED`,
or `RESYNC_REQUIRED`. Public `eventSeq` and per-round `canvasSeq` are recovery
cursors; `gameRevision` is not used as a guess/stroke cursor. Candidate words
and answers never enter public events/outbox or durable command results.

Every authenticated `resumeActivity` call first advances its own session when
the authoritative deadline is due. The global due-session scanner remains a
durability fallback for rooms whose clients disconnected: run it once per minute
from the CloudBase timer function, never from each realtime container instance.
It queries `{ status: 'active', deadlineAt <= now }` and submits the same fenced,
idempotent timeout command as the request path. Add an index for
`{ status, deadlineAt }` before production rollout.

## Optional Pictionary AI remix

AI remix is off unless both the browser and authority gates are enabled:

- Browser: `NUXT_PUBLIC_SAIER_FEATURE_AI_PICTIONARY=true`
- Authority breaker: `SAIER_AI_PICTIONARY_ENABLED=true`
- Authority allowlist: `SAIER_AI_PICTIONARY_ALLOWLIST=uid-1,uid-2` (`*` is only
  appropriate for an explicitly approved rollout)

The browser sends a cropped square reference image and one fixed effect id; it
cannot send a free-form prompt. The authority uses CloudBase
`HY-Image-v3.0-I2I-ToB-v1.0.1`, immediately copies the expiring provider result
to activity-scoped CloudBase storage, and persists only the resulting `fileId`
in canvas operations. A successful canvas patch consumes the round opportunity.
Failures and 45-second authority expiry refund it; results reaching reveal are
stored as a non-scoring bonus instead of mutating the final canvas.

## Deployment Sketch

Production backend gate status (2026-07-08):

- EnvId: `yunlefun-8g7ybcxc7345c490`
- Function: `saier-room-api`
- Runtime: `Nodejs18.15`
- Environment: `SAIER_ROOM_SHARE_ORIGIN=https://saier.yunle.fun`
- Play Pictionary bridge (server-only, disabled until the Play room gate is
  ready): `PLAY_GAME_SERVER_API_URL`, `PLAY_GAME_SERVER_REALTIME_URL`, and
  `SAIER_PICTIONARY_REALTIME_TOKEN`. The same token is configured only on the
  Saier function and `play-game-server`; it is never returned to the browser.
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

P13-07/P14 status (2026-07-15): source, rules and local tests are implemented,
but the new activity collections/indexes, realtime secret and CloudRun/Redis
resources are **not deployed by this change**. They require separate production
confirmation and the rollout gates in
`docs/design/tasks/P13-07-authoritative-realtime-activities.md`.

P13 v1 also uses `updatePresence` as a heartbeat. It updates member
`lastSeenAt`, `online`, and optional `presence` payload, then returns the
refreshed member list. Presence data is intentionally temporary; committed
operations remain the only durable painting state.

During the Pictionary migration, `createPictionaryPlayTicket` verifies current
Saier room membership and the active activity pointer, then sends the legacy v1
public/secret state to Play exactly once to establish compatible authority.
The returned browser credential is one-time and scoped to that `sessionId`.
`NUXT_PUBLIC_SAIER_FEATURE_PICTIONARY_PLAY_NATIVE` stays `false` until the Play
service, collections, index, and two-account smoke have passed. Only after the
new path is the sole producer of active games should the legacy
`saier-activity-deadlines` timer be removed.

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
    // CloudBase recommends 900 seconds for image generation. Keep 30 seconds
    // when the AI remix breaker is off; raise it before enabling the feature.
    timeout: 900,
  },
  functionRootPath: '/absolute/path/to/saier/cloudbase/functions',
})
```

Before production deployment, create the `saier_room_*` collections listed in
`cloudbase/security-rules/README.md`, apply client-deny security rules, create
the `{ status, deadlineAt }` game-session index, configure
`SAIER_REALTIME_ENV_ID` and `SAIER_REALTIME_TOKEN_SECRET`, and run the complete
P13-07/P14 real-account and leakage suite. Deploying these external resources is
intentionally separate from editing this repository.

The AI remix source is implemented but is likewise **not enabled or deployed by
this change**. Confirm model quota/billing, rotate any exposed management
credentials, set the server allowlist, raise the function timeout, and run a
real-account generation smoke before turning on either feature flag.
Apply a storage lifecycle rule (or scheduled cleanup) to
`room-storage/saier/*/activities/*/ai-remix/` before expanding beyond the
allowlisted preview, so generated images do not outlive the activity retention
policy indefinitely.

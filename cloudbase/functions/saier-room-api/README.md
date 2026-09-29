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
- `pictionary-ai-guardrails.cjs`: transactional daily budgets and allowlisted,
  identifier-hashed audit events for the optional image model path.

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
- `saier_room_ai_usage`

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
- Per-user UTC-day budget: `SAIER_AI_PICTIONARY_USER_DAILY_LIMIT=3`
- Environment-wide UTC-day budget: `SAIER_AI_PICTIONARY_GLOBAL_DAILY_LIMIT=30`

The browser sends a cropped square reference image and one fixed effect id; it
cannot send a free-form prompt. The authority defaults to CloudBase
`HY-Image-v3.0-I2I-ToB-v1.0.1` and also supports a Seedream adapter through a
CloudBase custom provider. It immediately copies the expiring provider result
to activity-scoped CloudBase storage, and persists only the resulting `fileId`
in canvas operations. A successful canvas patch consumes the round opportunity.
Failures and 45-second authority expiry refund it; results reaching reveal are
stored as a non-scoring bonus instead of mutating the final canvas.
The completion transaction persists an explicit `aiRemixOutcome` (`applied` or
`bonus`), including on deduplicated replies. Unrelated strokes must not turn a
late bonus into an applied result. An expired request may publish its bonus
without clearing a newer pending or applied remix in the same round.

The cost budget is deliberately separate from the gameplay opportunity. An
atomic `saier_room_ai_usage` transaction reserves both the hashed-user and
global counters immediately before the provider call. Provider failures still
count toward this budget, because they can incur cost, while the player's round
opportunity is refunded. Repeating the same `(session, user, request)` is
idempotent. Counters reset at `00:00 UTC`; setting either limit to `0` is a
fail-closed budget breaker. Counter rows carry `deleteAfter` for cleanup seven
days after their UTC budget day ends.

Audit output is a bounded JSON record prefixed with
`[saier-room-api] pictionary-ai`. It contains only fixed event/reason values,
hashed request/session/user identifiers, counts, effect id, outcome, and
latency. Do not add prompts, reference/generated images, answers, file ids,
provider responses, raw exceptions, or credentials to this record.

Create CloudBase log alerts before widening the allowlist:

- any `quota_unavailable` event is actionable;
- warn when `globalCount / globalLimit >= 0.8`, and stop rollout at `0.95`;
- alert when provider failures reach three in 15 minutes or exceed 20% with at
  least five attempts;
- alert when 15-minute generation p95 reaches 35 seconds, before the 45-second
  gameplay timeout.

### Third-party image-to-image trial

For the existing square-crop remix, the first adapter targets Volcengine Ark
**Seedream 5.0 Flash** (model
`doubao-seedream-5-0-flash-260915`). It uses a single reference image and returns
one 1024×1024 JPEG. This is crop-based image editing, not mask-based inpainting.

Configure a custom image provider in the CloudBase AI console:

- Provider identifier: for example, `custom-ark-image` (use the actual saved id).
- BaseURL: `https://ark.cn-beijing.volces.com/api/v3`.
- API Key: enter the Ark key only in the provider's credential field.
- Model: `doubao-seedream-5-0-flash-260915`; enable access in Ark first.

Then set these **server-only** function variables:

```dotenv
SAIER_AI_PICTIONARY_IMAGE_ADAPTER=seedream
SAIER_AI_PICTIONARY_IMAGE_PROVIDER=custom-ark-image
SAIER_AI_PICTIONARY_IMAGE_MODEL=doubao-seedream-5-0-flash-260915
```

The adapter explicitly routes `generateImageSubUrlConfig` to
`images/generations`, sends the validated PNG/JPEG as an `image` Data URL,
requests a URL response, and immediately persists it to CloudBase storage.
It leaves Ark's watermark setting at the provider default. The fixed effect
prompt, answer visibility, allowlist, usage budgets, failure refunds, and late
bonus handling remain shared. Browser input cannot choose the provider, model,
API path, or arbitrary generation parameters. There is no automatic retry or
fallback to another paid model.

These settings alone do not enable generation. Use the existing breaker and
single-account `1/1` budget for the first real smoke. Remove all three image
variables to restore the built-in Hunyuan adapter. Incomplete or unknown
configurations fail before a model call; they do not prevent other room APIs
from starting. Do not switch to Seedream 4.5 using this profile: its minimum
output area is larger than the fixed 1024×1024 request. Other models require
checking their input, size, output-format, and single-image behavior first.

Provider options checked on 2026-09-28:

| Provider                                                                                               | Fit for this feature                                                                | Published trial cost                                                                                                                            |
| ------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| [Volcengine Ark Seedream 5.0 Flash](https://docs.volcengine.com/docs/ark/image-generation-api?lang=zh) | JSON image-to-image; closest match to the existing synchronous SDK flow             | [¥0.12 per output image, input free](https://docs.volcengine.com/docs/ark/model-pricing?lang=zh)                                                |
| [Alibaba Cloud Qwen Image Edit Plus](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)      | Reference-image editing; requires a separate DashScope request/response adapter     | [Beijing ¥0.20 per image; eligible accounts have 100 free images with a 90-day validity](https://help.aliyun.com/zh/model-studio/model-pricing) |
| [Black Forest Labs FLUX.1 Fill](https://docs.bfl.ml/flux_tools/flux_1_fill)                            | Explicit image+mask inpainting; requires mask input and asynchronous result polling | Check provider billing before a trial                                                                                                           |

CloudBase's [third-party proxy documentation](https://docs.cloudbase.net/ai/quickstart/third-party-model)
supports this route. Local adapter tests verify the request shape and storage
handoff; provider credentials, upstream account access, gateway compatibility,
latency, and image quality still require a real call. No paid generation has
been performed for this adapter.

### ChatGPT handoff and local Codex

The Pictionary AI panel now includes **Continue in ChatGPT**. After selecting
an area, prepare the snapshot, download its PNG, copy the displayed editing
prompt, and open ChatGPT. The user uploads the image there manually. The link
is simply `https://chatgpt.com/`; no image, answer, room id, credential, or
prompt is embedded in a URL. Preparing a handoff makes no room API/model call
and reserves no generation budget. It is a snapshot, not a live export.

Changing the selection, effect, round, phase, or drawing permission invalidates
the prepared handoff, including a snapshot still being extracted. The entry
shares the existing browser feature and drawing-permission gates; it does not
enable AI for Play-owned sessions. Generated results stay in ChatGPT: there is
no automatic import into the authoritative round canvas. ChatGPT's image
capabilities depend on the user's plan and workspace. See the official
[image-generation guide](https://learn.chatgpt.com/docs/image-generation).

Local **Codex App Server** is now connected through a separate loopback
companion. It starts a dedicated ephemeral stdio task using the local Codex
login; the browser does not control existing desktop chats. Requirements:
Node.js 22.18+ (native TypeScript stripping), a `codex` executable on PATH,
and a signed-in account with image generation available.

```bash
codex login
pnpm dev:ai-remix
```

The default page origin is `http://localhost:8080` and the companion listens
only on `127.0.0.1:47832`. When using another site origin, set it explicitly:

```bash
SAIER_REMIX_ORIGIN=https://saier.yunle.fun pnpm dev:ai-remix
```

`SAIER_REMIX_PORT` can change the local port. Copy the terminal's temporary
pairing code into **Local Codex** in the AI panel. The code stays in page
memory and changes whenever the companion restarts. The browser may ask for
local-network permission. Keep the terminal running until generation finishes.

Select a crop and effect, generate, review the preview, then choose **Apply to
this round**. Generation sends only the selected 512×512 PNG and a fixed
effect. It uses the user's Codex usage allowance, not a CloudBase model call;
there is no automatic retry. The companion queries `model/list` and uses its
advertised default if the locally configured model is unavailable to the CLI
account. It never rewrites the user's global configuration. Both
`image_generation` and `code_mode_host` must remain enabled in the dedicated
process: disabling the latter also removes the image tool.

The endpoint enforces the exact Host/Origin, bearer pairing, one active job,
bounded input/output, and a 240-second deadline. Only fixed image edits are
exposed, not arbitrary RPC, prompts, models, commands or filesystem paths.
Shell, browser, plugins, configured MCP servers, hooks and other agent tools
are disabled or rejected. Cancellation interrupts the turn, terminates its
dedicated process, and removes the temporary input workspace. The browser
decodes the PNG/JPEG output and normalizes it to a 512×512 PNG before preview
or upload. Round, controller, permission, selection or effect changes discard
stale work. See the official [App Server protocol](https://learn.chatgpt.com/docs/app-server).

Applying is a separate CloudBase action, `importActivityLocalAiRemix`, enabled
only when both server variables are true:

```dotenv
SAIER_AI_PICTIONARY_ENABLED=true
SAIER_AI_PICTIONARY_LOCAL_IMPORT_ENABLED=true
```

It shares the allowlist, daily usage guardrail and one-remix-per-round limit
with hosted generation. Local generation itself does not reserve those
CloudBase counters or a round opportunity; applying does. The server checks
the authenticated drawer and the captured activity/round/phase/controller
epochs, validates PNG dimensions/size, uploads into its own storage namespace,
and publishes through the existing authoritative canvas flow. Clients never
patch only their local Painter. Races during upload use the existing bonus
handling. If import is disabled or fails while the selection remains current,
the generated preview remains downloadable. These two server flags do not
replace the existing browser AI feature gate or enable Play-owned sessions.

Verified on 2026-09-29 with `codex-cli 0.154.0`: a synthetic 512px apple crop
produced one textured square PNG in about 41 seconds. The initial configured
`gpt-6-sol` was rejected by the CLI account; the advertised default
`gpt-6-astra` succeeded after restoring the Code Mode Host. This verifies one
local generation, not production CloudBase upload or multiplayer deployment.
The local-import flag remains off in production. CloudBase provider trials
and local Codex usage are separate.

### Production code deployment (2026-09-29)

The updated `saier-room-api`, including local image import and guarded provider
adapters, is deployed to `yunlefun-8g7ybcxc7345c490`. The function is `Active`
on `Nodejs18.15`; its existing environment and 30-second timeout are preserved.
A management smoke invocation of `importActivityLocalAiRemix` rejects an
unauthenticated caller with `not_authenticated`.

Production `saier.yunle.fun` uses EdgeOne Pages with Play-native Pictionary and
private assets enabled. AI remix and local import remain off: the implemented
import authority is CloudBase, while current production game sessions belong
to Play. Enabling a browser flag alone does not provide Play-side image import.
The local companion remains a separately started process on the user's machine.
No hosted model generation was requested during deployment.

### Production AI preflight (2026-09-28)

Verified against `yunlefun-8g7ybcxc7345c490` in `ap-shanghai`:

- Created `saier_room_ai_usage` and read back its `CUSTOM` rule:
  `{ "read": false, "create": false, "update": false, "delete": false }`.
- The registry confirms `ylf_test_saier_owner` is active, with UID
  `2074792729263353858`, for the proposed single-user smoke.
- `saier-room-api` is active on `Nodejs18.15` with a 30-second timeout. No
  `SAIER_AI_PICTIONARY_*` environment variables are set. This preflight did not
  deploy code, update function configuration, or enable generation.
- `DescribeAIModels` reports the `hunyuan-image` group enabled and includes
  `HY-Image-v3.0-I2I-ToB-v1.0.1`; the managed catalog also lists this model, but
  does not return a price for it. Model enablement alone does not prove quota.
- `DescribeActivityInfo` returned no growth-plan attendance records.
  `DescribeEnvPostpayPackage` returned expired Token packages and an active
  10,000-point `CREDITS` package, with no image-generation package. This is a
  provider-resource check, not a check of YunLeFun users' AI-point balances.

The current built-in `hunyuan-image`
[SDK prerequisites](https://docs.cloudbase.net/ai/image-model/node-sdk)
require growth-plan image resources. The [growth-plan FAQ](https://docs.cloudbase.net/ai/ai-inspire-plan)
states that normal CloudBase plan resources do not cover image generation and
that image resource packs are not currently sold separately. Do not treat
ordinary resource points or a generic Token package as image quota, or advise
purchasing one as a verified fix. Confirm eligible image resources for this
environment before testing the built-in provider.

This quota restriction does not block CloudBase's
[third-party image-model proxy](https://docs.cloudbase.net/ai/quickstart/third-party-model).
A custom provider can register its BaseURL and API Key in CloudBase and be
called through `createImageModel(provider)`. `generateImageSubUrlConfig` supports
provider/model-specific API subpaths. The upstream provider supplies the model
quota; this route does not require growth-plan image resources. The Seedream
adapter above now provides server-side provider/model configuration and maps
the provider's reference-image request and image-response formats. Proxy support
alone does not prove that a particular model supports image-to-image editing.

Credential rotation remains unconfirmed. Deployment, the `1/1` budgets and
single-user allowlist, timeout change, audit alerts, storage cleanup policy,
and real generation verification remain pending. No model call was made.

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
`room-storage/saier/*/activities/*/ai-remix/` before the smoke. Generated remix
objects must be deleted no later than two days after creation, keeping storage
close to the activity authority's 24-hour retention while allowing for
day-granularity lifecycle evaluation. Cleanup must be prefix-scoped and must
not match room snapshots outside `ai-remix/`.

The real-account smoke remains an external, paid operation. Run it only after
the collection/rule, 900-second function timeout, explicit single-user
allowlist, daily budgets, log alerts, storage lifecycle, and credential rotation
are all verified. Start with both daily limits set to `1`; assert one generated
object is copied to the `ai-remix/` prefix, one canvas patch or late bonus is
recorded, no sensitive audit field appears, a second request is rejected, and
the breaker can be returned to `false` immediately afterward.

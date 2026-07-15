---
title: P13-07 / P14 · Authoritative realtime activities
---

# P13-07 / P14 · 权威实时 Activity 与 Pictionary

- **Depends on**: P13-00..06, P8 stroke recording, YunLeFun auth
- **Local implementation**: complete
- **Production rollout**: gated; not deployed by this change

## Delivered locally

- [x] `@saier/collaboration` private package：protocol、Activity extension facade、固定 ActivityDocument、Pictionary normalization/score/test vectors。
- [x] Room metadata 兼容读写 `collaborationMode ?? mode`，activity pointer 使用独立 `roomMetadataRevision + activityEpoch`。
- [x] Painter scoped `stroke:committed` / `stroke:preview`，site collaboration 移除 `recordStrokePatch` monkey-patch。
- [x] CloudBase authority：projection、secret、event、dedupe、outbox 与 canvas operation 统一事务；HTTP/WS 共用 command service。
- [x] `eventSeq/canvasSeq` 恢复、snapshot/delta/resync/private projection、5 秒 watermark 和 outbox publisher。
- [x] NoSQL deadline scanner、phase/round/controller fencing、Redis acceleration index rebuild。
- [x] WebSocket gateway：5 秒 pre-auth、15 分钟 token + reauth、Origin/连接配额、10 秒 ping、背压、preview 校验、graceful drain。
- [x] 轻量 activity room 和 Pictionary 创建/加入、lobby、choosing/drawing/reveal/score、guess privacy、controller takeover UI。
- [x] 根界面按查询参数和 manifest registry 按需加载第一方 Activity 插件；Activity 使用独立临时 workspace tab，切回工程保持房间会话，关闭 tab 时清除 Painter、poll/realtime 和 session state；普通绘画不实例化插件资源，旧房间 URL 兼容跳转。
- [x] Activity preview 与 committed stroke 同步颜色、可调笔径和 pressure metadata；服务端校验 1–128 的 preview/commit 笔径。
- [x] 独立 feature flags；HTTP/polling authority 不依赖 realtime flag。
- [x] client-deny rules、事务/并发/泄密/worker/gateway/protocol 单测。

## Production rollout gates

以下是外部资源或生产操作，必须单独确认后执行：

- [ ] 在 `yunlefun-8g7ybcxc7345c490` 创建 activity collections、索引并应用 client-deny rules。
- [ ] 配置 `SAIER_REALTIME_TOKEN_SECRET`、上海 VPC 高可用 Redis、安全组和 CloudRun 连接。
- [ ] 部署至少两个 `saier-realtime` 常驻实例，验证 readiness、1012 drain、新旧协议窗口和 Redis 故障恢复。
- [ ] 运行完整整局浏览器矩阵、答案泄露扫描、Chrome/Edge/Safari eraser replay/hash。
- [ ] 执行 100 rooms × 12 sockets × 20 preview/s 的 10 分钟容量测试，并满足 roadmap 指标。
- [ ] 按 flags off → shadow committed → internal Pictionary → preview → ordinary-room canary 顺序启用。

## Verification commands

```bash
pnpm -C packages/saier build
pnpm -C packages/collaboration build
pnpm -C site typecheck
pnpm check:cloudbase
pnpm vitest run \
  test/activity-protocol.test.ts \
  test/pictionary-reducer.test.ts \
  test/activity-workers.test.ts \
  test/realtime-gateway-core.test.ts \
  test/saier-room-api.test.ts \
  test/cloudbase-security-rules.test.ts \
  packages/saier/test/stroke-recording.browser.spec.ts
```

## Non-goals

v1 不开放第三方 SDK，也不把 TypeScript facade 宣称为恶意代码沙箱。游客、语音、全球匹配、离线多人合并和 Redis Streams 不在本阶段。

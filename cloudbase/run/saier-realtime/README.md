# saier-realtime

CloudBase Run WebSocket gateway for room Activities. It is a latency layer over
the `saier-room-api` authority, not a second source of truth.

## Responsibilities

- Authenticate within five seconds using an in-band 15-minute JWT; tokens never
  appear in the URL and are re-authenticated before expiry.
- Enforce Origin, pre-auth/IP and per-user room connection limits.
- Route authoritative commands through the same transaction command service as
  HTTP fallback.
- Publish committed outbox invalidations and ephemeral preview/presence over
  Redis Pub/Sub; send a durable watermark every five seconds.
- Run the NoSQL due-session scan even when the Redis deadline index is stale.
- Bound outbound queues, discard preview first, and close slow committed-event
  consumers with a resync-required code.
- Mark readiness false and close sockets with code `1012` during a graceful
  deployment drain.

## Environment

| Variable                           | Required | Purpose                                                                 |
| ---------------------------------- | -------- | ----------------------------------------------------------------------- |
| `TCB_ENV_ID` or `CLOUDBASE_ENV_ID` | yes      | CloudBase environment (`yunlefun-8g7ybcxc7345c490`)                     |
| `SAIER_REALTIME_TOKEN_SECRET`      | yes      | HS256 key shared with `saier-room-api`                                  |
| `REDIS_URL`                        | yes      | Shanghai VPC high-availability Redis URL                                |
| `SAIER_REALTIME_ALLOWED_ORIGINS`   | no       | Comma-separated Origin allowlist; defaults to `https://saier.yunle.fun` |
| `PORT`                             | no       | HTTP/WS port; defaults to `8080`                                        |

The Event Function also needs `SAIER_REALTIME_ENV_ID` and the same token secret.
Never expose the secret through Nuxt public runtime config.

## Local checks

```bash
npm install
npm run check
```

The image copies the authority modules from `cloudbase/functions/saier-room-api`
so HTTP and WebSocket cannot drift into separate reducers or repositories.

## Production gate

Do not turn on realtime flags merely because the container starts. Production
requires all of the following:

1. CloudBase Run and high-availability Redis in `ap-shanghai`, in the same VPC
   with verified security groups and reconnect behavior.
2. At least two always-on gateway instances, readiness probes on `/readyz`, and
   rolling-deployment drain verification.
3. The client-deny activity collections/indexes and shared token secret.
4. Redis failure across a complete drawing deadline, outbox crash windows,
   reconnect storm, slow-consumer and 100-room capacity tests.
5. Flags enabled in order: all off, committed shadow, internal Pictionary,
   preview, then ordinary-room canary.

No resource creation or production deployment is performed by the repository
implementation itself.

# Multi-region probes

Uptimer can collect observations from independent network viewpoints while keeping
**Cloudflare D1 as the single source of truth**.

```text
Mainland scheduler (5 min)
  -> EdgeOne Edge Function (mainland edge node)
     -> GET  /api/v1/probe/config
     -> probe targets directly
     -> POST /api/v1/probe/ingest

Cloudflare Cron (1 min)
  -> existing Worker scheduler (probe_mode = 'worker')
     or Durable Object shards later (probe_mode = 'multi_region')

Both -> D1 (check_results / monitor_probe_state / monitor_state)
     -> public snapshots -> status page
     -> webhooks / Resend
```

## Data model

| Table                 | Purpose                                                                        |
| --------------------- | ------------------------------------------------------------------------------ |
| `probes`              | Probe registry: kind, scope, region, token hash, required flag, config version |
| `probe_batches`       | Batch idempotency (`probe_id`, `batch_id`)                                     |
| `monitor_probe_state` | Per-probe state machine and streaks                                            |
| `probe_check_results` | Raw per-region observations                                                    |
| `check_results`       | **Aggregated timeline**: one row per monitor per evaluation                    |
| `monitors.probe_mode` | `worker` (existing cron) or `multi_region` (probe ingest)                      |

`probe_mode` defaults to `worker`, so existing deployments keep their current behaviour until a
monitor is explicitly switched.

## Aggregation

- Operator states (`paused`, `maintenance`) are never overridden.
- Enabled, compatible required probes drive the global state; optional probe success cannot mask required failures.
- At least three failed required probes confirm `down` when three or more are configured. With one or two required probes, all must fail.
- Probes that have never reported still count as required locations, preventing a partial rollout from creating false positives.
- Without a failure quorum, a fresh successful required probe reports `up`.
- Stale required probes keep the established state instead of flapping when there is no failure quorum or successful required probe.
- Freshness is `max(3 × interval_sec, 300s)`, capped at one hour.
- Outages and notifications follow global transitions only.

## Probe API

Probe tokens (`Authorization: Bearer upt_probe_...`) are separate from the admin token.

- `GET /api/v1/probe/config` — monitor assignment plus `config_revision`.
- `POST /api/v1/probe/ingest` — up to 64 results per batch, idempotent by `batch_id`.

## Admin

- UI: `/admin/probes` (linked from the admin header) - create probes, toggle enabled/required,
  rotate tokens, bump config version, delete, and switch a monitor between `worker` and
  `multi_region`.
- API: `GET/POST /api/v1/admin/probes`, `PATCH /api/v1/admin/probes/:id`,
  `POST /api/v1/admin/probes/:id/rotate-token`, `POST /api/v1/admin/probes/:id/bump-config`,
  `DELETE /api/v1/admin/probes/:id`.

Probe health is evaluated every minute using the latest heartbeat and `offline_after_sec`
(default 900, range 60–86400 seconds). New or re-enabled probes have a grace period; disabled
probes do not alert. Config requests, result reports, and idle overseas shards update the heartbeat.

The analytics page shows regional average latency and check success rate, plus counts of successful,
failed, and unknown checks. Success rate is `up / (up + down)` and excludes unknown results. Missing
buckets remain gaps. Raw probe history follows `retention_check_results_days`.

Transitions emit `probe.offline` and `probe.online` through configured Webhook and Telegram channels.
Add these events to `enabled_events` when a channel uses an explicit event whitelist. Failed deliveries
are retried after at least 120 seconds for up to 24 hours; delivery may be repeated after network or
process failures, so consumers should deduplicate by `event_id`.

## Overseas Durable Object shards

Enabled by `UPTIMER_DO_PROBES = "1"` plus a registered probe (default id `cf-do`,
`kind = durable_object`). `UPTIMER_DO_SHARD_COUNT` (1-8) controls the shard count.

- Deterministic sharding: `monitor id % shard_count`, so each monitor is probed by exactly one
  shard per interval.
- Only `probe_mode = 'multi_region'` monitors are touched, so the in-Worker cron is unaffected.
- Each shard probes only what is due for that probe (`monitor_probe_state.last_checked_at`).
- Results go through the same aggregation core as the HTTP ingest path.
- `locationHint` is best-effort and only applies at creation; a shard is not a pinned city.

See `probes/edgeone/README.md` for the mainland probe deployment.

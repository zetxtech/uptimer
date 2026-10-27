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

| Table                                 | Purpose                                                                        |
| ------------------------------------- | ------------------------------------------------------------------------------ |
| `probes`                              | Probe registry: kind, scope, region, token hash, required flag, config version |
| `probe_batches`                       | Batch idempotency (`probe_id`, `batch_id`)                                     |
| `monitor_probe_state`                 | Per-probe state machine and streaks                                            |
| `monitors.probe_mode`                 | `worker` (existing cron) or `multi_region` (probe ingest)                      |
| `check_results.probe_id` / `batch_id` | Result provenance                                                              |

`probe_mode` defaults to `worker`, so existing deployments keep their current behaviour until a
monitor is explicitly switched.

## Aggregation

- Operator states (`paused`, `maintenance`) are never overridden.
- Any fresh required probe reporting `up` keeps the monitor `up`.
- `down` requires **all** required probes to report a fresh `down`.
- Mixed `down` / `unknown` without any `up` becomes `unknown` (regional issue, not global outage).
- Stale required probes keep the established state instead of flapping.
- Freshness is `max(3 × interval_sec, 300s)`, capped at one hour.
- Outages and notifications follow global transitions only.

## Probe API

Probe tokens (`Authorization: Bearer upt_probe_...`) are separate from the admin token.

- `GET /api/v1/probe/config` — monitor assignment plus `config_revision`.
- `POST /api/v1/probe/ingest` — up to 64 results per batch, idempotent by `batch_id`.

## Admin API

- `GET/POST /api/v1/admin/probes`
- `PATCH /api/v1/admin/probes/:id`
- `POST /api/v1/admin/probes/:id/rotate-token`
- `POST /api/v1/admin/probes/:id/bump-config`
- `DELETE /api/v1/admin/probes/:id`

Switch a monitor with `PATCH /api/v1/admin/monitors/:id` and `{"probe_mode":"multi_region"}`.

See `probes/edgeone/README.md` for the mainland probe deployment.

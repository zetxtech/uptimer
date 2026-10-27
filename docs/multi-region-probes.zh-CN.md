# 多区域探测（国内 + 海外）

本文描述 Uptimer 的多区域探测实现：**Cloudflare D1 是唯一权威库**，国内与海外探针只负责观测和上报。

## 1. 结构

```text
国内定时器 (5 min)
  -> EdgeOne Edge Function（国内边缘节点）
     -> GET  /api/v1/probe/config
     -> 直接探测目标站点
     -> POST /api/v1/probe/ingest

Cloudflare Cron (1 min)
  -> 现有 Worker 调度器（probe_mode = 'worker'）
     或后续的 Durable Object 分片（probe_mode = 'multi_region'）

两条链路 -> D1（check_results / monitor_probe_state / monitor_state）
         -> 公共状态快照 -> 状态页
         -> Webhook / 后续 Resend
```

关键点：

- 国内探测由 EdgeOne 边缘节点发起，不是由一台服务器转发后再探测。
- Edge Functions 在离调用方最近的边缘节点执行，因此**触发源必须在国内**；需要固定城市时改用 EdgeOne Cloud Functions 并设置 `mainlandRegions`。
- Durable Object 的 `locationHint` 只是尽力而为且仅首次创建生效，不能当作“固定城市探针”。

## 2. 数据模型

| 表                    | 作用                                                              |
| --------------------- | ----------------------------------------------------------------- |
| `probes`              | 探针注册：id、kind、scope、region、token 哈希、是否必需、配置版本 |
| `probe_batches`       | 批次幂等：同一 `(probe_id, batch_id)` 只处理一次                  |
| `monitor_probe_state` | 每个探针各自的连续失败/成功计数与状态                             |
| `probe_check_results` | 每个探针的原始观测明细（区域维度）                                |
| `check_results`       | **聚合时间线**：每个监控每次评估一行，历史查询无需按探针过滤      |
| `monitors.probe_mode` | `worker`（现有 Cron）或 `multi_region`（探针上报）                |

`monitors.probe_mode` 默认 `worker`，升级后现有行为完全不变。切换某个监控到多区域模式后，Worker Cron 不再处理它，改由探针上报驱动。

## 3. 状态聚合策略

1. 每个探针先跑自己的状态机（阈值来自 `settings.state_failures_to_down_from_up` / `state_successes_to_up_from_down`），并做乱序保护。
2. 聚合到 `monitor_state`：
   - `paused` / `maintenance` 不被探针覆盖。
   - 任一必需探针新鲜结果为 `up` → 全局 `up`。
   - 只有**所有必需探针**新鲜结果都为 `down` → 全局 `down`。
   - 混合 `down` / `unknown` 且没有任何 `up` → `unknown`（区域异常，不是全局故障）。
   - 必需探针结果过期 → 保持既有 `up` / `down`，避免探针掉线引发误报。
3. 结果新鲜度：`max(3 × interval_sec, 300s)`，上限 3600s。
4. 只有全局状态变化才写 `outages` 并触发通知；区域级故障不直接告警。

## 3.1 历史数据口径

国内与海外的结果**不会混在同一张历史表里**：

- `check_results` 只写聚合后的那条结果（状态、延迟、错误都来自最新区域观测）。因此首页、状态页、每日汇总(`monitor_daily_rollups`)、管理端分析、CSV 导出全部保持单一序列，不需要改任何查询。
- `probe_check_results` 保存每个探针的原始结果，供后续做按区域的历史曲线。
- 区域级状态机仍在 `monitor_probe_state`，用来看某个探针是否正常上报。

## 4. 探针 API

所有探针接口使用**探针 token**（`Authorization: Bearer upt_probe_...`），不能使用管理员 token。

### `GET /api/v1/probe/config`

返回该探针可见的 `probe_mode = 'multi_region'` 且启用的监控。`kind = 'edgeone'` 只返回 HTTP 监控（边缘函数没有原始 TCP socket）。

响应包含 `config_revision`（`config_version:max(updated_at)`），探针可据此判断配置是否变化。

### `POST /api/v1/probe/ingest`

```json
{
  "probe_id": "edgeone-cn-gz",
  "batch_id": "edgeone-cn-gz-6f1c...",
  "sent_at": 1800000000,
  "results": [
    {
      "monitor_id": 1,
      "checked_at": 1800000000,
      "status": "up",
      "latency_ms": 123,
      "http_status": 200,
      "error": null,
      "attempts": 1
    }
  ]
}
```

约束：

- 单批最多 64 条，请求体上限 256 KiB。
- `checked_at` 超过当前时间 +5 分钟或早于 1 小时会被拒绝。
- 同一 `batch_id` 重试返回 `duplicate: true`，不会重复计数；若上报处理失败，请使用新的 `batch_id` 重报。
- 不在 `multi_region` 模式或不属于该探针的监控会被计入 `rejected`。

## 5. 管理端

页面：`/admin/probes`（管理后台头部入口），可以创建探针、启停、切换必需标记、轮换 token、递增配置版本、删除，并把监控在 `worker` 与 `multi_region` 之间切换。

管理端 API（需要脚本化时）：

| 方法     | 路径                                    | 说明                         |
| -------- | --------------------------------------- | ---------------------------- |
| `GET`    | `/api/v1/admin/probes`                  | 探针列表与最近上报时间       |
| `POST`   | `/api/v1/admin/probes`                  | 创建探针，返回一次性 token   |
| `PATCH`  | `/api/v1/admin/probes/:id`              | 改名、启停、是否必需、region |
| `POST`   | `/api/v1/admin/probes/:id/rotate-token` | 轮换 token                   |
| `POST`   | `/api/v1/admin/probes/:id/bump-config`  | 递增配置版本                 |
| `DELETE` | `/api/v1/admin/probes/:id`              | 删除探针及其区域状态         |

监控切换：`PATCH /api/v1/admin/monitors/:id`，body `{ "probe_mode": "multi_region" }`。

## 6. 部署步骤

1. 应用迁移：

```bash
cd apps/worker
pnpm migrate:local   # 本地
# 生产：wrangler d1 migrations apply uptimer --remote
```

2. 创建国内探针并保存一次性 token（也可在 `/admin/probes` 页面创建）。
3. 部署 `probes/edgeone` 到 EdgeOne，配置环境变量（见该目录 README）。
4. 国内定时器每 5 分钟触发一次 EdgeOne 函数。
5. 将需要国内视角的监控切换为 `probe_mode = "multi_region"`。
6. 海外侧二选一：
   - 继续用现有 Cloudflare Cron（`probe_mode = "worker"`）；
   - 或启用 Durable Object 分片：先注册一个海外探针（如 `cf-do`，kind 用 `durable_object`），再在 `wrangler.toml` 设置 `UPTIMER_DO_PROBES = "1"`、`UPTIMER_DO_PROBE_ID = "cf-do"`、按需设置 `UPTIMER_DO_SHARD_COUNT`（1-8）。

## 6.1 海外 DO 分片

- `ProbeShard` 按 `monitor id % shard_count` 确定性分片，每个监控每个周期只由一个分片探测。
- 分片只处理 `probe_mode = 'multi_region'` 的监控，与现有 Cron 完全隔离，默认关闭。
- 每个分片只探测自己“到期”的监控（依据 `monitor_probe_state` 中本探针的 `last_checked_at` 与 `interval_sec`）。
- 探测结果走同一个聚合核心，与 EdgeOne 上报共享状态机与幂等逻辑。
- `locationHint` 是尽力而为且仅首次创建生效，不能当作“固定城市探针”。

## 7. 运维注意

- 探针 token 只存 SHA-256，丢失后只能轮换。
- `GET /probe/config` 会返回监控的自定义 Headers/Body，务必只走 HTTPS，且不要把探针 token 放进前端或日志。
- 公共状态页快照在全局状态变化后通过 guard version 失效，由下一次 Cron（≤60 秒）重建。
- `probe_batches` 每个探针每 5 分钟约新增 1 行，可按需定期清理。
- 免费 Worker 的 CPU 预算约束仍然适用；探针上报路径没有引入大规模快照计算。

## 8. 已完成与后续

已完成：多区域数据面（上报、区域状态机、聚合）、EdgeOne 国内探针、海外 Durable Object 分片、历史数据口径拆分（`check_results` 聚合 + `probe_check_results` 区域明细）、保留策略同步清理、管理端探针页面。

后续可做：

- **按区域的历史曲线**：前端目前只展示聚合时间线；`probe_check_results` 已经就位，可加区域对比图。
- **DO 分片的生产验证**：启用前建议先在一个监控上验证分片分配与到期判断。
- **探针离线告警**：目前只在 `probes` 页面展示 `last_seen_at` / `last_result_at`，可接入通知事件。

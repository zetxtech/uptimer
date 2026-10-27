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

| 表                                    | 作用                                                              |
| ------------------------------------- | ----------------------------------------------------------------- |
| `probes`                              | 探针注册：id、kind、scope、region、token 哈希、是否必需、配置版本 |
| `probe_batches`                       | 批次幂等：同一 `(probe_id, batch_id)` 只处理一次                  |
| `monitor_probe_state`                 | 每个探针各自的连续失败/成功计数与状态                             |
| `monitors.probe_mode`                 | `worker`（现有 Cron）或 `multi_region`（探针上报）                |
| `check_results.probe_id` / `batch_id` | 结果来源与批次追踪                                                |

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

## 5. 管理端 API

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

2. 创建国内探针并保存一次性 token。
3. 部署 `probes/edgeone` 到 EdgeOne，配置环境变量（见该目录 README）。
4. 国内定时器每 5 分钟触发一次 EdgeOne 函数。
5. 将需要国内视角的监控切换为 `probe_mode = "multi_region"`。
6. 海外侧可暂时继续使用现有 Cloudflare Cron（`probe_mode = "worker"`），或再注册一个海外探针。

## 7. 运维注意

- 探针 token 只存 SHA-256，丢失后只能轮换。
- `GET /probe/config` 会返回监控的自定义 Headers/Body，务必只走 HTTPS，且不要把探针 token 放进前端或日志。
- 公共状态页快照在全局状态变化后通过 guard version 失效，由下一次 Cron（≤60 秒）重建。
- `probe_batches` 每个探针每 5 分钟约新增 1 行，可按需定期清理。
- 免费 Worker 的 CPU 预算约束仍然适用；探针上报路径没有引入大规模快照计算。

## 8. 已知限制（下一阶段）

- **每日统计与历史图表尚未区分探针**：`monitor_daily_rollups` 与公共历史查询直接聚合 `check_results`，多区域监控会同时计入国内与海外结果，检查次数、可用率和延迟分位数会被混合。当前状态页的“当前状态”来自聚合后的 `monitor_state`，不受影响；历史图表需在下一阶段引入“主探针（primary probe）”或按区域拆分后再展示。
- **海外 DO 分片尚未接入**：当前海外侧仍由现有 Worker Cron（`probe_mode = 'worker'`）承担。Durable Object 版本应复用同一套 `probe/ingest` 数据面，只替换“谁来执行探测”，不需要再改状态聚合逻辑。
- **管理端暂无探针管理界面**：当前通过 `/api/v1/admin/probes` 管理探针，前端页面可在后续迭代补充。

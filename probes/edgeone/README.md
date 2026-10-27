# Uptimer mainland probe (EdgeOne)

国内探测侧的最小实现：由国内定时器触发 EdgeOne 边缘函数，函数在**国内边缘节点**直接探测目标，并把结果批量回传 Cloudflare Worker，写入 D1。

```text
国内定时器 (5 min)
   -> EdgeOne Edge Function (国内边缘节点)
      -> GET  /api/v1/probe/config
      -> 并发探测目标站点
      -> POST /api/v1/probe/ingest  ->  Cloudflare Worker -> D1
```

## 为什么不是“EdgeOne 调服务器、服务器再探测”

如果 EdgeOne 只是转发请求给一台服务器、由服务器执行 `fetch`，测到的是那台服务器的网络。当前实现让 EdgeOne 函数自己发起探测，得到的才是 EdgeOne 国内边缘节点的视角。

Edge Functions 在离**调用方**最近的边缘节点执行，所以触发源必须位于国内。如果需要固定城市，请把同一份逻辑部署为 EdgeOne Cloud Functions，并在 `edgeone.json` 中设置 `mainlandRegions: ["ap-guangzhou"]`。

## 部署

1. 以 `probes/edgeone` 作为 EdgeOne Makers 项目根目录（函数入口为 `edge-functions/api/probe.js`）。
2. 在控制台配置环境变量：

| 变量                                 | 必填 | 说明                                                    |
| ------------------------------------ | ---- | ------------------------------------------------------- |
| `UPTIMER_API_BASE_URL`               | 是   | Worker 地址，例如 `https://uptimer.example.workers.dev` |
| `UPTIMER_PROBE_TOKEN`                | 是   | 管理端创建探针时一次性返回的 token                      |
| `UPTIMER_PROBE_ID`                   | 是   | 探针 id，例如 `edgeone-cn-gz`                           |
| `UPTIMER_PROBE_TRIGGER_SECRET`       | 建议 | 外部定时器调用时需带 `x-uptimer-trigger` 头             |
| `UPTIMER_PROBE_CONCURRENCY`          | 否   | 单次并发数，默认 `16`                                   |
| `UPTIMER_PROBE_MAX_MONITORS_PER_RUN` | 否   | 单次最多探测数，默认 `64`；超出时按 5 分钟时间片轮转    |

3. 用任意国内定时器（云厂商计划任务、K8s CronJob、一台小服务器）每 5 分钟请求一次函数 URL：

```bash
curl -fsS -X POST 'https://<your-edgeone-domain>/api/probe' \
  -H "x-uptimer-trigger: $UPTIMER_PROBE_TRIGGER_SECRET"
```

## 在 Uptimer 侧启用

1. 创建探针（返回的 `token` 只显示一次）：

```bash
curl -fsS -X POST "$UPTIMER/api/v1/admin/probes" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"id":"edgeone-cn-gz","name":"EdgeOne 广州","kind":"edgeone","scope":"domestic","region":"cn-gz"}'
```

2. 把需要国内视角的监控切到多区域模式：

```bash
curl -fsS -X PATCH "$UPTIMER/api/v1/admin/monitors/1" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"probe_mode":"multi_region"}'
```

3. 海外侧保持 `probe_mode="worker"`（现有 Cloudflare Cron），或再注册一个海外探针并同样切到 `multi_region`。

## 判定规则

- 每个探针独立跑状态机（连续失败/成功阈值、乱序保护），互不覆盖。
- 任一必需探针报告 `up` → 全局 `up`。
- 只有**所有必需探针**都报告 `down` 才判定全局 `down`；单个区域失败属于区域异常。
- 必需探针结果过期时保持既有状态，不会因为某个探针掉线而误报全局故障。

## 限制

- Edge Functions 不支持原始 TCP socket，因此 `kind="edgeone"` 的探针只会收到 HTTP 监控配置。
- 函数返回体只用于运维排查；探测数据以 ingest 响应为准。
- 同一 `batch_id` 重试是幂等的，不会重复计数；如果上报处理失败，请用**新的** `batch_id` 重新上报。

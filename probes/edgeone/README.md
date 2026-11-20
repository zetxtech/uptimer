# Uptimer 国内 EdgeOne 探针

这是 Uptimer 的独立 EdgeOne Makers 部署项目。HTTP 请求由 **EdgeOne 的中国大陆边缘节点直接发出**，检测结果通过 Uptimer Worker 的探针 API 写入 D1。此目录不需要构建整个 Uptimer 前端或 Worker。

## 在 Makers 中从 Git 仓库创建项目

打开 [EdgeOne Makers](https://edgeone.ai/pages)，选择 `zetxtech/uptimer` 仓库，并填写：

| 字段 | 填写值 |
| --- | --- |
| 项目名称 | `uptimer-cn-probe` |
| 加速区域 | **中国大陆可用区**（或全球可用区，含中国大陆） |
| 生产分支 | `makers/edgeone-probe` |
| 框架预设 | `Other` |
| 根目录 | `probes/edgeone` |
| 输出目录 | `dist` |
| 构建命令 | `npm run build` |
| 安装命令 | `true` |

构建参数也记录在目录下的 `edgeone.json` 中。没有外部依赖，`npm run build` 仅生成静态检查首页。Edge Function 在 `edge-functions/api/probe.js`，自动映射到 `POST /api/probe`；健康检查在 `GET /api/health`。

**区域选择很重要。**「全球可用区（不含中国大陆）」不会分配中国大陆节点，因此不能用于国内网络探测。中国大陆/全球（含中国大陆）加速区使用自定义域名时需完成 ICP 备案。Makers 默认项目域名在大陆访问受到预览链接时间限制，因此定时触发应使用备案且已绑定的稳定自定义域名。Edge Functions 通常在靠近请求发起方的节点执行，固定特定城市需要另一种部署架构；`edgeone-cn` 表示中国大陆视角，不保证广州节点。

## 环境变量

在 Makers 创建项目时填写以下变量；密钥只填写在 Makers 环境变量设置中，不要提交到仓库。

| 变量名 | 示例/填写方法 | 必填 |
| --- | --- | --- |
| `UPTIMER_API_BASE_URL` | Uptimer Worker 可从大陆 EdgeOne 节点访问的 HTTPS API 地址（不要在末尾加 `/api/v1`） | 是 |
| `UPTIMER_PROBE_ID` | `edgeone-cn`，与 Uptimer 后台注册的探针 ID 相同 | 是 |
| `UPTIMER_PROBE_TOKEN` | Uptimer 后台创建探针时返回的一次性 Token | 是 |
| `UPTIMER_PROBE_TRIGGER_SECRET` | 自行生成的随机密钥，仅国内定时器携带 | 是 |
| `UPTIMER_PROBE_CONCURRENCY` | `8`，并发探测数量（默认 16） | 否 |
| `UPTIMER_PROBE_MAX_MONITORS_PER_RUN` | `32`，每次最多探测数量（默认 64，上限 64） | 否 |

`UPTIMER_PROBE_TOKEN` 与 `UPTIMER_PROBE_TRIGGER_SECRET` 是两种不同密钥。前者用于 EdgeOne 访问 Uptimer API，后者仅用于防止未授权的外部请求启动探测。

## 启动探测

1. 先将 Uptimer Worker 和 D1 更新至包含 `0015_probe_regions.sql` 及后续探针迁移的版本，否则探针管理 API 不可用。
2. 在 Uptimer 后台 `/admin/probes` 创建探针：ID `edgeone-cn`、类型 `edgeone`、Scope `domestic`、Region `cn`，保存一次性 Token 到 Makers 环境变量。
3. 将需要国内视角的 HTTP 监控配置为 `probe_mode=multi_region`。EdgeOne Edge Functions 不支持原始 TCP socket，因此这里只接收 HTTP 监控。
4. 在 Makers 的项目生产环境完成部署、配置环境变量，并绑定适用于大陆访问的自定义域名。
5. 在**中国大陆网络**上的定时任务每分钟向 `https://<edgeone-domain>/api/probe` 发送一次 POST 请求，并带上 `x-uptimer-trigger` 请求头；不要使用海外 GitHub Actions 作为触发源。
6. 在 Uptimer 的探针列表查看 `last_seen_at`、`last_result_at`、探针状态和区域延迟；若探针有正常心跳但无探测结果，请检查监控是否已分配到 `multi_region`。

部署后先打开 `https://<edgeone-domain>/api/health`，应返回 `{"ok":true,"configured":true,...}`。这只验证边缘函数已经运行且环境变量已配置；真正的数据链路以 POST 接口成功和 Uptimer 后台收到探测结果为准。

国内定时触发示例：

```sh
curl -fsS -X POST 'https://<edgeone-domain>/api/probe' -H "x-uptimer-trigger: $UPTIMER_PROBE_TRIGGER_SECRET"
```

## 本地校验

在 `probes/edgeone` 下：

```sh
npm run build
npm test
```

构建产物仅为 `dist/index.html`。运行时函数仍从 `edge-functions/api/` 由 Makers 自动扫描部署。

## 技术说明

- `GET /api/v1/probe/config` 返回监控配置及版本。
- EdgeOne 节点直接请求监控目标，生成真实 HTTP 延迟/状态码/关键字结果。
- `POST /api/v1/probe/ingest` 批量回传；`batch_id` 由每次调用生成，D1 提供去重。
- 仅支持 HTTP 监控（TCP/ICMP 需要另外部署可访问 Socket 的探针）。
- 如监控数量超过每次上限，函数会按时间片轮换待检查的目标。

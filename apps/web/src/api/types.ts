// API Response Types

export type MonitorStatus = 'up' | 'down' | 'maintenance' | 'paused' | 'unknown';
export type CheckStatus = 'up' | 'down' | 'maintenance' | 'unknown';
export type MonitorType = 'http' | 'tcp' | 'heartbeat';
export type HttpResponseMatchMode = 'contains' | 'regex';
/** Exact code or inclusive range (100-599). Matches worker/DB status rule JSON. */
export type StatusCodeRule = number | { from: number; to: number };
export type SupportedLocale = 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'es';
export type LocaleSetting = 'auto' | SupportedLocale;
export type HomepageBootstrapMode = 'full' | 'partial';

export type IncidentStatus = 'investigating' | 'identified' | 'monitoring' | 'resolved';
export type IncidentImpact = 'none' | 'minor' | 'major' | 'critical';

export interface IncidentUpdateAttachment {
  name: string;
}

export interface IncidentUpdate {
  id: number;
  incident_id: number;
  status: IncidentStatus | null;
  message: string;
  created_at: number;
  attachments?: IncidentUpdateAttachment[];
}

export interface Incident {
  id: number;
  title: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  message: string | null;
  started_at: number;
  resolved_at: number | null;
  acknowledged_at?: number | null;
  similar_group_id?: number | null;
  outage_id?: number | null;
  monitor_ids: number[];
  updates: IncidentUpdate[];
}

export interface MaintenanceWindow {
  id: number;
  title: string;
  message: string | null;
  starts_at: number;
  ends_at: number;
  created_at: number;
  monitor_ids: number[];
}

export interface Heartbeat {
  checked_at: number;
  status: CheckStatus;
  latency_ms: number | null;
}

export interface UptimeSummary {
  range_start_at: number;
  range_end_at: number;
  total_sec: number;
  downtime_sec: number;
  unknown_sec: number;
  uptime_sec: number;
  uptime_pct: number;
}

export type UptimeColorTier =
  | 'emerald'
  | 'green'
  | 'lime'
  | 'yellow'
  | 'amber'
  | 'orange'
  | 'red'
  | 'rose'
  | 'slate';
export type UptimeRatingLevel = 1 | 2 | 3 | 4 | 5;

export interface UptimeDay {
  day_start_at: number;
  total_sec: number;
  downtime_sec: number;
  unknown_sec: number;
  uptime_sec: number;
  uptime_pct: number | null;
}

export interface UptimeDayPreview {
  day_start_at: number;
  downtime_sec: number;
  unknown_sec: number;
  uptime_pct: number | null;
}

export interface UptimeSummaryPreview {
  uptime_pct: number;
}

export interface HomepageHeartbeatStrip {
  checked_at: number[];
  status_codes: string;
  latency_ms: Array<number | null>;
}

export interface HomepageUptimeDayStrip {
  day_start_at: number[];
  downtime_sec: number[];
  unknown_sec: number[];
  uptime_pct_milli: Array<number | null>;
}

export interface PublicMonitor {
  id: number;
  name: string;
  type: MonitorType;
  display_url: string | null;
  group_name: string | null;
  group_sort_order: number;
  sort_order: number;
  uptime_rating_level: UptimeRatingLevel;
  status: MonitorStatus;
  is_stale: boolean;
  last_checked_at: number | null;
  last_latency_ms: number | null;

  heartbeats: Heartbeat[];

  uptime_30d: UptimeSummary | null;
  uptime_days: UptimeDay[];
}

export interface StatusResponse {
  generated_at: number;
  site_title: string;
  site_description: string;
  site_locale: LocaleSetting;
  site_timezone: string;
  uptime_rating_level: 1 | 2 | 3 | 4 | 5;
  overall_status: MonitorStatus;
  banner: {
    source: 'incident' | 'maintenance' | 'monitors';
    status: 'operational' | 'partial_outage' | 'major_outage' | 'maintenance' | 'unknown';
    title: string;
    incident?: { id: number; title: string; status: IncidentStatus; impact: IncidentImpact } | null;
    maintenance_window?: { id: number; title: string; starts_at: number; ends_at: number } | null;
    down_ratio?: number;
  };
  summary: {
    up: number;
    down: number;
    maintenance: number;
    paused: number;
    unknown: number;
  };
  monitors: PublicMonitor[];
  active_incidents: Incident[];
  maintenance_windows: {
    active: MaintenanceWindow[];
    upcoming: MaintenanceWindow[];
  };
}

export interface IncidentSummary {
  id: number;
  title: string;
  status: IncidentStatus;
  impact: IncidentImpact;
  message: string | null;
  started_at: number;
  resolved_at: number | null;
}

export interface MaintenanceWindowPreview {
  id: number;
  title: string;
  message: string | null;
  starts_at: number;
  ends_at: number;
  monitor_ids: number[];
}

export interface HomepageMonitorCard {
  id: number;
  name: string;
  type: MonitorType;
  display_url: string | null;
  group_name: string | null;
  status: MonitorStatus;
  is_stale: boolean;
  last_checked_at: number | null;
  heartbeat_strip: HomepageHeartbeatStrip;
  uptime_30d: UptimeSummaryPreview | null;
  uptime_day_strip: HomepageUptimeDayStrip;
}

export interface PublicHomepageResponse {
  generated_at: number;
  bootstrap_mode: HomepageBootstrapMode;
  monitor_count_total: number;
  site_title: string;
  site_description: string;
  site_locale: LocaleSetting;
  site_timezone: string;
  uptime_rating_level: UptimeRatingLevel;
  overall_status: MonitorStatus;
  banner: StatusResponse['banner'];
  summary: StatusResponse['summary'];
  monitors: HomepageMonitorCard[];
  active_incidents: IncidentSummary[];
  maintenance_windows: {
    active: MaintenanceWindowPreview[];
    upcoming: MaintenanceWindowPreview[];
  };
  resolved_incident_preview: IncidentSummary | null;
  maintenance_history_preview: MaintenanceWindowPreview | null;
}

export interface LatencyPoint {
  checked_at: number;
  status: CheckStatus;
  latency_ms: number | null;
}

export interface LatencyResponse {
  monitor: { id: number; name: string };
  range: '24h';
  range_start_at: number;
  range_end_at: number;
  avg_latency_ms: number | null;
  p95_latency_ms: number | null;
  points: LatencyPoint[];
}

export interface UptimeResponse {
  monitor: { id: number; name: string };
  range: '24h' | '7d' | '30d';
  range_start_at: number;
  range_end_at: number;
  total_sec: number;
  downtime_sec: number;
  unknown_sec: number;
  uptime_sec: number;
  uptime_pct: number;
}

export type AnalyticsRange = '1h' | '24h' | '7d' | '30d' | '90d';
export type AnalyticsOverviewRange = '24h' | '7d';

export interface AnalyticsOverviewResponse {
  range: AnalyticsOverviewRange;
  range_start_at: number;
  range_end_at: number;
  monitors: { total: number };
  totals: {
    total_sec: number;
    downtime_sec: number;
    uptime_sec: number;
    uptime_pct: number;
  };
  alerts: { count: number };
  outages: { longest_sec: number | null; mttr_sec: number | null };
}

export interface MonitorAnalyticsDayPoint {
  day_start_at: number;
  total_sec: number;
  downtime_sec: number;
  unknown_sec: number;
  uptime_sec: number;
  uptime_pct: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  checks_total: number;
  checks_up: number;
  checks_down: number;
  checks_unknown: number;
  checks_maintenance: number;
}

export interface MonitorAnalyticsResponse {
  monitor: { id: number; name: string; type: MonitorType };
  range: AnalyticsRange;
  /** Selected probe region, when the chart is filtered to one. */
  region?: string;
  /** Probe regions with data for this monitor in the window. */
  regions?: string[];
  range_start_at: number;
  range_end_at: number;
  total_sec: number;
  downtime_sec: number;
  unknown_sec: number;
  uptime_sec: number;
  uptime_pct: number;
  unknown_pct: number;
  avg_latency_ms: number | null;
  p50_latency_ms: number | null;
  p95_latency_ms: number | null;
  checks: { total: number; up: number; down: number; unknown: number; maintenance: number };
  points: LatencyPoint[];
  daily: MonitorAnalyticsDayPoint[];
}

export interface Outage {
  id: number;
  monitor_id: number;
  started_at: number;
  ended_at: number | null;
  initial_error: string | null;
  last_error: string | null;
}

export interface PublicDayContextResponse {
  day_start_at: number;
  day_end_at: number;
  maintenance_windows: MaintenanceWindow[];
  incidents: Incident[];
}

export interface MonitorOutagesResponse {
  range: AnalyticsRange;
  range_start_at: number;
  range_end_at: number;
  outages: Outage[];
  next_cursor: number | null;
}

/** Automatic monitor event: one outage with its monitor's display fields attached. */
export interface MonitorEvent extends Outage {
  monitor_name: string;
  monitor_type: MonitorType;
  monitor_target: string;
  ai_summary?: string | null;
  title?: string | null;
}

export interface MonitorEventsResponse {
  events: MonitorEvent[];
  next_cursor: number | null;
}
export interface EventCheckResult {
  checked_at: number;
  status: CheckStatus;
  latency_ms: number | null;
  http_status: number | null;
  error: string | null;
  location: string | null;
  effective_url: string | null;
  redirect_count: number | null;
  response_headers: Record<string, string> | null;
  timings: Record<string, number> | null;
  resolved_ips: string[] | null;
}
export interface EventUpdate {
  id: number;
  body: string;
  created_at: number;
  attachments: Array<{ name: string }>;
}
export interface EventMetadata {
  id: number;
  key: string;
  value: string;
  created_at: number;
}
export interface EventScreenshot {
  content_type: string;
  width: number | null;
  height: number | null;
  captured_at: number;
  has_image: boolean;
}
export interface AdminEventDetailResponse {
  event: MonitorEvent;
  screenshot: EventScreenshot | null;
  metadata: EventMetadata[];
  updates: EventUpdate[];
  checks: EventCheckResult[];
}

export interface PublicUptimeOverviewResponse {
  generated_at: number;
  range: '30d' | '90d';
  range_start_at: number;
  range_end_at: number;
  overall: {
    total_sec: number;
    downtime_sec: number;
    unknown_sec: number;
    uptime_sec: number;
    uptime_pct: number;
  };
  monitors: Array<{
    id: number;
    name: string;
    type: MonitorType;
    total_sec: number;
    downtime_sec: number;
    unknown_sec: number;
    uptime_sec: number;
    uptime_pct: number;
  }>;
}

// Admin Types

export type MonitorProbeMode = 'worker' | 'multi_region';
export type ProbeKind = 'edgeone' | 'durable_object' | 'worker' | 'server';
export type ProbeScope = 'domestic' | 'overseas';

/** Recurring daily maintenance window; days are ISO weekdays (1 = Monday … 7 = Sunday). */
export interface MonitorMaintenanceWindow {
  start_minute: number;
  end_minute: number;
  days: number[];
  timezone: string;
}

export interface MonitorMetadataEntry {
  key: string;
  value: string;
}

export interface AdminMonitor {
  id: number;
  name: string;
  type: MonitorType;
  target: string;
  display_url: string | null;
  group_name: string | null;
  group_sort_order: number;
  sort_order: number;
  show_on_status_page: boolean;
  interval_sec: number;
  timeout_ms: number;
  http_method: string | null;
  http_headers_json: Record<string, string> | null;
  http_body: string | null;
  follow_redirects: boolean;
  expected_status_json: StatusCodeRule[] | null;
  forbidden_status_json: StatusCodeRule[] | null;
  response_keyword: string | null;
  response_keyword_mode: HttpResponseMatchMode | null;
  response_forbidden_keyword: string | null;
  response_forbidden_keyword_mode: HttpResponseMatchMode | null;
  is_active: boolean;
  probe_mode: MonitorProbeMode;
  /** Explicit notification channels; null notifies every enabled channel. */
  notification_channel_ids: number[] | null;
  /** Recurring daily maintenance window; null keeps notifications for every check. */
  maintenance_window: MonitorMaintenanceWindow | null;
  metadata: MonitorMetadataEntry[];
  ssl_expiry_enabled: boolean;
  ssl_expiry_alert_days: number | null;
  domain_expiry_enabled: boolean;
  domain_expiry_alert_days: number | null;
  ssl_expires_at: number | null;
  ssl_issuer: string | null;
  domain_expires_at: number | null;
  expiry_checked_at: number | null;
  keep_cookies: boolean;
  heartbeat_token: string | null;
  last_heartbeat_at: number | null;
  heartbeat_grace_sec: number | null;
  failures_to_down_from_up: number | null;
  successes_to_up_from_down: number | null;
  confirmation_period_sec: number | null;
  recovery_period_sec: number | null;
  created_at: number;
  updated_at: number;

  // Runtime state (from monitor_state)
  status: MonitorStatus;
  last_checked_at: number | null;
  last_status_change_at: number | null;
  last_latency_ms: number | null;
  last_error: string | null;
}

export interface CreateMonitorInput {
  name: string;
  type: MonitorType;
  /** Omitted for heartbeat monitors: they are pinged by the job they watch, not probed. */
  target?: string;
  display_url?: string | null;
  group_name?: string;
  group_sort_order?: number;
  sort_order?: number;
  show_on_status_page?: boolean;
  interval_sec?: number;
  timeout_ms?: number;
  http_method?: string;
  http_headers_json?: Record<string, string>;
  http_body?: string;
  follow_redirects?: boolean;
  expected_status_json?: StatusCodeRule[];
  forbidden_status_json?: StatusCodeRule[];
  response_keyword?: string;
  response_keyword_mode?: HttpResponseMatchMode;
  response_forbidden_keyword?: string;
  response_forbidden_keyword_mode?: HttpResponseMatchMode;
  is_active?: boolean;
  probe_mode?: MonitorProbeMode;
  notification_channel_ids?: number[] | null;
  maintenance_window?: MonitorMaintenanceWindow | null;
  metadata?: MonitorMetadataEntry[];
  ssl_expiry_enabled?: boolean;
  ssl_expiry_alert_days?: number | null;
  domain_expiry_enabled?: boolean;
  domain_expiry_alert_days?: number | null;
  keep_cookies?: boolean;
  heartbeat_grace_sec?: number | null;
  failures_to_down_from_up?: number | null;
  successes_to_up_from_down?: number | null;
  confirmation_period_sec?: number | null;
  recovery_period_sec?: number | null;
}

export interface PatchMonitorInput {
  name?: string;
  target?: string;
  display_url?: string | null;
  group_name?: string | null;
  group_sort_order?: number;
  sort_order?: number;
  show_on_status_page?: boolean;
  interval_sec?: number;
  timeout_ms?: number;
  http_method?: string;
  http_headers_json?: Record<string, string> | null;
  http_body?: string | null;
  follow_redirects?: boolean;
  expected_status_json?: StatusCodeRule[] | null;
  forbidden_status_json?: StatusCodeRule[] | null;
  response_keyword?: string | null;
  response_keyword_mode?: HttpResponseMatchMode | null;
  response_forbidden_keyword?: string | null;
  response_forbidden_keyword_mode?: HttpResponseMatchMode | null;
  is_active?: boolean;
  probe_mode?: MonitorProbeMode;
  notification_channel_ids?: number[] | null;
  maintenance_window?: MonitorMaintenanceWindow | null;
  metadata?: MonitorMetadataEntry[];
  ssl_expiry_enabled?: boolean;
  ssl_expiry_alert_days?: number | null;
  domain_expiry_enabled?: boolean;
  domain_expiry_alert_days?: number | null;
  keep_cookies?: boolean;
  heartbeat_grace_sec?: number | null;
  failures_to_down_from_up?: number | null;
  successes_to_up_from_down?: number | null;
  confirmation_period_sec?: number | null;
  recovery_period_sec?: number | null;
}

export interface AdminProbe {
  id: string;
  name: string;
  kind: ProbeKind;
  scope: ProbeScope;
  region: string;
  is_enabled: boolean;
  is_required: boolean;
  config_version: number;
  last_seen_at: number | null;
  last_result_at: number | null;
  offline_after_sec: number;
  health_status: 'waiting' | 'online' | 'offline' | 'disabled';
  created_at: number;
  updated_at: number;
}

export interface AdminProbesResponse {
  probes: AdminProbe[];
}

export interface CreateAdminProbeInput {
  id: string;
  name: string;
  kind: ProbeKind;
  scope: ProbeScope;
  region: string;
  is_required?: boolean;
  offline_after_sec?: number;
}

export interface PatchAdminProbeInput {
  name?: string;
  scope?: ProbeScope;
  region?: string;
  is_enabled?: boolean;
  is_required?: boolean;
  offline_after_sec?: number;
}

export interface ProbeHistoryResponse {
  monitor_id: number;
  range: AnalyticsRange;
  start: number;
  end: number;
  bucket_seconds: number;
  truncated: boolean;
  probes: Array<{
    probe_id: string;
    name: string;
    scope: string | null;
    region: string | null;
    points: Array<{
      checked_at: number;
      avg_latency_ms: number | null;
      checks_up: number;
      checks_down: number;
      checks_unknown: number;
    }>;
  }>;
}

export interface AdminProbeWithToken {
  probe: AdminProbe | null;
  token: string;
}

export interface AdminProbeTokenRotation {
  ok: true;
  probe_id: string;
  token: string;
}

export interface ReorderMonitorGroupsInput {
  groups: Array<{
    group_name: string | null;
    group_sort_order: number;
  }>;
}

export interface ReorderMonitorGroupsResult {
  updated_groups: number;
  affected_monitors: number;
}

export interface AssignMonitorsToGroupInput {
  monitor_ids: number[];
  group_name: string | null;
  group_sort_order?: number;
}

export interface AssignMonitorsToGroupResult {
  group_name: string | null;
  group_sort_order: number;
  updated_monitors: number;
}

export interface MonitorTestResult {
  monitor: { id: number; name: string; type: MonitorType };
  result: {
    status: CheckStatus;
    latency_ms: number | null;
    http_status: number | null;
    error: string | null;
    attempts: number;
  };
}

export interface MonitorTestAlertResult {
  event_key: string;
  channels: number;
  results: Array<{
    channel_id: number;
    name: string;
    status: 'success' | 'failed';
    http_status: number | null;
    error: string | null;
  }>;
}

export type NotificationChannelPreset = 'custom' | 'telegram' | 'bark' | 'resend' | 'smtp';
export type TelegramParseMode = 'Markdown' | 'MarkdownV2' | 'HTML';

export interface CustomWebhookChannelConfig {
  preset?: 'custom';
  url: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';
  headers?: Record<string, string>;
  timeout_ms?: number;
  payload_type?: 'json' | 'param' | 'x-www-form-urlencoded';
  message_template?: string;
  payload_template?: unknown;
  enabled_events?: Array<
    | 'monitor.down'
    | 'monitor.up'
    | 'monitor.ssl_expiring'
    | 'monitor.domain_expiring'
    | 'probe.offline'
    | 'probe.online'
    | 'incident.created'
    | 'incident.updated'
    | 'incident.resolved'
    | 'maintenance.started'
    | 'maintenance.ended'
    | 'test.ping'
  >;
  signing?: {
    enabled: boolean;
    secret_ref: string;
  };
}

export interface TelegramChannelConfig {
  preset: 'telegram';
  bot_token?: string;
  bot_token_secret_ref?: string;
  bot_token_configured?: boolean;
  bot_token_source?: 'stored' | 'secret_ref';
  chat_id: string;
  message_thread_id?: number;
  timeout_ms?: number;
  message_template?: string;
  enabled_events?: CustomWebhookChannelConfig['enabled_events'];
  parse_mode?: TelegramParseMode;
  disable_notification?: boolean;
  protect_content?: boolean;
}

interface ProviderChannelOptions {
  timeout_ms?: number;
  message_template?: string;
  enabled_events?: CustomWebhookChannelConfig['enabled_events'];
}

export interface BarkChannelConfig extends ProviderChannelOptions {
  preset: 'bark';
  server_url: string;
  device_key_secret_ref: string;
}

export interface ResendChannelConfig extends ProviderChannelOptions {
  preset: 'resend';
  api_key_secret_ref: string;
  from: string;
  to: string[];
  subject_prefix?: string;
}

export interface SmtpChannelConfig extends ProviderChannelOptions {
  preset: 'smtp';
  host: string;
  port: number;
  username: string;
  password_secret_ref: string;
  from: string;
  to: string[];
  subject_prefix?: string;
}

export type WebhookChannelConfig =
  | CustomWebhookChannelConfig
  | TelegramChannelConfig
  | BarkChannelConfig
  | ResendChannelConfig
  | SmtpChannelConfig;

export interface NotificationChannel {
  id: number;
  name: string;
  type: 'webhook';
  config_json: WebhookChannelConfig;
  is_active: boolean;
  created_at: number;
}

export interface CreateNotificationChannelInput {
  name: string;
  type?: 'webhook';
  config_json: WebhookChannelConfig;
  is_active?: boolean;
}

export interface PatchNotificationChannelInput {
  name?: string;
  config_json?: WebhookChannelConfig;
  is_active?: boolean;
}

export type NotificationDigestInterval = 'none' | 'daily' | 'weekly';

export interface NotificationGroup {
  id: number;
  name: string;
  is_active: boolean;
  immediate_enabled: boolean;
  debounce_seconds: number;
  debounce_due_at: number | null;
  digest_interval: NotificationDigestInterval;
  next_digest_at: number | null;
  created_at: number;
  updated_at: number;
  monitor_ids: number[];
  channel_ids: number[];
}

export interface NotificationGroupInput {
  name: string;
  is_active: boolean;
  immediate_enabled: boolean;
  debounce_seconds: number;
  digest_interval: NotificationDigestInterval;
  monitor_ids: number[];
  channel_ids: number[];
}

export type PatchNotificationGroupInput = Partial<NotificationGroupInput>;

export interface NotificationChannelTestResult {
  event_key: string;
  delivery: {
    status: string;
    http_status: number | null;
    error: string | null;
    created_at: number;
  } | null;
}

export interface NotificationDelivery {
  id: number;
  event_key: string;
  event_type: string | null;
  channel_id: number;
  channel_name: string | null;
  status: 'success' | 'failed';
  http_status: number | null;
  error: string | null;
  attempts: number;
  next_attempt_at: number | null;
  created_at: number;
  can_retry: boolean;
}

export interface NotificationDeliveriesResponse {
  deliveries: NotificationDelivery[];
}

export interface PublicIncidentsResponse {
  incidents: Incident[];
  next_cursor: number | null;
}

export interface PublicMaintenanceWindowsResponse {
  maintenance_windows: MaintenanceWindow[];
  next_cursor: number | null;
}

export interface AdminIncidentsResponse {
  incidents: Incident[];
  next_offset: number | null;
  total_count: number;
}

export interface FetchAdminIncidentsOptions {
  limit?: number;
  offset?: number;
  q?: string;
  status?: IncidentStatus;
  monitorId?: number;
  similarGroupId?: number;
  groupSimilar?: boolean;
  /** Column sort; `default` keeps ongoing incidents on top. */
  sort?: 'default' | 'title' | 'started_at' | 'length';
  dir?: 'asc' | 'desc';
}

export interface CreateIncidentInput {
  title: string;
  status?: Exclude<IncidentStatus, 'resolved'>;
  impact?: IncidentImpact;
  message?: string;
  started_at?: number;
  monitor_ids: number[];
}

export interface CreateIncidentUpdateInput {
  message: string;
  status?: Exclude<IncidentStatus, 'resolved'>;
  attachments?: Array<{ name: string; data: string }>;
}

export interface ResolveIncidentInput {
  message?: string;
}

export interface IncidentSelectionInput {
  incident_ids: number[];
}

export interface SimilarIncidentGroupResult {
  similar_group_id: number;
  incident_ids: number[];
}

export interface CreateMaintenanceWindowInput {
  title: string;
  message?: string;
  starts_at: number;
  ends_at: number;
  monitor_ids: number[];
}

export interface PatchMaintenanceWindowInput {
  title?: string;
  message?: string | null;
  starts_at?: number;
  ends_at?: number;
  monitor_ids?: number[];
}

export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

// Admin settings (non-sensitive, stored in D1 settings table)
export interface AdminSettings {
  site_title: string;
  site_description: string;
  site_locale: LocaleSetting;
  site_timezone: string;

  retention_check_results_days: number;

  state_failures_to_down_from_up: number;
  state_successes_to_up_from_down: number;

  admin_default_overview_range: '24h' | '7d';
  admin_default_monitor_range: '24h' | '7d' | '30d' | '90d';

  uptime_rating_level: UptimeRatingLevel;
}

export interface AdminSettingsResponse {
  settings: AdminSettings;
}

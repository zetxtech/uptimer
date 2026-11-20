import { useEffect, useId, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import type {
  AdminMonitor,
  CreateMonitorInput,
  HttpResponseMatchMode,
  MonitorMaintenanceWindow,
  MonitorType,
  PatchMonitorInput,
  StatusCodeRule,
} from '../api/types';
import {
  checkMonitorExpiry,
  fetchAdminProbes,
  fetchAdminSettings,
  fetchNotificationChannels,
} from '../api/client';
import { ADMIN_PROBES_PATH } from '../app/adminPaths';
import { useI18n } from '../app/I18nContext';
import { Button, FIELD_HELP_CLASS, INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS, cn } from './ui';
import type { MessageKey } from '../i18n/messages';
import { decodeBasicHeader, encodeBasicCredentials } from '../utils/basicAuth';
import { formatDateTime } from '../utils/datetime';
import {
  defaultTimezone,
  formatGmtOffset,
  formatTimeInZone,
  isKnownTimezone,
  listTimezones,
} from '../utils/timezone';
import {
  CheckboxRow,
  FormCollapse,
  FormErrorBanner,
  FormField,
  FormGroup,
  KeyValueRows,
  createKeyValueRow,
  type KeyValueRow,
} from './formPage';
import { Select } from './Select';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD';

/** What the operator wants to be alerted about; drives the monitor type plus its main assertion. */
type CheckKind =
  | 'url_down'
  | 'url_status'
  | 'url_lacks_keyword'
  | 'url_has_keyword'
  | 'host_ping'
  | 'heartbeat';

function deriveCheckKind(monitor: AdminMonitor | undefined, initialType?: MonitorType): CheckKind {
  if (monitor) {
    if (monitor.type === 'heartbeat') return 'heartbeat';
    if (monitor.type === 'tcp') return 'host_ping';
    if (monitor.response_keyword) return 'url_lacks_keyword';
    if (monitor.response_forbidden_keyword) return 'url_has_keyword';
    if (monitor.expected_status_json) return 'url_status';
    return 'url_down';
  }
  if (initialType === 'heartbeat') return 'heartbeat';
  if (initialType === 'tcp') return 'host_ping';
  return 'url_down';
}

/** Falls back to the host name so creating a monitor never needs a separate naming step. */
function monitorNameFromTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname || trimmed;
  } catch {
    return trimmed;
  }
}

type CommonProps = {
  onCancel: () => void;
  /** Edit-page action strip, mirroring the reference: test alert, pause/resume, remove. */
  onTestAlert?: () => void;
  onTogglePause?: () => void;
  onDelete?: () => void;
  actionPending?: boolean;
  /** Layout of the form shell: modal dialog or full page surface. */
  variant?: 'modal' | 'page';
  showBreadcrumb?: boolean;
  isLoading?: boolean;
  error?: string | undefined;
  groupOptions?: string[];
  /** Group preselected when the form opens (group header create action). */
  initialGroup?: string | undefined;
  /** Pre-selected check type when creating from a typed entry point. */
  initialType?: MonitorType | undefined;
  /** Site-wide state machine defaults, shown as the placeholder for empty overrides. */
  stateThresholdDefaults?: { failuresToDownFromUp: number; successesToUpFromDown: number };
};

type CreateProps = CommonProps & {
  monitor?: undefined;
  onSubmit: (data: CreateMonitorInput) => void;
};

type EditProps = CommonProps & {
  monitor: AdminMonitor;
  onSubmit: (data: PatchMonitorInput) => void;
};

const inputClass = INPUT_CLASS;
const selectClass = SELECT_CLASS;
const nativeSelectClass = cn(SELECT_CLASS, 'ui-native-select');
const textareaClass = TEXTAREA_CLASS;
type TranslateFn = ReturnType<typeof useI18n>['t'];

type HeartbeatUnit = 'second' | 'minute' | 'hour' | 'day';

/** Days-before-expiry choices shared by the SSL and domain alert selects. */
const EXPIRY_ALERT_DAY_OPTIONS = [1, 3, 7, 14, 30] as const;

const HEARTBEAT_UNITS: Array<{ id: HeartbeatUnit; seconds: number; label: MessageKey }> = [
  { id: 'second', seconds: 1, label: 'monitor_form.unit_second' },
  { id: 'minute', seconds: 60, label: 'monitor_form.unit_minute' },
  { id: 'hour', seconds: 3_600, label: 'monitor_form.unit_hour' },
  { id: 'day', seconds: 86_400, label: 'monitor_form.unit_day' },
];

/** Largest unit that divides the interval exactly, so 86400 shows as `1 day`. */
function heartbeatUnitFor(seconds: number): HeartbeatUnit {
  if (seconds <= 0) return 'minute';
  for (const unit of [...HEARTBEAT_UNITS].reverse()) {
    if (seconds % unit.seconds === 0) return unit.id;
  }
  return 'second';
}

function normalizeHttpResponseMatchMode(
  value: HttpResponseMatchMode | null | undefined,
): HttpResponseMatchMode {
  return value ?? 'contains';
}

function toHttpMethod(value: string): HttpMethod {
  switch (value) {
    case 'GET':
    case 'POST':
    case 'PUT':
    case 'PATCH':
    case 'DELETE':
    case 'HEAD':
      return value;
    default:
      return 'GET';
  }
}

function formatStatusRules(rules: StatusCodeRule[] | null | undefined): string {
  if (!rules || rules.length === 0) return '';
  return rules
    .map((rule) => (typeof rule === 'number' ? String(rule) : `${rule.from}-${rule.to}`))
    .join(', ');
}

function parseStatusCodeRuleToken(
  token: string,
  t: TranslateFn,
): { ok: true; value: StatusCodeRule } | { ok: false; error: string } {
  const trimmed = token.trim();
  if (!trimmed) {
    return { ok: false as const, error: t('monitor_form.error_status_rule_empty') };
  }

  const rangeMatch = /^(\d{3})-(\d{3})$/.exec(trimmed);
  if (rangeMatch) {
    const from = Number.parseInt(rangeMatch[1]!, 10);
    const to = Number.parseInt(rangeMatch[2]!, 10);
    if (from < 100 || from > 599 || to < 100 || to > 599) {
      return {
        ok: false as const,
        error: t('monitor_form.error_status_rule_invalid', { value: trimmed }),
      };
    }
    if (from > to) {
      return {
        ok: false as const,
        error: t('monitor_form.error_status_rule_range_order', { value: trimmed }),
      };
    }
    return { ok: true as const, value: { from, to } };
  }

  if (!/^\d{3}$/.test(trimmed)) {
    return {
      ok: false as const,
      error: t('monitor_form.error_status_rule_invalid', { value: trimmed }),
    };
  }

  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 100 || n > 599) {
    return {
      ok: false as const,
      error: t('monitor_form.error_status_rule_invalid', { value: trimmed }),
    };
  }

  return { ok: true as const, value: n };
}

function parseStatusRuleFromJsonItem(
  item: unknown,
  t: TranslateFn,
): { ok: true; value: StatusCodeRule } | { ok: false; error: string } {
  if (typeof item === 'number' && Number.isInteger(item) && item >= 100 && item <= 599) {
    return { ok: true as const, value: item };
  }

  if (item && typeof item === 'object' && !Array.isArray(item)) {
    const rec = item as Record<string, unknown>;
    const from = rec.from;
    const to = rec.to;
    if (
      typeof from === 'number' &&
      typeof to === 'number' &&
      Number.isInteger(from) &&
      Number.isInteger(to) &&
      from >= 100 &&
      from <= 599 &&
      to >= 100 &&
      to <= 599
    ) {
      if (from > to) {
        return {
          ok: false as const,
          error: t('monitor_form.error_status_rule_range_order', {
            value: `${from}-${to}`,
          }),
        };
      }
      return { ok: true as const, value: { from, to } };
    }
  }

  return {
    ok: false as const,
    error: t('monitor_form.error_status_rule_invalid', { value: String(item) }),
  };
}

/** RFC 7230 token characters allowed in a header field name. */
const HEADER_NAME_PATTERN = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;

const HEADER_ROWS_PARSE_ERRORS = {
  nameRequired: 'monitor_form.error_header_name_required',
  nameInvalid: 'monitor_form.error_header_name_invalid',
  duplicate: 'monitor_form.error_headers_duplicate',
} as const;

function parseHeaderRows(
  rows: KeyValueRow[],
  t: TranslateFn,
): { ok: true; value: Record<string, string> } | { ok: false; error: string } {
  const value: Record<string, string> = {};
  const seen = new Set<string>();

  for (const row of rows) {
    const name = row.name.trim();
    if (name.length === 0 && row.value.trim().length === 0) continue;
    if (name.length === 0) {
      return { ok: false as const, error: t(HEADER_ROWS_PARSE_ERRORS.nameRequired) };
    }
    if (!HEADER_NAME_PATTERN.test(name)) {
      return {
        ok: false as const,
        error: t(HEADER_ROWS_PARSE_ERRORS.nameInvalid, { value: name }),
      };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) {
      return { ok: false as const, error: t(HEADER_ROWS_PARSE_ERRORS.duplicate, { value: name }) };
    }
    seen.add(key);
    value[name] = row.value;
  }

  return { ok: true as const, value };
}

function parseBasicAuthInput(
  username: string,
  password: string,
  t: TranslateFn,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const user = username.trim();
  if (user.length === 0 && password.length === 0) return { ok: true as const, value: null };
  if (user.length === 0) {
    return { ok: false as const, error: t('monitor_form.error_auth_username_required') };
  }
  return { ok: true as const, value: encodeBasicCredentials(user, password) };
}

function minutesToTimeInput(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1]!, 10);
  const minutes = Number.parseInt(match[2]!, 10);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function parseMaintenanceInput(
  start: string,
  end: string,
  days: number[],
  timezone: string,
  t: TranslateFn,
): { ok: true; value: MonitorMaintenanceWindow | null } | { ok: false; error: string } {
  const active = start.trim().length > 0 || end.trim().length > 0 || days.length > 0;
  if (!active) return { ok: true as const, value: null };

  const startMinute = timeInputToMinutes(start);
  const endMinute = timeInputToMinutes(end);
  if (
    startMinute === null ||
    endMinute === null ||
    days.length === 0 ||
    !isKnownTimezone(timezone)
  ) {
    return { ok: false as const, error: t('monitor_form.error_maintenance_incomplete') };
  }
  if (startMinute === endMinute) {
    return { ok: false as const, error: t('monitor_form.error_maintenance_empty') };
  }

  return {
    ok: true as const,
    value: {
      start_minute: startMinute,
      end_minute: endMinute,
      days: [...days].sort((a, b) => a - b),
      timezone,
    },
  };
}

const WEEKDAYS: Array<{ day: number; label: MessageKey }> = [
  { day: 1, label: 'monitor_form.weekday_mon' },
  { day: 2, label: 'monitor_form.weekday_tue' },
  { day: 3, label: 'monitor_form.weekday_wed' },
  { day: 4, label: 'monitor_form.weekday_thu' },
  { day: 5, label: 'monitor_form.weekday_fri' },
  { day: 6, label: 'monitor_form.weekday_sat' },
  { day: 7, label: 'monitor_form.weekday_sun' },
];

function parseMetadataRows(
  rows: KeyValueRow[],
  t: TranslateFn,
): { ok: true; value: Array<{ key: string; value: string }> } | { ok: false; error: string } {
  const entries: Array<{ key: string; value: string }> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const key = row.name.trim();
    if (key.length === 0 && row.value.trim().length === 0) continue;
    if (key.length === 0 || key.length > 64 || row.value.length > 256) {
      return { ok: false as const, error: t('monitor_form.error_metadata_invalid') };
    }
    if (seen.has(key)) {
      return {
        ok: false as const,
        error: t('monitor_form.error_metadata_duplicate', { value: key }),
      };
    }
    seen.add(key);
    entries.push({ key, value: row.value });
  }

  if (entries.length > 20) {
    return { ok: false as const, error: t('monitor_form.error_metadata_limit') };
  }

  return { ok: true as const, value: entries };
}

/** Splits stored headers into a Basic-auth pair and the remaining rows. */
function splitBasicAuthEntries(entries: Record<string, string>): {
  auth: { username: string; password: string } | null;
  rest: Array<[string, string]>;
} {
  const rest: Array<[string, string]> = [];
  let auth: { username: string; password: string } | null = null;

  for (const [name, value] of Object.entries(entries)) {
    if (!auth && name.toLowerCase() === 'authorization') {
      const decoded = decodeBasicHeader(value);
      if (decoded) {
        auth = decoded;
        continue;
      }
    }
    rest.push([name, value]);
  }

  return { auth, rest };
}

function initialBasicAuth(monitor: AdminMonitor | undefined) {
  if (!monitor || monitor.type !== 'http') return null;
  return splitBasicAuthEntries(monitor.http_headers_json ?? {}).auth;
}

function initialHeaderRows(monitor: AdminMonitor | undefined): KeyValueRow[] {
  if (!monitor || monitor.type !== 'http') return [createKeyValueRow()];
  const { rest } = splitBasicAuthEntries(monitor.http_headers_json ?? {});
  if (rest.length === 0) return [createKeyValueRow()];
  return rest.map(([name, value]) => createKeyValueRow(name, value));
}

function parseStatusRulesInput(
  text: string,
  t: TranslateFn,
): { ok: true; value: StatusCodeRule[] | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true as const, value: null };

  const finalize = (rules: StatusCodeRule[]) => {
    if (rules.length === 0) {
      return { ok: false as const, error: t('monitor_form.error_status_rules_empty') };
    }
    if (rules.length > 50) {
      return { ok: false as const, error: t('monitor_form.error_status_rules_too_many') };
    }
    return { ok: true as const, value: rules };
  };

  // Also accept JSON array input like: [200, 204, {"from":301,"to":399}]
  if (trimmed.startsWith('[')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed) as unknown;
    } catch {
      return {
        ok: false as const,
        error: t('monitor_form.error_status_rules_json_or_list'),
      };
    }

    if (!Array.isArray(parsed)) {
      return { ok: false as const, error: t('monitor_form.error_status_rules_must_array') };
    }

    const out: StatusCodeRule[] = [];
    for (const item of parsed) {
      const r = parseStatusRuleFromJsonItem(item, t);
      if (!r.ok) return r;
      out.push(r.value);
    }
    return finalize(out);
  }

  const parts = trimmed
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const out: StatusCodeRule[] = [];
  for (const p of parts) {
    const r = parseStatusCodeRuleToken(p, t);
    if (!r.ok) return r;
    out.push(r.value);
  }

  return finalize(out);
}

function parseOptionalSortOrderInput(
  text: string,
): { ok: true; value: number | undefined } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: undefined };
  if (!/^-?\d+$/.test(trimmed)) return { ok: false };

  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < -100000 || n > 100000) return { ok: false };

  return { ok: true, value: n };
}

function parseOptionalDisplayUrlInput(
  text: string,
  t: TranslateFn,
): { ok: true; value: string | null } | { ok: false; error: string } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };

  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { ok: false, error: t('monitor_form.error_display_url_protocol') };
    }
    return { ok: true, value: trimmed };
  } catch {
    return { ok: false, error: t('monitor_form.error_display_url_invalid') };
  }
}

function parseRegexPatternInput(
  pattern: string,
  mode: HttpResponseMatchMode,
  t: TranslateFn,
): { ok: true } | { ok: false; error: string } {
  if (mode !== 'regex' || pattern.trim().length === 0) {
    return { ok: true };
  }

  try {
    void new RegExp(pattern);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: t('monitor_form.error_regex_invalid', {
        message: err instanceof Error ? err.message : String(err),
      }),
    };
  }
}

function parseOptionalThresholdInput(
  text: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (!trimmed) return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };

  const n = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(n) || n < 0 || n > 86_400) return { ok: false };

  return { ok: true, value: n };
}

/** Renders the inherited value as the input's placeholder, so an empty field still shows what applies. */
function thresholdPlaceholder(fallback: number | undefined): string | undefined {
  return fallback === undefined ? undefined : String(fallback);
}

type FormIconProps = { className?: string };

const formIconProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  'aria-hidden': true,
} as const;

function TargetIcon({ className = 'h-4 w-4' }: FormIconProps) {
  return (
    <svg className={className} {...formIconProps}>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 3v3m0 12v3M3 12h3m12 0h3M12 16a4 4 0 100-8 4 4 0 000 8z"
      />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      className="mx-1 h-[10px] w-[10px] shrink-0 text-ink-3"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={3.6}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
    </svg>
  );
}

export function MonitorForm(props: CreateProps | EditProps) {
  const { t } = useI18n();
  const formId = useId();
  const monitor = props.monitor;
  const isPage = props.variant === 'page';
  const showBreadcrumb = props.showBreadcrumb ?? true;
  const heartbeatStandalone = props.initialType === 'heartbeat' || monitor?.type === 'heartbeat';
  const initialIntervalSec =
    monitor?.interval_sec ?? (props.initialType === 'heartbeat' ? 86_400 : 60);
  const groupOptions = useMemo(
    () =>
      [
        ...new Set(
          (props.groupOptions ?? []).map((name) => name.trim()).filter((name) => name.length > 0),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    [props.groupOptions],
  );

  const [name, setName] = useState(monitor?.name ?? '');
  const [groupName, setGroupName] = useState(monitor?.group_name ?? props.initialGroup ?? '');
  const [groupSortOrderInput, setGroupSortOrderInput] = useState(
    monitor ? String(monitor.group_sort_order) : '',
  );
  const [groupSortOrderTouched, setGroupSortOrderTouched] = useState(false);
  const [sortOrderInput, setSortOrderInput] = useState(String(monitor?.sort_order ?? 0));
  const [showOnStatusPage, setShowOnStatusPage] = useState(monitor?.show_on_status_page ?? true);
  const [type, setType] = useState<MonitorType>(monitor?.type ?? props.initialType ?? 'http');
  const [target, setTarget] = useState(monitor?.target ?? '');
  const [displayUrl, setDisplayUrl] = useState(monitor?.display_url ?? '');
  const [intervalInput, setIntervalInput] = useState(String(initialIntervalSec));
  const [heartbeatUnit, setHeartbeatUnit] = useState<HeartbeatUnit>(() =>
    heartbeatUnitFor(initialIntervalSec),
  );
  const [heartbeatGraceInput, setHeartbeatGraceInput] = useState(
    monitor?.heartbeat_grace_sec === null || monitor?.heartbeat_grace_sec === undefined
      ? ''
      : String(monitor.heartbeat_grace_sec),
  );
  const [heartbeatGraceUnit, setHeartbeatGraceUnit] = useState<HeartbeatUnit>(() =>
    heartbeatUnitFor(monitor?.heartbeat_grace_sec ?? 300),
  );
  const [timeoutInput, setTimeoutInput] = useState(String(monitor?.timeout_ms ?? 10000));
  const [failuresToDownInput, setFailuresToDownInput] = useState(() =>
    String(monitor?.confirmation_period_sec ??
      (Math.max(1, monitor?.failures_to_down_from_up ??
        props.stateThresholdDefaults?.failuresToDownFromUp ?? 2) - 1) * initialIntervalSec),
  );
  const [successesToUpInput, setSuccessesToUpInput] = useState(() =>
    String(monitor?.recovery_period_sec ??
      (Math.max(1, monitor?.successes_to_up_from_down ??
        props.stateThresholdDefaults?.successesToUpFromDown ?? 2) - 1) * initialIntervalSec),
  );
  const [httpMethod, setHttpMethod] = useState<HttpMethod>(
    toHttpMethod(monitor?.http_method ?? 'GET'),
  );

  const [attempted, setAttempted] = useState(false);
  const [kind, setKind] = useState<CheckKind>(() => deriveCheckKind(monitor, props.initialType));

  const selectKind = (next: CheckKind) => {
    if (monitor) return;
    setKind(next);
    setType(next === 'heartbeat' ? 'heartbeat' : next === 'host_ping' ? 'tcp' : 'http');
  };

  /** Breadcrumb label for a monitor being edited, falling back to its target. */
  const rowTargetLabel = monitor
    ? monitor.type === 'heartbeat'
      ? monitor.name
      : (monitor.display_url ?? monitor.target).replace(/^https?:\/\//, '')
    : '';

  const [showAdvanced, setShowAdvanced] = useState(
    () =>
      !!monitor &&
      (!monitor.show_on_status_page ||
        (monitor.display_url ?? '').length > 0 ||
        (monitor.group_name ?? '').length > 0 ||
        monitor.group_sort_order !== 0 ||
        monitor.sort_order !== 0 ||
        monitor.maintenance_window !== null ||
        monitor.failures_to_down_from_up !== null ||
        monitor.successes_to_up_from_down !== null ||
        monitor.ssl_expiry_enabled ||
        monitor.domain_expiry_enabled ||
        monitor.keep_cookies ||
        (monitor.type === 'http' &&
          (monitor.http_method !== 'GET' ||
            monitor.timeout_ms !== 10000 ||
            !monitor.follow_redirects ||
            Object.keys(monitor.http_headers_json ?? {}).length > 0 ||
            (monitor.http_body ?? '').length > 0 ||
            (monitor.expected_status_json ?? null) !== null ||
            (monitor.forbidden_status_json ?? null) !== null ||
            (monitor.response_keyword ?? '').length > 0 ||
            (monitor.response_forbidden_keyword ?? '').length > 0))),
  );
  const [showMetadata, setShowMetadata] = useState(() => (monitor?.metadata?.length ?? 0) > 0);

  const [headerRows, setHeaderRows] = useState<KeyValueRow[]>(() => initialHeaderRows(monitor));
  const [authUsername, setAuthUsername] = useState(() => initialBasicAuth(monitor)?.username ?? '');
  const [authPassword, setAuthPassword] = useState(() => initialBasicAuth(monitor)?.password ?? '');

  const [escalationMode, setEscalationMode] = useState<'all' | 'selected'>(() =>
    monitor?.notification_channel_ids && monitor.notification_channel_ids.length > 0
      ? 'selected'
      : 'all',
  );
  const [selectedChannelIds, setSelectedChannelIds] = useState<number[]>(
    () => monitor?.notification_channel_ids ?? [],
  );

  const [maintenanceStart, setMaintenanceStart] = useState(() =>
    monitor?.maintenance_window ? minutesToTimeInput(monitor.maintenance_window.start_minute) : '',
  );
  const [maintenanceEnd, setMaintenanceEnd] = useState(() =>
    monitor?.maintenance_window ? minutesToTimeInput(monitor.maintenance_window.end_minute) : '',
  );
  const [maintenanceDays, setMaintenanceDays] = useState<number[]>(
    () => monitor?.maintenance_window?.days ?? [],
  );
  const [maintenanceTimezone, setMaintenanceTimezone] = useState(
    () => monitor?.maintenance_window?.timezone ?? '',
  );

  const [metadataRows, setMetadataRows] = useState<KeyValueRow[]>(() =>
    (monitor?.metadata ?? []).map((entry) => createKeyValueRow(entry.key, entry.value)),
  );
  const [sslExpiryEnabled, setSslExpiryEnabled] = useState(monitor?.ssl_expiry_enabled ?? false);
  const [domainExpiryEnabled, setDomainExpiryEnabled] = useState(
    monitor?.domain_expiry_enabled ?? false,
  );
  const [sslAlertDays, setSslAlertDays] = useState(
    monitor?.ssl_expiry_alert_days ? String(monitor.ssl_expiry_alert_days) : '',
  );
  const [domainAlertDays, setDomainAlertDays] = useState(
    monitor?.domain_expiry_alert_days ? String(monitor.domain_expiry_alert_days) : '',
  );
  const [keepCookies, setKeepCookies] = useState(monitor?.keep_cookies ?? false);
  const [badgeCopied, setBadgeCopied] = useState(false);
  const [expiryResult, setExpiryResult] = useState<{
    ssl_expires_at: number | null;
    ssl_issuer: string | null;
    domain_expires_at: number | null;
    expiry_checked_at: number | null;
  } | null>(
    monitor
      ? {
          ssl_expires_at: monitor.ssl_expires_at,
          ssl_issuer: monitor.ssl_issuer,
          domain_expires_at: monitor.domain_expires_at,
          expiry_checked_at: monitor.expiry_checked_at,
        }
      : null,
  );
  const [expiryChecking, setExpiryChecking] = useState(false);
  const [expiryCheckError, setExpiryCheckError] = useState<string | null>(null);

  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const channelsQuery = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () => fetchNotificationChannels(),
  });
  const probesQuery = useQuery({
    queryKey: ['admin-probes'],
    queryFn: fetchAdminProbes,
  });
  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
  });

  // The monitor's own zone wins; otherwise the site zone, then the operator's browser.
  useEffect(() => {
    if (maintenanceTimezone.length > 0) return;
    const siteTimezone = settingsQuery.data?.settings.site_timezone?.trim();
    setMaintenanceTimezone(
      siteTimezone && siteTimezone.length > 0 ? siteTimezone : defaultTimezone(),
    );
  }, [maintenanceTimezone, settingsQuery.data]);

  const siteTimezone = settingsQuery.data?.settings.site_timezone ?? 'UTC';
  const channels = channelsQuery.data?.notification_channels ?? [];
  const timezones = useMemo(() => {
    const zones = listTimezones();
    return maintenanceTimezone.length > 0 && !zones.includes(maintenanceTimezone)
      ? [maintenanceTimezone, ...zones]
      : zones;
  }, [maintenanceTimezone]);
  // Intl formatting for ~400 zones is too costly to redo on every form re-render.
  const timezoneOptions = useMemo(
    () => timezones.map((zone) => ({ value: zone, label: `(${formatGmtOffset(zone)}) ${zone}` })),
    [timezones],
  );
  const enabledProbeRegions = useMemo(() => {
    const byRegion = new Map<string, number>();
    for (const probe of probesQuery.data?.probes ?? []) {
      if (!probe.is_enabled) continue;
      byRegion.set(probe.region, (byRegion.get(probe.region) ?? 0) + 1);
    }
    return [...byRegion.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [probesQuery.data]);

  const [expectedStatusInput, setExpectedStatusInput] = useState(() => {
    if (!monitor || monitor.type !== 'http') return '';
    return formatStatusRules(monitor.expected_status_json);
  });

  const [forbiddenStatusInput, setForbiddenStatusInput] = useState(() => {
    if (!monitor || monitor.type !== 'http') return '';
    return formatStatusRules(monitor.forbidden_status_json);
  });

  const [httpBody, setHttpBody] = useState(() =>
    monitor?.type === 'http' ? (monitor.http_body ?? '') : '',
  );
  const [followRedirects, setFollowRedirects] = useState(() =>
    monitor?.type === 'http' ? monitor.follow_redirects : true,
  );
  const [responseKeyword, setResponseKeyword] = useState(() =>
    monitor?.type === 'http' ? (monitor.response_keyword ?? '') : '',
  );
  const [responseKeywordMode, setResponseKeywordMode] = useState<HttpResponseMatchMode>(() =>
    monitor?.type === 'http'
      ? normalizeHttpResponseMatchMode(monitor.response_keyword_mode)
      : 'contains',
  );
  const [responseForbiddenKeyword, setResponseForbiddenKeyword] = useState(() =>
    monitor?.type === 'http' ? (monitor.response_forbidden_keyword ?? '') : '',
  );
  const [responseForbiddenKeywordMode, setResponseForbiddenKeywordMode] =
    useState<HttpResponseMatchMode>(() =>
      monitor?.type === 'http'
        ? normalizeHttpResponseMatchMode(monitor.response_forbidden_keyword_mode)
        : 'contains',
    );

  const displayUrlParse = useMemo(
    () => parseOptionalDisplayUrlInput(displayUrl, t),
    [displayUrl, t],
  );
  const expectedStatusParse = useMemo(
    () => parseStatusRulesInput(expectedStatusInput, t),
    [expectedStatusInput, t],
  );
  const forbiddenStatusParse = useMemo(
    () => parseStatusRulesInput(forbiddenStatusInput, t),
    [forbiddenStatusInput, t],
  );
  const responseKeywordRegexParse = useMemo(
    () => parseRegexPatternInput(responseKeyword, responseKeywordMode, t),
    [responseKeyword, responseKeywordMode, t],
  );
  const responseForbiddenKeywordRegexParse = useMemo(
    () => parseRegexPatternInput(responseForbiddenKeyword, responseForbiddenKeywordMode, t),
    [responseForbiddenKeyword, responseForbiddenKeywordMode, t],
  );
  const groupSortOrderParse = useMemo(
    () => parseOptionalSortOrderInput(groupSortOrderInput),
    [groupSortOrderInput],
  );
  const sortOrderParse = useMemo(
    () => parseOptionalSortOrderInput(sortOrderInput),
    [sortOrderInput],
  );
  const intervalSec = Number(intervalInput);
  const timeoutMs = Number(timeoutInput);
  const intervalValid =
    intervalInput.trim().length > 0 && Number.isInteger(intervalSec) && intervalSec >= 60;
  const heartbeatUnitSeconds =
    HEARTBEAT_UNITS.find((unit) => unit.id === heartbeatUnit)?.seconds ?? 1;
  const heartbeatIntervalValue =
    intervalInput.trim() === ''
      ? ''
      : String(Math.round(Number(intervalInput) / heartbeatUnitSeconds));
  const heartbeatGraceUnitSeconds =
    HEARTBEAT_UNITS.find((unit) => unit.id === heartbeatGraceUnit)?.seconds ?? 1;
  const heartbeatGraceValue =
    heartbeatGraceInput.trim() === ''
      ? ''
      : String(Math.round(Number(heartbeatGraceInput) / heartbeatGraceUnitSeconds));
  const heartbeatGraceSec = heartbeatGraceInput.trim() === '' ? null : Number(heartbeatGraceInput);
  const heartbeatGraceValid =
    heartbeatGraceSec === null ||
    (Number.isInteger(heartbeatGraceSec) && heartbeatGraceSec >= 0 && heartbeatGraceSec <= 86_400);
  const timeoutValid =
    timeoutInput.trim().length > 0 && Number.isInteger(timeoutMs) && timeoutMs >= 1000;
  const failuresToDownParse = useMemo(
    () => parseOptionalThresholdInput(failuresToDownInput),
    [failuresToDownInput],
  );
  const successesToUpParse = useMemo(
    () => parseOptionalThresholdInput(successesToUpInput),
    [successesToUpInput],
  );
  const stateThresholdsValid = failuresToDownParse.ok && successesToUpParse.ok;

  const hasStateThresholdOverride =
    failuresToDownInput.trim().length > 0 || successesToUpInput.trim().length > 0;

  const headerRowsParse = useMemo(() => parseHeaderRows(headerRows, t), [headerRows, t]);
  const basicAuthParse = useMemo(
    () => parseBasicAuthInput(authUsername, authPassword, t),
    [authUsername, authPassword, t],
  );
  const hasAuthorizationRow = useMemo(
    () => headerRows.some((row) => row.name.trim().toLowerCase() === 'authorization'),
    [headerRows],
  );
  /** Basic credentials are folded into the header set at submit time. */
  const httpHeadersParse = useMemo(() => {
    if (!headerRowsParse.ok) return headerRowsParse;
    if (!basicAuthParse.ok) return basicAuthParse;
    if (basicAuthParse.value !== null && hasAuthorizationRow) {
      return { ok: false as const, error: t('monitor_form.error_auth_conflict') };
    }
    const value = { ...headerRowsParse.value };
    if (basicAuthParse.value !== null) value.Authorization = `Basic ${basicAuthParse.value}`;
    return { ok: true as const, value };
  }, [headerRowsParse, basicAuthParse, hasAuthorizationRow, t]);
  const maintenanceParse = useMemo(
    () =>
      parseMaintenanceInput(
        maintenanceStart,
        maintenanceEnd,
        maintenanceDays,
        maintenanceTimezone,
        t,
      ),
    [maintenanceStart, maintenanceEnd, maintenanceDays, maintenanceTimezone, t],
  );
  const metadataParse = useMemo(() => parseMetadataRows(metadataRows, t), [metadataRows, t]);
  const escalationValid = escalationMode === 'all' || selectedChannelIds.length > 0;

  const advancedHttpValid =
    httpHeadersParse.ok &&
    expectedStatusParse.ok &&
    forbiddenStatusParse.ok &&
    responseKeywordRegexParse.ok &&
    responseForbiddenKeywordRegexParse.ok;
  const advancedError = !displayUrlParse.ok
    ? displayUrlParse.error
    : !groupSortOrderParse.ok || !sortOrderParse.ok
      ? t('monitor_form.error_sort_order')
      : type === 'http' && !httpHeadersParse.ok
        ? httpHeadersParse.error
        : !maintenanceParse.ok
          ? maintenanceParse.error
          : !advancedHttpValid
            ? t('monitor_form.advanced_errors')
            : undefined;

  const derivedName = monitorNameFromTarget(target);

  // Badge URLs are built from the current origin so previews and embeds stay on this instance.
  const badgeUrl =
    monitor && typeof window !== 'undefined'
      ? `${window.location.origin}/api/v1/public/badge/${monitor.id}.svg`
      : '';
  const badgeMarkdown = monitor ? `[![Uptimer](${badgeUrl})](${window.location.origin}/)` : '';

  const runExpiryCheck = () => {
    if (!monitor) return;
    setExpiryChecking(true);
    setExpiryCheckError(null);
    checkMonitorExpiry(monitor.id)
      .then((result) => {
        if (result.monitor) {
          setExpiryResult({
            ssl_expires_at: result.monitor.ssl_expires_at,
            ssl_issuer: result.monitor.ssl_issuer,
            domain_expires_at: result.monitor.domain_expires_at,
            expiry_checked_at: result.monitor.expiry_checked_at,
          });
          void queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
        }
        if (result.errors.length > 0) setExpiryCheckError(result.errors.join(' · '));
      })
      .catch((err: unknown) => {
        setExpiryCheckError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => setExpiryChecking(false));
  };

  const copyBadgeMarkdown = () => {
    if (!badgeMarkdown || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(badgeMarkdown).then(() => {
      setBadgeCopied(true);
      window.setTimeout(() => setBadgeCopied(false), 2000);
    });
  };

  const issues: string[] = [];
  if (name.trim().length === 0 && derivedName.length === 0) {
    issues.push(t('monitor_form.issue_name'));
  }
  if (type !== 'heartbeat' && target.trim().length === 0) {
    issues.push(
      type === 'http' ? t('monitor_form.issue_target_url') : t('monitor_form.issue_target_host'),
    );
  }
  if (!intervalValid) issues.push(t('monitor_form.error_interval'));
  if (!timeoutValid) issues.push(t('monitor_form.error_timeout'));
  if (!heartbeatGraceValid) issues.push(t('monitor_form.issue_grace'));
  if (!displayUrlParse.ok) issues.push(displayUrlParse.error);
  if (!groupSortOrderParse.ok || !sortOrderParse.ok) {
    issues.push(t('monitor_form.error_sort_order'));
  }
  if (!stateThresholdsValid) issues.push(t('monitor_form.state_thresholds_errors'));
  if (!escalationValid) issues.push(t('monitor_form.escalation_pick_channel'));
  if (type === 'http' && !httpHeadersParse.ok) issues.push(httpHeadersParse.error);
  if (type === 'http' && httpHeadersParse.ok && !advancedHttpValid) {
    issues.push(t('monitor_form.advanced_errors'));
  }
  if (!maintenanceParse.ok) issues.push(maintenanceParse.error);
  if (!metadataParse.ok) issues.push(metadataParse.error);

  const failure = props.error ?? (attempted && issues.length > 0 ? issues.join(' · ') : undefined);
  const failureTitle = monitor ? t('form.error_save') : t('form.error_create');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (issues.length > 0) {
      // Opening the collapsed section is what makes the offending field reachable.
      if (
        (type === 'http' && (!httpHeadersParse.ok || !advancedHttpValid)) ||
        !maintenanceParse.ok
      ) {
        setShowAdvanced(true);
      }
      if (!metadataParse.ok) setShowMetadata(true);
      return;
    }

    const normalizedGroupName = groupName.trim();
    const failuresToDown = failuresToDownParse.ok ? failuresToDownParse.value : null;
    const successesToUp = successesToUpParse.ok ? successesToUpParse.value : null;
    const notificationChannelIds = escalationMode === 'all' ? null : selectedChannelIds;
    const maintenanceWindow = maintenanceParse.ok ? maintenanceParse.value : null;
    const metadata = metadataParse.ok ? metadataParse.value : [];
    const base = {
      name: name.trim() || derivedName || monitor?.name || '',
      ...(type === 'heartbeat' ? {} : { target: target.trim() }),
      sort_order: sortOrderParse.ok ? (sortOrderParse.value ?? 0) : 0,
      show_on_status_page: showOnStatusPage,
      interval_sec: intervalSec,
      timeout_ms: timeoutMs,
      display_url: displayUrlParse.ok ? displayUrlParse.value : null,
      ...(type === 'heartbeat' ? { heartbeat_grace_sec: heartbeatGraceSec } : {}),
      confirmation_period_sec: failuresToDown,
      recovery_period_sec: successesToUp,
      notification_channel_ids: notificationChannelIds,
      maintenance_window: maintenanceWindow,
      metadata,
      ...(type === 'heartbeat'
        ? {}
        : {
            ssl_expiry_enabled: sslExpiryEnabled,
            domain_expiry_enabled: domainExpiryEnabled,
            ssl_expiry_alert_days: sslAlertDays ? Number(sslAlertDays) : null,
            domain_expiry_alert_days: domainAlertDays ? Number(domainAlertDays) : null,
            ...(type === 'http' ? { keep_cookies: keepCookies } : {}),
          }),
    };

    if (monitor) {
      const data: PatchMonitorInput = {
        ...base,
        group_name: normalizedGroupName.length > 0 ? normalizedGroupName : null,
      };
      if (
        groupSortOrderTouched &&
        groupSortOrderParse.ok &&
        groupSortOrderParse.value !== undefined
      ) {
        data.group_sort_order = groupSortOrderParse.value;
      }

      if (type === 'http') {
        data.http_method = httpMethod;
        data.follow_redirects = followRedirects;

        if (httpHeadersParse.ok) {
          data.http_headers_json =
            Object.keys(httpHeadersParse.value).length > 0 ? httpHeadersParse.value : null;
        }

        if (expectedStatusParse.ok) data.expected_status_json = expectedStatusParse.value;
        if (forbiddenStatusParse.ok) data.forbidden_status_json = forbiddenStatusParse.value;

        data.http_body = httpBody.trim().length > 0 ? httpBody : null;
        data.response_keyword = responseKeyword.trim().length > 0 ? responseKeyword.trim() : null;
        data.response_keyword_mode = responseKeyword.trim().length > 0 ? responseKeywordMode : null;
        data.response_forbidden_keyword =
          responseForbiddenKeyword.trim().length > 0 ? responseForbiddenKeyword.trim() : null;
        data.response_forbidden_keyword_mode =
          responseForbiddenKeyword.trim().length > 0 ? responseForbiddenKeywordMode : null;
      }

      props.onSubmit(data);
      return;
    }

    const data: CreateMonitorInput = { ...base, type };
    if (normalizedGroupName.length > 0) data.group_name = normalizedGroupName;
    if (groupSortOrderParse.ok && groupSortOrderParse.value !== undefined) {
      data.group_sort_order = groupSortOrderParse.value;
    }

    if (type === 'http') {
      data.http_method = httpMethod;
      data.follow_redirects = followRedirects;

      if (httpHeadersParse.ok && Object.keys(httpHeadersParse.value).length > 0) {
        data.http_headers_json = httpHeadersParse.value;
      }
      if (expectedStatusParse.ok && expectedStatusParse.value !== null) {
        data.expected_status_json = expectedStatusParse.value;
      }
      if (forbiddenStatusParse.ok && forbiddenStatusParse.value !== null) {
        data.forbidden_status_json = forbiddenStatusParse.value;
      }
      if (httpBody.trim().length > 0) data.http_body = httpBody;
      if (responseKeyword.trim().length > 0) {
        data.response_keyword = responseKeyword.trim();
        data.response_keyword_mode = responseKeywordMode;
      }
      if (responseForbiddenKeyword.trim().length > 0) {
        data.response_forbidden_keyword = responseForbiddenKeyword.trim();
        data.response_forbidden_keyword_mode = responseForbiddenKeywordMode;
      }
    }

    props.onSubmit(data);
  };

  const createLabel =
    type === 'heartbeat' ? t('heartbeats.create') : t('admin_dashboard.create_monitor');

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col">
      {!isPage && (
        <header className="flex items-center gap-3 border-b border-line px-5 py-3 sm:px-7">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent text-white">
            <TargetIcon />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="admin-modal-title"
              className="text-base font-semibold leading-5 tracking-tight text-ink"
            >
              {monitor ? t('admin_dashboard.edit_monitor') : createLabel}
            </h2>
            <p className="mt-1 text-xs leading-4 text-ink-2 dark:text-ink-3">
              {type === 'heartbeat' && !monitor
                ? t('monitor_form.subtitle_heartbeat')
                : t('monitor_form.subtitle')}
            </p>
          </div>
        </header>
      )}

      <div
        className={cn(
          'mx-auto w-full',
          isPage ? 'ui-form-page max-w-[1040px] px-5 pb-8 pt-10 md:pt-14' : 'px-5 py-5 sm:px-6',
        )}
      >
        {isPage && showBreadcrumb ? (
          <nav className="flex items-center gap-1 text-[13px] text-ink-2">
            <button
              type="button"
              onClick={props.onCancel}
              disabled={props.isLoading}
              className="-m-1 flex h-[26px] items-center gap-1.5 rounded p-1 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <TargetIcon className="h-5 w-5 shrink-0" />
              {type === 'heartbeat' ? t('heartbeats.title') : t('admin_dashboard.tab_all_monitors')}
            </button>
            <ChevronRightIcon />
            <span className="-m-1 flex h-[26px] items-center rounded p-1 font-medium text-ink">
              {monitor ? monitor.name || rowTargetLabel : createLabel}
            </span>
            {monitor ? (
              <>
                <ChevronRightIcon />
                <span className="-m-1 flex h-[26px] items-center rounded p-1">
                  {t('monitor_detail.configure')}
                </span>
              </>
            ) : null}
          </nav>
        ) : null}

        <h1 className={cn('ui-page-title', isPage ? 'mt-5' : 'mt-1')}>
          {monitor && isPage
            ? monitor.name
            : monitor
              ? t('admin_dashboard.edit_monitor')
              : createLabel}
        </h1>

        {isPage && monitor && (props.onTestAlert || props.onTogglePause || props.onDelete) ? (
          <div className="-mx-2 mt-4 flex flex-wrap items-center gap-2 md:gap-12">
            {props.onTestAlert ? (
              <button
                type="button"
                onClick={props.onTestAlert}
                disabled={props.actionPending || monitor.status === 'paused'}
                className="flex items-center gap-2 rounded px-2 py-1 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3"
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 12 3.269 3.126A59.768 59.768 0 0 1 21.485 12 59.77 59.77 0 0 1 3.27 20.876L5.999 12Zm0 0h7.5"
                  />
                </svg>
                {t('monitor_detail.send_test_alert')}
              </button>
            ) : null}
            {props.onTogglePause ? (
              <button
                type="button"
                onClick={props.onTogglePause}
                disabled={props.actionPending}
                className="flex items-center gap-2 rounded px-2 py-1 text-[13px] font-medium text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:text-ink-3"
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden
                >
                  {monitor.status === 'paused' ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                    />
                  ) : (
                    <>
                      <path strokeLinecap="round" d="M8.25 5.25v13.5M15.75 5.25v13.5" />
                    </>
                  )}
                </svg>
                {monitor.status === 'paused' ? t('common.resume') : t('common.pause')}
              </button>
            ) : null}
            {props.onDelete ? (
              <button
                type="button"
                onClick={props.onDelete}
                disabled={props.actionPending}
                className="flex items-center gap-2 rounded px-2 py-1 text-[13px] font-medium text-status-down transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:text-ink-3"
              >
                <svg
                  className="h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.6}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165"
                  />
                </svg>
                {t('common.delete')}
              </button>
            ) : null}
          </div>
        ) : null}

        {monitor && !isPage && (
          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5">
            <span className={cn('font-medium', `ui-monitor-state-${monitor.status}`)}>
              {t(`status.${monitor.status}`)}
            </span>
            <span className="text-ink-3">·</span>
            <span className="text-ink-2">#{monitor.id}</span>
            {monitor.last_latency_ms !== null && (
              <span className="text-ink-3 tabular-nums">
                · {Math.round(monitor.last_latency_ms)} ms
              </span>
            )}
          </div>
        )}

        {failure ? <FormErrorBanner title={failureTitle} description={failure} /> : null}

        <div className="mt-10 space-y-8 min-[900px]:space-y-10">
          <FormGroup
            label={t('monitor_form.section_target')}
            description={
              type === 'heartbeat'
                ? t('monitor_form.subtitle_heartbeat')
                : t('monitor_form.section_target_hint')
            }
            first
            last
          >
            {!heartbeatStandalone ? (
              <FormField htmlFor={`${formId}-kind`} label={t('monitor_form.alert_when')}>
                <select
                  id={`${formId}-kind`}
                  value={kind}
                  onChange={(event) => selectKind(event.target.value as CheckKind)}
                  disabled={!!monitor}
                  className={cn(nativeSelectClass, 'max-w-[280px]')}
                >
                  <option value="url_down">{t('monitor_form.kind_url_down')}</option>
                  <option value="url_lacks_keyword">
                    {t('monitor_form.kind_url_lacks_keyword')}
                  </option>
                  <option value="url_has_keyword">{t('monitor_form.kind_url_has_keyword')}</option>
                  <option value="url_status">{t('monitor_form.kind_url_status')}</option>
                  <option value="host_ping">{t('monitor_form.kind_host_ping')}</option>
                  <option value="heartbeat">{t('monitor_form.kind_heartbeat')}</option>
                </select>
              </FormField>
            ) : null}

            {type === 'http' ? (
              <>
                {kind === 'url_status' && (
                  <FormField
                    htmlFor={`${formId}-kind-status`}
                    label={t('monitor_form.expected_status_optional')}
                    help={t('monitor_form.expected_status_help')}
                    error={expectedStatusParse.ok ? undefined : expectedStatusParse.error}
                  >
                    <input
                      id={`${formId}-kind-status`}
                      type="text"
                      value={expectedStatusInput}
                      onChange={(e) => setExpectedStatusInput(e.target.value)}
                      className={cn(inputClass, 'font-mono')}
                      placeholder={t('monitor_form.expected_status_placeholder')}
                    />
                  </FormField>
                )}

                {kind === 'url_lacks_keyword' && (
                  <FormField
                    htmlFor={`${formId}-kind-keyword`}
                    label={t('monitor_form.response_must_contain_optional')}
                    help={
                      responseKeywordMode === 'regex'
                        ? t('monitor_form.response_regex_help')
                        : undefined
                    }
                    error={
                      responseKeywordRegexParse.ok ? undefined : responseKeywordRegexParse.error
                    }
                  >
                    <input
                      id={`${formId}-kind-keyword`}
                      type="text"
                      value={responseKeyword}
                      onChange={(e) => setResponseKeyword(e.target.value)}
                      className={cn(inputClass, 'font-mono')}
                      placeholder={t('monitor_form.response_must_contain_placeholder')}
                    />
                  </FormField>
                )}

                {kind === 'url_has_keyword' && (
                  <FormField
                    htmlFor={`${formId}-kind-forbidden-keyword`}
                    label={t('monitor_form.response_must_not_contain_optional')}
                    help={
                      responseForbiddenKeywordMode === 'regex'
                        ? t('monitor_form.response_regex_help')
                        : undefined
                    }
                    error={
                      responseForbiddenKeywordRegexParse.ok
                        ? undefined
                        : responseForbiddenKeywordRegexParse.error
                    }
                  >
                    <input
                      id={`${formId}-kind-forbidden-keyword`}
                      type="text"
                      value={responseForbiddenKeyword}
                      onChange={(e) => setResponseForbiddenKeyword(e.target.value)}
                      className={cn(inputClass, 'font-mono')}
                      placeholder={t('monitor_form.response_must_not_contain_placeholder')}
                    />
                  </FormField>
                )}

                <FormField
                  htmlFor={`${formId}-target`}
                  label={t('monitor_form.url_to_monitor')}
                  className={kind === 'url_down' ? undefined : 'mt-[53px]'}
                  error={
                    attempted && target.trim().length === 0
                      ? t('monitor_form.issue_target_url')
                      : undefined
                  }
                >
                  <input
                    id={`${formId}-target`}
                    type="text"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                    placeholder={t('monitor_form.target_url_placeholder')}
                    className={cn(inputClass, 'font-mono')}
                  />
                </FormField>
              </>
            ) : type === 'tcp' ? (
              <FormField
                htmlFor={`${formId}-target`}
                label={t('monitor_form.target_host_port')}
                help={t('monitor_form.target_host_port_help')}
                error={
                  attempted && target.trim().length === 0
                    ? t('monitor_form.issue_target_host')
                    : undefined
                }
              >
                <input
                  id={`${formId}-target`}
                  type="text"
                  value={target}
                  onChange={(e) => setTarget(e.target.value)}
                  placeholder={t('monitor_form.target_host_port_placeholder')}
                  className={cn(inputClass, 'font-mono')}
                />
              </FormField>
            ) : (
              <>
                <FormField
                  htmlFor={`${formId}-name`}
                  label={t('monitor_form.heartbeat_name')}
                  error={
                    attempted && name.trim().length === 0 ? t('monitor_form.issue_name') : undefined
                  }
                >
                  <input
                    id={`${formId}-name`}
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={t('monitor_form.name_placeholder')}
                    className={inputClass}
                  />
                </FormField>

                <div className="flex flex-col sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <label
                      htmlFor={`${formId}-interval`}
                      className="flex items-center text-[12px] font-medium text-ink-2"
                    >
                      {t('monitor_form.heartbeat_every')}
                    </label>
                  </div>
                  <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:flex-[2]">
                    <div className="w-16 shrink-0">
                      <input
                        id={`${formId}-interval`}
                        type="number"
                        min={1}
                        value={heartbeatIntervalValue}
                        onChange={(e) =>
                          setIntervalInput(
                            e.target.value.trim() === ''
                              ? ''
                              : String(Math.round(Number(e.target.value) * heartbeatUnitSeconds)),
                          )
                        }
                        className={cn(inputClass, 'font-mono tabular-nums')}
                        aria-invalid={intervalValid ? undefined : true}
                      />
                    </div>
                    <div className="w-fit min-w-[120px]">
                      <select
                        id={`${formId}-interval-unit`}
                        value={heartbeatUnit}
                        onChange={(event) => {
                          const shown = Number(intervalInput) / heartbeatUnitSeconds;
                          const nextUnit = event.target.value as HeartbeatUnit;
                          setHeartbeatUnit(nextUnit);
                          const nextSeconds =
                            HEARTBEAT_UNITS.find((unit) => unit.id === nextUnit)?.seconds ?? 1;
                          setIntervalInput(
                            String(Math.round((Number.isFinite(shown) ? shown : 1) * nextSeconds)),
                          );
                        }}
                        className={nativeSelectClass}
                        aria-label={t('monitor_form.heartbeat_every')}
                      >
                        {HEARTBEAT_UNITS.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {t(unit.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                    {attempted && !intervalValid && (
                      <p className="ui-error mt-0 whitespace-nowrap">
                        {t('monitor_form.error_interval')}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center">
                  <div className="flex-1">
                    <label
                      htmlFor={`${formId}-grace`}
                      className="block text-[12px] font-medium text-ink-2"
                    >
                      {t('monitor_form.heartbeat_grace')}
                    </label>
                    <p className="mt-1 text-[14px] leading-[21.7px] text-ink-2">
                      {t('monitor_form.heartbeat_grace_help')}
                    </p>
                  </div>
                  <div className="mt-3 flex items-center gap-2 sm:mt-0 sm:flex-[2]">
                    <div className="w-16 shrink-0">
                      <input
                        id={`${formId}-grace`}
                        type="number"
                        min={0}
                        value={heartbeatGraceValue}
                        placeholder={t('monitor_form.heartbeat_grace_auto')}
                        onChange={(e) =>
                          setHeartbeatGraceInput(
                            e.target.value.trim() === ''
                              ? ''
                              : String(
                                  Math.round(Number(e.target.value) * heartbeatGraceUnitSeconds),
                                ),
                          )
                        }
                        className={cn(inputClass, 'font-mono tabular-nums')}
                        aria-invalid={heartbeatGraceValid ? undefined : true}
                      />
                    </div>
                    <div className="w-fit min-w-[120px]">
                      <select
                        id={`${formId}-grace-unit`}
                        value={heartbeatGraceUnit}
                        onChange={(event) => {
                          const shown = Number(heartbeatGraceInput) / heartbeatGraceUnitSeconds;
                          const nextUnit = event.target.value as HeartbeatUnit;
                          setHeartbeatGraceUnit(nextUnit);
                          const nextSeconds =
                            HEARTBEAT_UNITS.find((unit) => unit.id === nextUnit)?.seconds ?? 1;
                          setHeartbeatGraceInput(
                            String(Math.round((Number.isFinite(shown) ? shown : 1) * nextSeconds)),
                          );
                        }}
                        className={nativeSelectClass}
                        aria-label={t('monitor_form.heartbeat_grace')}
                      >
                        {HEARTBEAT_UNITS.map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {t(unit.label)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {attempted && !heartbeatGraceValid && (
                  <p className="ui-error">{t('monitor_form.issue_grace')}</p>
                )}
              </>
            )}
          </FormGroup>

          <FormGroup
            label={t('monitor_form.section_escalation')}
            description={t('monitor_form.section_escalation_hint')}
            first
            last
          >
            <div className="ui-monitor-escalation-options">
              <label
                className="ui-monitor-escalation-option"
                data-selected={escalationMode === 'all'}
              >
                <input
                  type="radio"
                  name={`${formId}-escalation`}
                  checked={escalationMode === 'all'}
                  onChange={() => setEscalationMode('all')}
                  className="ui-radio mt-[0.2rem]"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium leading-5 text-ink">
                    {t('monitor_form.escalation_all_channels')}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-[18px] text-ink-2">
                    {t('monitor_form.escalation_all_channels_help')}
                  </span>
                </span>
              </label>

              <label
                className="ui-monitor-escalation-option"
                data-selected={escalationMode === 'selected'}
              >
                <input
                  type="radio"
                  name={`${formId}-escalation`}
                  checked={escalationMode === 'selected'}
                  onChange={() => setEscalationMode('selected')}
                  className="ui-radio mt-[0.2rem]"
                />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium leading-5 text-ink">
                    {t('monitor_form.escalation_selected_channels')}
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-[18px] text-ink-2">
                    {t('monitor_form.escalation_selected_channels_help')}
                  </span>
                </span>
              </label>
            </div>

            {escalationMode === 'selected' ? (
              <div>
                <p className="text-[12px] font-medium text-ink-2">
                  {t('monitor_form.escalation_channel_list')}
                </p>
                {channels.length === 0 ? (
                  <p className="mt-2 text-[13px] leading-5 text-ink-3">
                    {t('monitor_form.escalation_no_channels')}
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {channels.map((channel) => (
                      <label key={channel.id} className="flex cursor-pointer items-center gap-2.5">
                        <input
                          type="checkbox"
                          checked={selectedChannelIds.includes(channel.id)}
                          onChange={(event) =>
                            setSelectedChannelIds((previous) =>
                              event.target.checked
                                ? [...previous, channel.id]
                                : previous.filter((id) => id !== channel.id),
                            )
                          }
                          className="ui-checkbox"
                        />
                        <span className="min-w-0 text-[14px] text-ink">{channel.name}</span>
                        {channel.is_active ? null : (
                          <span className="text-[12px] text-ink-3">
                            {t('probes.health_disabled')}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
                {attempted && !escalationValid ? (
                  <p className="ui-error">{t('monitor_form.escalation_pick_channel')}</p>
                ) : null}
              </div>
            ) : null}
          </FormGroup>
        </div>

        <div className="mt-10 space-y-2">
          <FormCollapse
            id={`${formId}-advanced`}
            title={t('monitor_form.section_advanced')}
            compact
            open={showAdvanced}
            onToggle={() => setShowAdvanced((previous) => !previous)}
            error={advancedError}
          >
            <div className="space-y-8 min-[900px]:space-y-0">
              <FormGroup
                label={t('monitor_form.section_advanced')}
                description={t('monitor_form.section_advanced_group_hint')}
                first
                last={false}
              >
                {type === 'heartbeat' ? null : (
                  <FormField
                    htmlFor={`${formId}-name`}
                    label={t('monitor_form.monitor_name')}
                    help={t('monitor_form.monitor_name_help')}
                    error={
                      attempted && name.trim().length === 0 && derivedName.length === 0
                        ? t('monitor_form.issue_name')
                        : undefined
                    }
                  >
                    <input
                      id={`${formId}-name`}
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={t('monitor_form.name_placeholder')}
                      className={inputClass}
                    />
                  </FormField>
                )}

                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-8">
                  <FormField
                    htmlFor={`${formId}-failures-to-down`}
                    label={t('monitor_form.confirmation_period')}
                    help={t('monitor_form.confirmation_help')}
                  >
                    <input
                      id={`${formId}-failures-to-down`}
                      type="number"
                      min={0}
                      max={86400}
                      value={failuresToDownInput}
                      onChange={(e) => setFailuresToDownInput(e.target.value)}
                      placeholder={thresholdPlaceholder(
                        Math.max(0, ((props.stateThresholdDefaults?.failuresToDownFromUp ?? 2) - 1) * intervalSec),
                      )}
                      className={cn(inputClass, 'font-mono tabular-nums')}
                    />
                  </FormField>

                  <FormField
                    htmlFor={`${formId}-successes-to-up`}
                    label={t('monitor_form.recovery_period')}
                    help={t('monitor_form.recovery_help')}
                  >
                    <input
                      id={`${formId}-successes-to-up`}
                      type="number"
                      min={0}
                      max={86400}
                      value={successesToUpInput}
                      onChange={(e) => setSuccessesToUpInput(e.target.value)}
                      placeholder={thresholdPlaceholder(
                        Math.max(0, ((props.stateThresholdDefaults?.successesToUpFromDown ?? 2) - 1) * intervalSec),
                      )}
                      className={cn(inputClass, 'font-mono tabular-nums')}
                    />
                  </FormField>
                </div>

                {stateThresholdsValid ? null : (
                  <p role="alert" className="text-[14px] text-status-down">
                    {t('monitor_form.state_thresholds_errors')}
                  </p>
                )}

                {hasStateThresholdOverride ? (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => {
                        setFailuresToDownInput('');
                        setSuccessesToUpInput('');
                      }}
                      className="text-[13px] font-medium text-ink-2 underline decoration-line underline-offset-2 transition-colors hover:text-ink"
                    >
                      {t('monitor_form.use_site_defaults')}
                    </button>
                  </div>
                ) : null}

                {type === 'heartbeat' ? null : (
                  <FormField
                    htmlFor={`${formId}-interval`}
                    label={t('monitor_form.plan_every')}
                    help={t('monitor_form.interval_help')}
                    error={
                      attempted && !intervalValid ? t('monitor_form.error_interval') : undefined
                    }
                  >
                    <div className="flex items-center gap-2">
                      <input
                        id={`${formId}-interval`}
                        type="number"
                        value={intervalInput}
                        onChange={(e) => setIntervalInput(e.target.value)}
                        min={60}
                        className={cn(inputClass, 'font-mono tabular-nums sm:max-w-[10rem]')}
                      />
                      <span className="shrink-0 text-[13px] text-ink-3">
                        {t('monitor_form.unit_seconds')}
                      </span>
                    </div>
                  </FormField>
                )}

                <FormField
                  htmlFor={`${formId}-display-url`}
                  label={t('monitor_form.display_url_optional')}
                  help={t('monitor_form.display_url_help')}
                  error={displayUrlParse.ok ? undefined : displayUrlParse.error}
                >
                  <input
                    id={`${formId}-display-url`}
                    type="url"
                    value={displayUrl}
                    onChange={(e) => setDisplayUrl(e.target.value)}
                    placeholder={t('monitor_form.display_url_placeholder')}
                    className={inputClass}
                  />
                </FormField>

                <CheckboxRow
                  id={`${formId}-status-page`}
                  label={t('monitor_form.show_on_status_page')}
                  help={t('monitor_form.show_on_status_page_help')}
                  checked={showOnStatusPage}
                  onChange={setShowOnStatusPage}
                />
              </FormGroup>

              {type === 'heartbeat' ? null : (
                <FormGroup
                  label={t('monitor_form.section_ssl')}
                  description={t('monitor_form.section_ssl_hint')}
                  first={false}
                  last={false}
                >
                  <CheckboxRow
                    id={`${formId}-ssl-expiry`}
                    label={t('monitor_form.ssl_expiry')}
                    help={t('monitor_form.ssl_expiry_help')}
                    checked={sslExpiryEnabled}
                    onChange={setSslExpiryEnabled}
                  />
                  {sslExpiryEnabled ? (
                    <label className="block max-w-[280px] text-[12px] font-medium text-ink-2">
                      {t('monitor_form.expiry_alert_days')}
                      <select
                        value={sslAlertDays}
                        onChange={(event) => setSslAlertDays(event.target.value)}
                        className={cn(nativeSelectClass, 'mt-1.5 max-w-[280px]')}
                        aria-label={t('monitor_form.expiry_alert_days')}
                      >
                        <option value="">{t('monitor_form.expiry_alert_days_default')}</option>
                        {EXPIRY_ALERT_DAY_OPTIONS.map((days) => (
                          <option key={days} value={String(days)}>
                            {t('monitor_form.expiry_alert_days_value', { days })}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {sslExpiryEnabled && monitor ? (
                    <p className="text-[13px] leading-5 text-ink-2">
                      {expiryResult?.ssl_expires_at !== null &&
                      expiryResult?.ssl_expires_at !== undefined
                        ? [
                            t('monitor_form.ssl_expires_at', {
                              date: formatDateTime(expiryResult.ssl_expires_at, siteTimezone),
                            }),
                            expiryResult.ssl_issuer
                              ? t('monitor_form.ssl_issuer', { issuer: expiryResult.ssl_issuer })
                              : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')
                        : expiryResult?.expiry_checked_at
                          ? t('monitor_form.expiry_unavailable')
                          : t('monitor_form.expiry_not_checked')}
                    </p>
                  ) : null}

                  <CheckboxRow
                    id={`${formId}-domain-expiry`}
                    label={t('monitor_form.domain_expiry')}
                    help={t('monitor_form.domain_expiry_help')}
                    checked={domainExpiryEnabled}
                    onChange={setDomainExpiryEnabled}
                  />
                  {domainExpiryEnabled ? (
                    <label className="block max-w-[280px] text-[12px] font-medium text-ink-2">
                      {t('monitor_form.expiry_alert_days')}
                      <select
                        value={domainAlertDays}
                        onChange={(event) => setDomainAlertDays(event.target.value)}
                        className={cn(nativeSelectClass, 'mt-1.5 max-w-[280px]')}
                        aria-label={t('monitor_form.expiry_alert_days')}
                      >
                        <option value="">{t('monitor_form.expiry_alert_days_default')}</option>
                        {EXPIRY_ALERT_DAY_OPTIONS.map((days) => (
                          <option key={days} value={String(days)}>
                            {t('monitor_form.expiry_alert_days_value', { days })}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}
                  {domainExpiryEnabled && monitor ? (
                    <p className="text-[13px] leading-5 text-ink-2">
                      {expiryResult?.domain_expires_at !== null &&
                      expiryResult?.domain_expires_at !== undefined
                        ? t('monitor_form.domain_expires_at', {
                            date: formatDateTime(expiryResult.domain_expires_at, siteTimezone),
                          })
                        : expiryResult?.expiry_checked_at
                          ? t('monitor_form.expiry_unavailable')
                          : t('monitor_form.expiry_not_checked')}
                    </p>
                  ) : null}

                  {monitor ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={runExpiryCheck}
                        disabled={expiryChecking || (!sslExpiryEnabled && !domainExpiryEnabled)}
                      >
                        {expiryChecking
                          ? t('monitor_form.expiry_checking')
                          : t('monitor_form.expiry_check_now')}
                      </Button>
                      {expiryResult?.expiry_checked_at ? (
                        <span className="text-[12px] leading-5 text-ink-3">
                          {t('monitor_form.expiry_checked', {
                            date: formatDateTime(expiryResult.expiry_checked_at, siteTimezone),
                          })}
                        </span>
                      ) : null}
                    </div>
                  ) : null}

                  {expiryCheckError ? <p className="ui-error">{expiryCheckError}</p> : null}
                </FormGroup>
              )}

              {type === 'http' && (
                <>
                  <FormGroup
                    label={t('monitor_form.advanced_request')}
                    description={t('monitor_form.advanced_request_hint')}
                    first={false}
                    last={false}
                  >
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-8">
                      <FormField
                        htmlFor={`${formId}-method`}
                        label={t('monitor_form.method')}
                        help={t('monitor_form.method_help')}
                      >
                        <select
                          id={`${formId}-method`}
                          value={httpMethod}
                          onChange={(event) => setHttpMethod(toHttpMethod(event.target.value))}
                          className={nativeSelectClass}
                        >
                          <option value="GET">GET</option>
                          <option value="POST">POST</option>
                          <option value="PUT">PUT</option>
                          <option value="PATCH">PATCH</option>
                          <option value="DELETE">DELETE</option>
                          <option value="HEAD">HEAD</option>
                        </select>
                      </FormField>

                      <FormField
                        htmlFor={`${formId}-timeout`}
                        label={t('monitor_form.request_timeout')}
                        help={t('monitor_form.request_timeout_help')}
                        error={
                          attempted && !timeoutValid ? t('monitor_form.error_timeout') : undefined
                        }
                      >
                        <div className="flex items-center gap-2">
                          <input
                            id={`${formId}-timeout`}
                            type="number"
                            value={timeoutInput}
                            onChange={(e) => setTimeoutInput(e.target.value)}
                            min={1000}
                            className={cn(inputClass, 'font-mono tabular-nums')}
                          />
                          <span className="shrink-0 text-[13px] text-ink-3">
                            {t('monitor_form.unit_ms')}
                          </span>
                        </div>
                      </FormField>
                    </div>

                    <FormField
                      htmlFor={`${formId}-body`}
                      label={t('monitor_form.body_optional')}
                      help={t('monitor_form.body_hint')}
                    >
                      <textarea
                        id={`${formId}-body`}
                        value={httpBody}
                        onChange={(e) => setHttpBody(e.target.value)}
                        className={`${textareaClass} font-mono`}
                        rows={3}
                        placeholder={t('monitor_form.body_placeholder_default')}
                      />
                    </FormField>

                    <CheckboxRow
                      id={`${formId}-follow-redirects`}
                      label={t('monitor_form.follow_redirects')}
                      help={t('monitor_form.follow_redirects_help')}
                      checked={followRedirects}
                      onChange={setFollowRedirects}
                    />

                    <CheckboxRow
                      id={`${formId}-keep-cookies`}
                      label={t('monitor_form.keep_cookies')}
                      help={t('monitor_form.keep_cookies_help')}
                      checked={keepCookies}
                      onChange={setKeepCookies}
                    />
                  </FormGroup>

                  <FormGroup
                    label={t('monitor_form.advanced_headers')}
                    description={t('monitor_form.advanced_headers_hint')}
                    first={false}
                    last={false}
                  >
                    <div>
                      <KeyValueRows
                        rows={headerRows}
                        onChange={setHeaderRows}
                        nameLabel={t('monitor_form.header_name')}
                        valueLabel={t('monitor_form.header_value')}
                        addLabel={t('monitor_form.add_header')}
                        removeLabel={t('monitor_form.remove_row')}
                        mono
                      />
                      {httpHeadersParse.ok ? (
                        <p className={FIELD_HELP_CLASS}>{t('monitor_form.headers_new_help')}</p>
                      ) : (
                        <p className="ui-error">{httpHeadersParse.error}</p>
                      )}
                    </div>
                  </FormGroup>

                  <FormGroup
                    label={t('monitor_form.section_http_auth')}
                    description={t('monitor_form.section_http_auth_hint')}
                    first={false}
                    last={false}
                  >
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-8">
                      <FormField
                        htmlFor={`${formId}-auth-username`}
                        label={t('monitor_form.basic_auth_username')}
                        help={t('monitor_form.basic_auth_help')}
                      >
                        <input
                          id={`${formId}-auth-username`}
                          type="text"
                          autoComplete="off"
                          value={authUsername}
                          onChange={(e) => setAuthUsername(e.target.value)}
                          className={inputClass}
                        />
                      </FormField>
                      <FormField
                        htmlFor={`${formId}-auth-password`}
                        label={t('monitor_form.basic_auth_password')}
                      >
                        <input
                          id={`${formId}-auth-password`}
                          type="password"
                          autoComplete="new-password"
                          value={authPassword}
                          onChange={(e) => setAuthPassword(e.target.value)}
                          className={inputClass}
                        />
                      </FormField>
                    </div>
                    {basicAuthParse.ok ? null : <p className="ui-error">{basicAuthParse.error}</p>}
                  </FormGroup>

                  <FormGroup
                    label={t('monitor_form.advanced_assertions')}
                    description={t('monitor_form.advanced_assertions_hint')}
                    first={false}
                    last={false}
                  >
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 sm:gap-x-8">
                      <FormField
                        htmlFor={`${formId}-expected-status`}
                        label={t('monitor_form.expected_status_optional')}
                        help={t('monitor_form.expected_status_help')}
                        error={expectedStatusParse.ok ? undefined : expectedStatusParse.error}
                      >
                        <input
                          id={`${formId}-expected-status`}
                          type="text"
                          value={expectedStatusInput}
                          onChange={(e) => setExpectedStatusInput(e.target.value)}
                          className={cn(inputClass, 'font-mono')}
                          placeholder={t('monitor_form.expected_status_placeholder')}
                        />
                      </FormField>
                      <FormField
                        htmlFor={`${formId}-forbidden-status`}
                        label={t('monitor_form.forbidden_status_optional')}
                        help={t('monitor_form.forbidden_status_help')}
                        error={forbiddenStatusParse.ok ? undefined : forbiddenStatusParse.error}
                      >
                        <input
                          id={`${formId}-forbidden-status`}
                          type="text"
                          value={forbiddenStatusInput}
                          onChange={(e) => setForbiddenStatusInput(e.target.value)}
                          className={cn(inputClass, 'font-mono')}
                          placeholder={t('monitor_form.forbidden_status_placeholder')}
                        />
                      </FormField>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-x-8">
                      <FormField
                        htmlFor={`${formId}-required-keyword`}
                        label={t('monitor_form.response_must_contain_optional')}
                        help={
                          responseKeywordMode === 'regex'
                            ? t('monitor_form.response_regex_help')
                            : undefined
                        }
                        error={
                          responseKeywordRegexParse.ok ? undefined : responseKeywordRegexParse.error
                        }
                      >
                        <input
                          id={`${formId}-required-keyword`}
                          type="text"
                          value={responseKeyword}
                          onChange={(e) => setResponseKeyword(e.target.value)}
                          className={cn(inputClass, 'font-mono')}
                          placeholder={t('monitor_form.response_must_contain_placeholder')}
                        />
                      </FormField>
                      <FormField
                        htmlFor={`${formId}-required-mode`}
                        label={t('monitor_form.match_mode')}
                      >
                        <select
                          id={`${formId}-required-mode`}
                          value={responseKeywordMode}
                          onChange={(event) =>
                            setResponseKeywordMode(event.target.value as HttpResponseMatchMode)
                          }
                          className={nativeSelectClass}
                        >
                          <option value="contains">{t('monitor_form.match_mode_contains')}</option>
                          <option value="regex">{t('monitor_form.match_mode_regex')}</option>
                        </select>
                      </FormField>
                    </div>

                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-x-8">
                      <FormField
                        htmlFor={`${formId}-forbidden-keyword`}
                        label={t('monitor_form.response_must_not_contain_optional')}
                        help={
                          responseForbiddenKeywordMode === 'regex'
                            ? t('monitor_form.response_regex_help')
                            : undefined
                        }
                        error={
                          responseForbiddenKeywordRegexParse.ok
                            ? undefined
                            : responseForbiddenKeywordRegexParse.error
                        }
                      >
                        <input
                          id={`${formId}-forbidden-keyword`}
                          type="text"
                          value={responseForbiddenKeyword}
                          onChange={(e) => setResponseForbiddenKeyword(e.target.value)}
                          className={cn(inputClass, 'font-mono')}
                          placeholder={t('monitor_form.response_must_not_contain_placeholder')}
                        />
                      </FormField>
                      <FormField
                        htmlFor={`${formId}-forbidden-mode`}
                        label={t('monitor_form.match_mode')}
                      >
                        <select
                          id={`${formId}-forbidden-mode`}
                          value={responseForbiddenKeywordMode}
                          onChange={(event) =>
                            setResponseForbiddenKeywordMode(
                              event.target.value as HttpResponseMatchMode,
                            )
                          }
                          className={nativeSelectClass}
                        >
                          <option value="contains">{t('monitor_form.match_mode_contains')}</option>
                          <option value="regex">{t('monitor_form.match_mode_regex')}</option>
                        </select>
                      </FormField>
                    </div>

                    {monitor ? (
                      <div className={FIELD_HELP_CLASS}>{t('monitor_form.clear_help')}</div>
                    ) : null}
                  </FormGroup>
                </>
              )}

              <FormGroup
                label={t('monitor_form.section_maintenance')}
                description={t('monitor_form.section_maintenance_hint')}
                first={false}
                last={false}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[14px] font-medium text-ink-2">
                      {t('monitor_form.maintenance_between')}
                    </span>
                    <input
                      type="time"
                      value={maintenanceStart}
                      onChange={(e) => setMaintenanceStart(e.target.value)}
                      aria-label={t('monitor_form.maintenance_start')}
                      className={cn(inputClass, 'w-[7.5rem] font-mono tabular-nums')}
                    />
                    <span className="text-[13px] text-ink-3">
                      {t('monitor_form.maintenance_and')}
                    </span>
                    <input
                      type="time"
                      value={maintenanceEnd}
                      onChange={(e) => setMaintenanceEnd(e.target.value)}
                      aria-label={t('monitor_form.maintenance_end')}
                      className={cn(inputClass, 'w-[7.5rem] font-mono tabular-nums')}
                    />
                    <Select
                      value={maintenanceTimezone}
                      onChange={setMaintenanceTimezone}
                      className={cn(selectClass, 'w-fit min-w-[14rem]')}
                      aria-label={t('monitor_form.maintenance_timezone')}
                    >
                      {timezoneOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  </div>

                  <p className="mt-2 text-[14px] leading-[21.7px] text-ink-2">
                    {t('monitor_form.maintenance_now', {
                      time: formatTimeInZone(maintenanceTimezone),
                      timezone: `${formatGmtOffset(maintenanceTimezone)} ${maintenanceTimezone}`,
                    })}
                  </p>

                  <div
                    role="group"
                    aria-label={t('monitor_form.maintenance_days')}
                    className="mt-4 flex flex-wrap items-center gap-2"
                  >
                    {WEEKDAYS.map(({ day, label }) => {
                      const active = maintenanceDays.includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          aria-pressed={active}
                          data-active={active}
                          onClick={() =>
                            setMaintenanceDays((previous) =>
                              active
                                ? previous.filter((value) => value !== day)
                                : [...previous, day],
                            )
                          }
                          className="ui-day-chip"
                        >
                          {t(label)}
                        </button>
                      );
                    })}
                    {maintenanceStart.length > 0 ||
                    maintenanceEnd.length > 0 ||
                    maintenanceDays.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMaintenanceStart('');
                          setMaintenanceEnd('');
                          setMaintenanceDays([]);
                        }}
                        className="ml-1 text-[13px] font-medium text-ink-2 underline decoration-line underline-offset-2 transition-colors hover:text-ink"
                      >
                        {t('monitor_form.maintenance_clear')}
                      </button>
                    ) : null}
                  </div>

                  {maintenanceParse.ok ? null : (
                    <p className="ui-error">{maintenanceParse.error}</p>
                  )}
                </div>
              </FormGroup>

              {type === 'heartbeat' ? null : (
                <FormGroup
                  label={t('monitor_form.section_regions')}
                  description={t('monitor_form.section_regions_hint')}
                  first={false}
                  last={false}
                >
                  <div>
                    {enabledProbeRegions.length === 0 ? (
                      <p className="text-[13px] leading-5 text-ink-3">
                        {t('monitor_form.regions_none')}
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {enabledProbeRegions.map(([region, count]) => (
                          <span
                            key={region}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2.5 py-1 text-[13px] text-ink-2"
                          >
                            {region}
                            <span className="tabular-nums text-ink-3">{count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                    <p className={FIELD_HELP_CLASS}>
                      {monitor?.probe_mode === 'multi_region'
                        ? t('monitor_form.regions_multi_note')
                        : t('monitor_form.regions_worker_note')}
                    </p>
                    {isPage ? (
                      <button
                        type="button"
                        onClick={() => navigate(ADMIN_PROBES_PATH)}
                        className="mt-2 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover"
                      >
                        {t('monitor_form.regions_manage')}
                      </button>
                    ) : null}
                  </div>
                </FormGroup>
              )}

              {isPage && monitor ? (
                <FormGroup
                  label={t('monitor_form.section_badge')}
                  description={t('monitor_form.section_badge_hint')}
                  first={false}
                  last={false}
                >
                  {showOnStatusPage ? (
                    <div>
                      <div className="flex items-center gap-3">
                        <img src={badgeUrl} alt={monitor.name} height={20} className="h-5 w-auto" />
                        <span className="text-[12px] text-ink-3">
                          {t('monitor_form.badge_hint')}
                        </span>
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <input
                          id={`${formId}-badge`}
                          type="text"
                          readOnly
                          value={badgeMarkdown}
                          onFocus={(e) => e.currentTarget.select()}
                          className={cn(inputClass, 'font-mono text-[12px]')}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={copyBadgeMarkdown}
                          className="shrink-0"
                        >
                          {badgeCopied
                            ? t('monitor_form.badge_copied')
                            : t('monitor_form.badge_copy')}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="text-[13px] leading-5 text-ink-2">
                      {t('monitor_form.badge_hidden')}
                    </p>
                  )}
                </FormGroup>
              ) : null}

              <FormGroup
                label={t('monitor_form.grouping_section')}
                description={t('monitor_form.grouping_hint')}
                first={false}
                last
              >
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-[minmax(0,1fr)_7rem_7rem] sm:gap-x-8">
                  <FormField htmlFor={`${formId}-group`} label={t('monitor_form.group_optional')}>
                    <input
                      id={`${formId}-group`}
                      type="text"
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      className={inputClass}
                      placeholder={t('monitor_form.group_placeholder')}
                      list="monitor-group-options"
                    />
                    {groupOptions.length > 0 && (
                      <datalist id="monitor-group-options">
                        {groupOptions.map((group) => (
                          <option key={group} value={group} />
                        ))}
                      </datalist>
                    )}
                  </FormField>
                  <FormField
                    htmlFor={`${formId}-group-order`}
                    label={t('monitor_form.group_order')}
                    error={groupSortOrderParse.ok ? undefined : t('monitor_form.error_sort_order')}
                  >
                    <input
                      id={`${formId}-group-order`}
                      type="number"
                      value={groupSortOrderInput}
                      placeholder="0"
                      onChange={(e) => {
                        setGroupSortOrderInput(e.target.value);
                        setGroupSortOrderTouched(true);
                      }}
                      min={-100000}
                      max={100000}
                      className={cn(inputClass, 'font-mono tabular-nums')}
                    />
                  </FormField>
                  <FormField
                    htmlFor={`${formId}-sort-order`}
                    label={t('monitor_form.sort_order')}
                    error={sortOrderParse.ok ? undefined : t('monitor_form.error_sort_order')}
                  >
                    <input
                      id={`${formId}-sort-order`}
                      type="number"
                      value={sortOrderInput}
                      onChange={(e) => setSortOrderInput(e.target.value)}
                      min={-100000}
                      max={100000}
                      className={cn(inputClass, 'font-mono tabular-nums')}
                    />
                  </FormField>
                </div>
              </FormGroup>
            </div>
          </FormCollapse>

          <FormCollapse
            id={`${formId}-metadata`}
            title={t('monitor_form.section_metadata')}
            compact
            open={showMetadata}
            onToggle={() => setShowMetadata((previous) => !previous)}
            error={metadataParse.ok ? undefined : metadataParse.error}
          >
            <div className="rounded-xl border border-line bg-surface p-6">
              <p className="mb-5 text-[14px] leading-[21.7px] text-ink-2">
                {t('monitor_form.metadata_hint')}
              </p>
              <KeyValueRows
                rows={metadataRows}
                onChange={setMetadataRows}
                nameLabel={t('monitor_form.metadata_name')}
                valueLabel={t('monitor_form.metadata_value')}
                addLabel={t('monitor_form.add_metadata')}
                removeLabel={t('monitor_form.remove_row')}
              />
              {metadataParse.ok ? null : <p className="ui-error">{metadataParse.error}</p>}
            </div>
          </FormCollapse>
        </div>

        {isPage ? (
          <div className="mt-10 grid gap-3 min-[900px]:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)] min-[900px]:gap-x-12 xl:gap-x-16">
            <div className="hidden lg:block" />
            <div className="min-w-0">
              <Button type="submit" size="lg" disabled={props.isLoading}>
                {props.isLoading
                  ? t('common.saving')
                  : monitor
                    ? t('monitor_form.submit_update')
                    : createLabel}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={props.onCancel}
              disabled={props.isLoading}
              className="min-w-24"
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={props.isLoading} className="min-w-40">
              {props.isLoading
                ? t('common.saving')
                : monitor
                  ? t('monitor_form.submit_update')
                  : createLabel}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}

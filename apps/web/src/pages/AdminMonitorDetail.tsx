import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ADMIN_EVENTS_PATH, ADMIN_PATH, adminIncidentDetailPath } from '../app/adminPaths';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { useI18n } from '../app/I18nContext';
import {
  ApiError,
  deleteMonitor,
  fetchAdminIncidents,
  fetchAdminMonitor,
  fetchAdminMonitorAnalytics,
  fetchAdminMonitorOutages,
  fetchAllAdminMonitors,
  fetchAdminSettings,
  pauseMonitor,
  resumeMonitor,
  sendMonitorTestAlert,
  updateMonitor,
} from '../api/client';
import type { AnalyticsRange, Outage, PatchMonitorInput } from '../api/types';
import { AdminShell } from '../components/AdminShell';
import { DailyLatencyChart } from '../components/DailyLatencyChart';
import { LatencyChart } from '../components/LatencyChart';
import { MonitorForm } from '../components/MonitorForm';
import { Select } from '../components/Select';
import { Button, Toast, ToastStack, cn } from '../components/ui';
import { incidentStatusLabel, statusLabel } from '../i18n/labels';
import { formatProseDuration, formatPct4, formatRelativeTime } from '../utils/datetime';
import { heartbeatPingUrl } from '../utils/heartbeat';

const CHART_RANGES: AnalyticsRange[] = ['24h', '7d', '30d', '90d'];

type WindowRow = {
  key: string;
  label: string;
  uptimePct: number | null;
  downtimeSec: number;
  incidents: number;
  longestSec: number | null;
  avgSec: number | null;
};

const ICON_TEST_ALERT =
  'M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5';
const ICON_EVENTS =
  'M12 9v3.75m0 3h.008M20.618 5.984A15.557 15.557 0 0 1 12 2.25a15.557 15.557 0 0 1-8.618 3.734A15.58 15.58 0 0 0 3 9.75c0 6.116 3.52 11.154 9 12.75 5.48-1.596 9-6.634 9-12.75 0-1.293-.132-2.554-.382-3.766Z';
const ICON_PAUSE = 'M15.75 5.25v13.5m-7.5-13.5v13.5';
const ICON_PLAY =
  'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z';
const ICON_CONFIGURE =
  'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z';

function ActionLink({
  icon,
  children,
  onClick,
  to,
  disabled = false,
  danger = false,
  pending = false,
}: {
  icon: string;
  children: React.ReactNode;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  danger?: boolean;
  pending?: boolean;
}) {
  const className = cn(
    'flex items-center gap-2 rounded px-2 py-1 text-[13px] transition-colors',
    disabled
      ? 'cursor-not-allowed text-ink-3'
      : danger
        ? 'text-status-down hover:bg-surface-2'
        : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  );
  const body = (
    <>
      <svg
        className="h-5 w-5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      <span className="leading-none">{pending ? '…' : children}</span>
    </>
  );

  if (to && !disabled) {
    return (
      <Link to={to} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} disabled={disabled} className={className}>
      {body}
    </button>
  );
}

/** `YYYY-MM-DD` for a date-picker value, in the visitor's own calendar. */
function isoDay(epochSec: number): string {
  const d = new Date(epochSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function outageDurationSec(outage: Outage, nowSec: number): number {
  return Math.max(0, (outage.ended_at ?? nowSec) - outage.started_at);
}

function formatIntervalLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function summarize(
  daily: Array<{
    day_start_at: number;
    total_sec: number;
    downtime_sec: number;
    uptime_sec: number;
  }>,
  outages: Outage[],
  days: number | null,
  nowSec: number,
): {
  uptimePct: number | null;
  downtimeSec: number;
  incidents: number;
  longestSec: number | null;
  avgSec: number | null;
} {
  const slice = days === null ? daily : daily.slice(-days);
  const totalSec = slice.reduce((sum, point) => sum + point.total_sec, 0);
  const uptimeSec = slice.reduce((sum, point) => sum + point.uptime_sec, 0);
  const downtimeSec = slice.reduce((sum, point) => sum + point.downtime_sec, 0);
  const windowStart = slice.length > 0 ? (slice[0]?.day_start_at ?? null) : null;

  const inWindow =
    windowStart === null ? [] : outages.filter((outage) => outage.started_at >= windowStart);
  const durations = inWindow.map((outage) => outageDurationSec(outage, nowSec));

  return {
    uptimePct: totalSec > 0 ? (uptimeSec / totalSec) * 100 : null,
    downtimeSec,
    incidents: inWindow.length,
    longestSec: durations.length > 0 ? Math.max(...durations) : null,
    avgSec:
      durations.length > 0
        ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
        : null,
  };
}

export function AdminMonitorDetail() {
  const { id } = useParams();
  const monitorId = Number(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();

  const [chartRange, setChartRange] = useState<AnalyticsRange>('24h');
  /** Empty string means every region; the reference filters the chart by region. */
  const [chartRegion, setChartRegion] = useState('');
  const [editing, setEditing] = useState(false);
  const [pingUrlCopied, setPingUrlCopied] = useState(false);
  /** Reference range pickers open on the current window: last 30 days up to today. */
  const [customFrom, setCustomFrom] = useState(() =>
    isoDay(Math.floor(Date.now() / 1000) - 30 * 86_400),
  );
  const [customTo, setCustomTo] = useState(() => isoDay(Math.floor(Date.now() / 1000)));
  const [customWindow, setCustomWindow] = useState<{
    from: number;
    to: number;
    uptimePct: number | null;
    downtimeSec: number;
    incidents: number;
    longestSec: number | null;
    avgSec: number | null;
  } | null>(null);
  const [notice, setNotice] = useState<{
    tone: 'success' | 'danger' | 'info';
    title: string;
  } | null>(null);

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings });
  const monitorQuery = useQuery({
    queryKey: ['admin-monitors', 'detail', monitorId],
    queryFn: () => fetchAdminMonitor(monitorId),
    enabled: Number.isFinite(monitorId),
  });
  const groupsQuery = useQuery({
    queryKey: ['admin-monitors', 'form-groups'],
    queryFn: () => fetchAllAdminMonitors(),
    enabled: editing,
  });

  const notFound = monitorQuery.error instanceof ApiError && monitorQuery.error.status === 404;
  const monitor = notFound ? null : (monitorQuery.data?.monitor ?? null);

  const settings = settingsQuery.data?.settings;
  useApplyServerLocaleSetting(settings?.site_locale);
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';

  useEffect(() => {
    if (monitor) document.title = `${monitor.name} · ${siteTitle}`;
    else if (notFound) document.title = `${siteTitle} · ${t('monitor_detail.not_found')}`;
  }, [monitor, notFound, siteTitle, t]);

  const analyticsQuery = useQuery({
    queryKey: ['admin-monitor-analytics', monitorId, chartRange, chartRegion],
    queryFn: () => fetchAdminMonitorAnalytics(monitorId, chartRange, chartRegion || undefined),
    enabled: !!monitor,
  });

  const windowsQuery = useQuery({
    queryKey: ['admin-monitor-analytics', monitorId, '90d', 'windows'],
    queryFn: () => fetchAdminMonitorAnalytics(monitorId, '90d'),
    enabled: !!monitor,
  });

  const outagesQuery = useQuery({
    queryKey: ['admin-monitor-outages', monitorId, '90d', 'detail'],
    queryFn: () => fetchAdminMonitorOutages(monitorId, { range: '90d', limit: 100 }),
    enabled: !!monitor,
  });

  const incidentsQuery = useQuery({
    queryKey: ['admin-incidents', 'monitor', monitorId],
    queryFn: () => fetchAdminIncidents(20, monitorId),
    enabled: !!monitor,
  });

  const incidentsForMonitor = incidentsQuery.data?.incidents ?? [];
  const nowSec = Date.now() / 1000;
  const outages = useMemo(() => outagesQuery.data?.outages ?? [], [outagesQuery.data?.outages]);
  const daily = useMemo(() => windowsQuery.data?.daily ?? [], [windowsQuery.data?.daily]);

  const windows = useMemo<WindowRow[]>(() => {
    const build = (key: string, label: string, days: number | null): WindowRow => ({
      key,
      label,
      ...summarize(daily, outages, days, nowSec),
    });
    const allTimeLabel =
      monitor === null
        ? t('monitor_detail.window_all_time')
        : t('monitor_detail.window_all_time_days', {
            n: Math.max(1, Math.ceil((nowSec - monitor.created_at) / 86_400)),
          });
    return [
      build('today', t('monitor_detail.window_today'), 1),
      build('7d', t('monitor_detail.window_7d'), 7),
      build('30d', t('monitor_detail.window_30d'), 30),
      build('90d', t('monitor_detail.window_90d'), null),
      build('all', allTimeLabel, null),
    ];
  }, [daily, outages, nowSec, t, monitor]);

  const totalIncidents = windows[windows.length - 1]?.incidents ?? 0;

  const statusChangeAt = monitor?.last_status_change_at ?? null;
  const stateForSec = statusChangeAt === null ? null : Math.max(0, nowSec - statusChangeAt);

  const testMut = useMutation({
    mutationFn: () => sendMonitorTestAlert(monitorId),
    onSuccess: (result) => {
      const succeeded = result.results.filter((item) => item.status === 'success').length;
      const failed = result.results.length - succeeded;

      if (result.channels === 0) {
        setNotice({ tone: 'info', title: t('monitor_detail.test_alert_no_channels') });
      } else if (failed === 0) {
        setNotice({
          tone: 'success',
          title: t('monitor_detail.test_alert_sent', { count: succeeded }),
        });
      } else if (succeeded === 0) {
        setNotice({
          tone: 'danger',
          title: t('monitor_detail.test_alert_all_failed', { count: failed }),
        });
      } else {
        setNotice({
          tone: 'info',
          title: t('monitor_detail.test_alert_partial', { sent: succeeded, failed }),
        });
      }
      void queryClient.invalidateQueries({ queryKey: ['admin-notification-deliveries'] });
    },
    onError: () => setNotice({ tone: 'danger', title: t('monitor_detail.test_alert_failed') }),
  });

  const pauseMut = useMutation({
    mutationFn: () =>
      monitor?.status === 'paused' ? resumeMonitor(monitorId) : pauseMonitor(monitorId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
    },
    onError: (error) => setNotice({ tone: 'danger', title: error.message }),
  });

  const updateMut = useMutation({
    mutationFn: (data: PatchMonitorInput) => updateMonitor(monitorId, data),
    onSuccess: async (_result, data) => {
      if (data.name !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      setEditing(false);
      setNotice({ tone: 'success', title: t('admin_dashboard.settings_saved') });
    },
    onError: (error) => setNotice({ tone: 'danger', title: error.message }),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteMonitor(monitorId),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      navigate(ADMIN_PATH);
    },
    onError: (error) => setNotice({ tone: 'danger', title: error.message }),
  });

  if (monitorQuery.isLoading || settingsQuery.isLoading) {
    return (
      <AdminShell active="dashboard" layout="sidebar">
        <main className="mx-auto w-full max-w-[1160px] px-5 pb-10 pt-7">
          <div className="ui-skeleton h-7 w-64" />
          <div className="ui-skeleton mt-3 h-4 w-48" />
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {[0, 1, 2].map((cell) => (
              <div key={cell} className="ui-skeleton h-[127px] rounded-lg" />
            ))}
          </div>
        </main>
      </AdminShell>
    );
  }

  if ((monitorQuery.isError && !notFound) || settingsQuery.isError) {
    return (
      <AdminShell active="dashboard" layout="sidebar">
        <main className="mx-auto max-w-[1160px] px-5 py-8">
          <div
            role="alert"
            className="flex flex-wrap items-center gap-3 text-[13px] text-status-down"
          >
            <span>{t('common.loading_failed')}</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={monitorQuery.isFetching || settingsQuery.isFetching}
              onClick={() => {
                if (monitorQuery.isError) void monitorQuery.refetch();
                if (settingsQuery.isError) void settingsQuery.refetch();
              }}
            >
              {t('common.retry')}
            </Button>
          </div>
        </main>
      </AdminShell>
    );
  }

  if (!monitor) {
    return (
      <AdminShell active="dashboard" layout="sidebar">
        <main className="mx-auto max-w-[46rem] px-5 py-10">
          <h1 className="text-[20px] font-semibold">{t('monitor_detail.not_found')}</h1>
          <Link
            to={ADMIN_PATH}
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
          >
            ← {t('admin_dashboard.tab_all_monitors')}
          </Link>
        </main>
      </AdminShell>
    );
  }

  const groupOptions = [
    ...new Set([
      monitor.group_name ?? '',
      ...(groupsQuery.data?.monitors ?? []).map((item) => item.group_name ?? ''),
    ]),
  ].filter(Boolean);

  const statusWord = statusLabel(monitor.status, t);
  const analytics = analyticsQuery.data;
  const chartRegions = analytics?.regions ?? [];
  const rowLoading = windowsQuery.isLoading || outagesQuery.isLoading;
  const rowError = windowsQuery.isError || outagesQuery.isError;

  const calculateCustom = () => {
    if (!customFrom || !customTo) return;
    const from = Math.floor(new Date(`${customFrom}T00:00:00`).getTime() / 1000);
    const to = Math.floor(new Date(`${customTo}T23:59:59`).getTime() / 1000);
    if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return;

    const slice = daily.filter(
      (point) => point.day_start_at >= from - 86_400 && point.day_start_at <= to,
    );
    const totalSec = slice.reduce((sum, point) => sum + point.total_sec, 0);
    const uptimeSec = slice.reduce((sum, point) => sum + point.uptime_sec, 0);
    const downtimeSec = slice.reduce((sum, point) => sum + point.downtime_sec, 0);
    const inWindow = outages.filter(
      (outage) => outage.started_at >= from && outage.started_at <= to,
    );
    const durations = inWindow.map((outage) => outageDurationSec(outage, nowSec));

    setCustomWindow({
      from,
      to,
      uptimePct: totalSec > 0 ? (uptimeSec / totalSec) * 100 : null,
      downtimeSec,
      incidents: inWindow.length,
      longestSec: durations.length > 0 ? Math.max(...durations) : null,
      avgSec:
        durations.length > 0
          ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length)
          : null,
    });
  };

  const renderDuration = (seconds: number | null) =>
    seconds === null || seconds === 0
      ? t('monitor_detail.none')
      : formatProseDuration(seconds, locale, true);

  return (
    <AdminShell active="dashboard" layout="sidebar">
      {/* Reference detail page: the h1 sits 80px below the 52px top bar. */}
      <main className="mx-auto w-full max-w-[1160px] px-5 pb-12 pt-20">
        <div className="min-w-0">
          <h1 className="ui-page-title break-words">{monitor.name}</h1>
          <div className="mt-[17px] flex flex-wrap items-center gap-x-1.5 text-[14px] leading-5">
            <span className={cn('font-medium', `ui-monitor-state-${monitor.status}`)}>
              {statusWord}
            </span>
            <span className="text-ink-3">·</span>
            <span className="text-ink-2">
              {t(
                monitor.type === 'heartbeat'
                  ? 'monitor_detail.expected_every'
                  : 'monitor_detail.checked_every',
                { interval: formatIntervalLabel(monitor.interval_sec) },
              )}
            </span>
            {monitor.type === 'heartbeat' && monitor.heartbeat_grace_sec !== null ? (
              <>
                <span className="text-ink-3">·</span>
                <span className="text-ink-2">
                  {t('monitor_detail.grace_period', {
                    value: formatIntervalLabel(monitor.heartbeat_grace_sec),
                  })}
                </span>
              </>
            ) : null}
          </div>
        </div>

        {/* Reference strip: icon + text links with a wide gap on desktop, wrapping on mobile. */}
        <div className="mt-8 mb-5 -mx-2 flex flex-wrap items-center gap-2 md:gap-12">
          {monitor.type === 'heartbeat' ? null : (
            <ActionLink
              icon={ICON_TEST_ALERT}
              onClick={() => testMut.mutate()}
              disabled={testMut.isPending || monitor.status === 'paused'}
              pending={testMut.isPending}
            >
              {t('monitor_detail.send_test_alert')}
            </ActionLink>
          )}
          <ActionLink icon={ICON_EVENTS} to={`${ADMIN_EVENTS_PATH}?monitor=${monitor.id}`}>
            {t('monitor_detail.events')}
          </ActionLink>
          <ActionLink
            icon={monitor.status === 'paused' ? ICON_PLAY : ICON_PAUSE}
            onClick={() => pauseMut.mutate()}
            disabled={pauseMut.isPending}
          >
            {monitor.status === 'paused' ? t('common.resume') : t('common.pause')}
          </ActionLink>
          <ActionLink
            icon={ICON_CONFIGURE}
            onClick={() => {
              updateMut.reset();
              setEditing(true);
            }}
          >
            {t('monitor_detail.configure')}
          </ActionLink>
        </div>

        {monitor.type === 'heartbeat' && monitor.heartbeat_token ? (
          <section className="ui-panel mb-5 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[12px] text-ink-3">{t('monitor_detail.ping_url')}</div>
                <code className="mt-1 block truncate font-mono text-[13px] text-ink">
                  {heartbeatPingUrl(monitor.heartbeat_token)}
                </code>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(heartbeatPingUrl(monitor.heartbeat_token));
                    setPingUrlCopied(true);
                    window.setTimeout(() => setPingUrlCopied(false), 1500);
                  } catch {
                    setPingUrlCopied(false);
                    setNotice({ tone: 'danger', title: t('common.copy_failed') });
                  }
                }}
              >
                {pingUrlCopied ? t('common.copied') : t('monitor_detail.copy_ping_url')}
              </Button>
            </div>
          </section>
        ) : null}

        <div className="mb-5 flex flex-col gap-4 md:flex-row md:gap-4">
          <div className="ui-stat-card flex-1">
            <h6 className="text-[14px] leading-5 text-ink-2">
              {t(
                monitor.status === 'up'
                  ? 'monitor_detail.currently_up_for'
                  : monitor.status === 'paused'
                    ? 'monitor_detail.currently_paused_for'
                    : 'monitor_detail.currently_down_for',
              )}
            </h6>
            <div className="mt-2 text-[20px] font-semibold leading-7 tabular-nums text-ink">
              {stateForSec === null ? '-' : formatProseDuration(stateForSec, locale)}
            </div>
          </div>
          <div className="ui-stat-card flex-1">
            <h6 className="text-[14px] leading-5 text-ink-2">
              {t('monitor_detail.last_checked_at')}
            </h6>
            <div className="mt-2 text-[20px] font-semibold leading-7 tabular-nums text-ink">
              {monitor.last_checked_at === null
                ? t('monitor_detail.never')
                : formatRelativeTime(monitor.last_checked_at, locale)}
            </div>
          </div>
          <div className="ui-stat-card flex-1">
            <h6 className="text-[14px] leading-5 text-ink-2">{t('monitor_detail.events')}</h6>
            <div className="mt-2 text-[20px] font-semibold leading-7 tabular-nums text-ink">
              {outagesQuery.isSuccess ? totalIncidents : '-'}
            </div>
          </div>
        </div>

        <section className="ui-panel mb-5 overflow-hidden">
          <header className="flex h-[42px] items-center gap-3 border-b border-line-soft px-4">
            <h2 className="text-[13px] font-medium text-ink-2">
              {t('monitor_detail.response_times')}
            </h2>
          </header>

          {/* Reference chart toolbar: the region selector sits left, the range control right. */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 pt-3">
            {chartRegions.length > 0 ? (
              <label className="flex items-center gap-2 text-[13px] text-ink-2">
                <span className="sr-only">{t('monitor_detail.chart_region')}</span>
                <Select
                  className="ui-select ui-compact"
                  value={chartRegion}
                  aria-label={t('monitor_detail.chart_region')}
                  onChange={setChartRegion}
                >
                  <option value="">{t('monitor_detail.chart_region_all')}</option>
                  {chartRegions.map((region) => (
                    <option key={region} value={region}>
                      {region}
                    </option>
                  ))}
                </Select>
              </label>
            ) : (
              <span />
            )}
            {/* Reference segmented control: 64 px segments joined by 1 px borders. */}
            <div className="ui-range-segments">
              {CHART_RANGES.map((range) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={chartRange === range}
                  onClick={() => setChartRange(range)}
                  className="ui-range-segment"
                >
                  {range}
                </button>
              ))}
            </div>
          </div>

          <div className="px-4 pb-4">
            {analyticsQuery.isLoading ? (
              <div className="ui-skeleton h-[466px] w-full" />
            ) : analyticsQuery.isError ? (
              <div
                role="alert"
                className="flex h-[466px] flex-wrap items-center justify-center gap-3 text-[13px] text-status-down"
              >
                {t('common.loading_failed')}
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={analyticsQuery.isFetching}
                  onClick={() => void analyticsQuery.refetch()}
                >
                  {t('common.retry')}
                </Button>
              </div>
            ) : !analytics ? null : chartRange === '24h' ? (
              <LatencyChart points={analytics.points} height={466} />
            ) : (
              <DailyLatencyChart points={analytics.daily} height={466} />
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border border-line bg-surface">
          {rowError ? (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 px-4 py-6 text-[13px] text-status-down"
            >
              {t('common.loading_failed')}
              <Button
                size="sm"
                variant="secondary"
                disabled={windowsQuery.isFetching || outagesQuery.isFetching}
                onClick={() => {
                  if (windowsQuery.isError) void windowsQuery.refetch();
                  if (outagesQuery.isError) void outagesQuery.refetch();
                }}
              >
                {t('common.retry')}
              </Button>
            </div>
          ) : rowLoading ? (
            <div className="divide-y divide-line-soft" role="status" aria-busy>
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <div key={row} className="flex items-center gap-4 px-4 py-3">
                  <div className="ui-skeleton h-4 w-36" />
                  <div className="ui-skeleton ml-auto h-4 w-20" />
                  <div className="ui-skeleton h-4 w-24" />
                  <div className="ui-skeleton h-4 w-12" />
                  <div className="ui-skeleton h-4 w-20" />
                  <div className="ui-skeleton h-4 w-20" />
                </div>
              ))}
            </div>
          ) : (
            <table className="ui-uptime-table w-full">
              <thead>
                <tr>
                  <th>{t('monitor_detail.col_period')}</th>
                  <th>{t('monitor_detail.col_availability')}</th>
                  <th>{t('monitor_detail.col_downtime')}</th>
                  <th>{t('monitor_detail.col_events')}</th>
                  <th>{t('monitor_detail.col_longest_event')}</th>
                  <th>{t('monitor_detail.col_avg_event')}</th>
                </tr>
              </thead>
              <tbody>
                {windows.map((row) => (
                  <tr key={row.key}>
                    <td className="text-ink">{row.label}</td>
                    <td className="ui-uptime-availability tabular-nums text-ink">
                      {row.uptimePct === null
                        ? t('monitor_detail.none')
                        : formatPct4(row.uptimePct)}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-ink-2">
                      {renderDuration(row.downtimeSec)}
                    </td>
                    <td className="tabular-nums text-ink-2">{row.incidents}</td>
                    <td className="whitespace-nowrap tabular-nums text-ink-2">
                      {renderDuration(row.longestSec)}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-ink-2">
                      {renderDuration(row.avgSec)}
                    </td>
                  </tr>
                ))}
                {customWindow ? (
                  <tr>
                    <td className="whitespace-nowrap text-ink">
                      {formatRelativeTime(customWindow.from, locale)} –{' '}
                      {formatRelativeTime(customWindow.to, locale)}
                    </td>
                    <td className="ui-uptime-availability tabular-nums text-ink">
                      {customWindow.uptimePct === null
                        ? t('monitor_detail.none')
                        : formatPct4(customWindow.uptimePct)}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-ink-2">
                      {renderDuration(customWindow.downtimeSec)}
                    </td>
                    <td className="tabular-nums text-ink-2">{customWindow.incidents}</td>
                    <td className="whitespace-nowrap tabular-nums text-ink-2">
                      {renderDuration(customWindow.longestSec)}
                    </td>
                    <td className="whitespace-nowrap tabular-nums text-ink-2">
                      {renderDuration(customWindow.avgSec)}
                    </td>
                  </tr>
                ) : null}
                <tr className="ui-uptime-calculator">
                  <td colSpan={6}>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="flex items-center gap-2 text-[13px] text-ink-2">
                        {t('monitor_detail.calc_from')}
                        <span className="ui-date-field">
                          <svg
                            className="ui-date-field-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"
                            />
                          </svg>
                          <input
                            type="date"
                            value={customFrom}
                            onChange={(event) => setCustomFrom(event.target.value)}
                            aria-label={t('monitor_detail.calc_from')}
                            className="ui-date-field-input"
                          />
                        </span>
                      </label>
                      <label className="flex items-center gap-2 text-[13px] text-ink-2">
                        {t('monitor_detail.calc_to')}
                        <span className="ui-date-field">
                          <svg
                            className="ui-date-field-icon"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.7}
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"
                            />
                          </svg>
                          <input
                            type="date"
                            value={customTo}
                            onChange={(event) => setCustomTo(event.target.value)}
                            aria-label={t('monitor_detail.calc_to')}
                            className="ui-date-field-input"
                          />
                        </span>
                      </label>
                      <Button
                        className="ml-1 h-9 rounded-lg border border-line px-3"
                        variant="secondary"
                        disabled={!customFrom || !customTo || windowsQuery.isLoading}
                        onClick={calculateCustom}
                      >
                        {t('monitor_detail.calc')}
                      </Button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          )}
        </section>

        {incidentsForMonitor.length > 0 ? (
          <section className="mt-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <h2 className="text-[13px] font-medium text-ink">{t('monitor_detail.incidents')}</h2>
              <Link
                to={`${ADMIN_PATH}?tab=incidents`}
                className="text-[12px] text-ink-3 transition-colors hover:text-ink"
              >
                {t('monitor_detail.manage_incidents')}
              </Link>
            </div>
            <ul className="divide-y divide-line-soft rounded-lg border border-line bg-surface">
              {incidentsForMonitor.map((incident) => (
                <li
                  key={incident.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                >
                  <span
                    className={cn(
                      'h-1.5 w-1.5 shrink-0 rounded-full',
                      incident.resolved_at === null ? 'bg-status-down' : 'bg-status-up',
                    )}
                    aria-hidden
                  />
                  <Link
                    to={adminIncidentDetailPath(incident.id)}
                    className="min-w-0 flex-1 truncate text-[13px] text-ink hover:underline"
                  >
                    {incident.title}
                  </Link>
                  <span className="text-[12px] text-ink-2">
                    {incidentStatusLabel(incident.status, t)}
                  </span>
                  <span className="w-[9.5rem] text-right text-[12px] text-ink-3">
                    {formatRelativeTime(incident.started_at, locale)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <ToastStack>
        {notice ? (
          <Toast
            tone={notice.tone}
            title={notice.title}
            onClose={() => setNotice(null)}
            closeLabel={t('common.close')}
          />
        ) : null}
      </ToastStack>

      {editing ? (
        <div className="ui-monitor-form-page">
          <div className="mx-auto w-full max-w-[52rem]">
            <MonitorForm
              variant="page"
              monitor={monitor}
              onSubmit={(data) => updateMut.mutate(data)}
              onCancel={() => setEditing(false)}
              isLoading={updateMut.isPending}
              error={updateMut.error?.message}
              groupOptions={groupOptions}
              onTestAlert={() => testMut.mutate()}
              onTogglePause={() => pauseMut.mutate()}
              onDelete={() => {
                if (window.confirm(`${t('common.delete')} "${monitor.name}"?`)) {
                  deleteMut.mutate();
                }
              }}
              actionPending={testMut.isPending || pauseMut.isPending || deleteMut.isPending}
            />
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

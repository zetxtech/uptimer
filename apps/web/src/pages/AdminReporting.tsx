import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { useI18n } from '../app/I18nContext';
import {
  fetchAdminAnalyticsOverview,
  fetchAdminIncidents,
  fetchAllAdminMonitors,
  fetchAdminSettings,
  fetchPublicUptimeOverview,
} from '../api/client';
import type { AnalyticsOverviewRange } from '../api/types';
import { AdminShell } from '../components/AdminShell';
import { Badge, Button, cn } from '../components/ui';
import type { MessageKey } from '../i18n/messages';
import { incidentStatusLabel } from '../i18n/labels';
import { formatDateTime, formatRelativeTime } from '../utils/datetime';
import { formatPct } from '../utils/uptime';

type ReportKey =
  | 'incidents_overview'
  | 'incidents_started'
  | 'incidents_mttr'
  | 'incidents_resolved'
  | 'monitors_average_sla'
  | 'monitors_compound_sla'
  | 'monitors_volume';

type ReportGroup = {
  key: string;
  labelKey: MessageKey;
  reports: { key: ReportKey; labelKey: MessageKey }[];
};

const REPORT_GROUPS: ReportGroup[] = [
  {
    key: 'incidents',
    labelKey: 'admin_dashboard.tab.incidents',
    reports: [
      { key: 'incidents_overview', labelKey: 'reporting.incidents_overview' },
      { key: 'incidents_started', labelKey: 'reporting.incidents_started' },
      { key: 'incidents_mttr', labelKey: 'reporting.incidents_mttr' },
      { key: 'incidents_resolved', labelKey: 'reporting.incidents_resolved' },
    ],
  },
  {
    key: 'monitors',
    labelKey: 'admin_dashboard.tab.monitors',
    reports: [
      { key: 'monitors_average_sla', labelKey: 'reporting.monitors_average_sla' },
      { key: 'monitors_compound_sla', labelKey: 'reporting.monitors_compound_sla' },
      { key: 'monitors_volume', labelKey: 'reporting.monitors_volume' },
    ],
  },
];

const OVERVIEW_RANGES: AnalyticsOverviewRange[] = ['24h', '7d'];

function formatDurationSec(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  const total = Math.max(0, Math.round(value));
  if (total < 60) return `${total}s`;

  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
  return parts.join(' ');
}

/**
 * Reference KPI block: the value sits above its label, and the metrics flow in two columns with
 * the muted 12 px label underneath.
 */
function StatRow({ label, value, tone }: { label: string; value: string; tone?: 'danger' }) {
  return (
    <div className="border-b border-line-soft px-4 py-3.5 last:border-b-0">
      <div
        className={cn(
          'text-[16px] font-semibold tabular-nums leading-6',
          tone === 'danger' ? 'text-status-down' : 'text-ink',
        )}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] leading-4 text-ink-3">{label}</div>
    </div>
  );
}

export function AdminReporting() {
  const { locale, t } = useI18n();
  const [report, setReport] = useState<ReportKey>('incidents_overview');
  const [overviewRange, setOverviewRange] = useState<AnalyticsOverviewRange>('24h');
  const [slaRange, setSlaRange] = useState<'30d' | '90d'>('30d');

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings });
  const monitorsQuery = useQuery({
    queryKey: ['admin-monitors', 'for-reporting'],
    queryFn: () => fetchAllAdminMonitors(),
  });
  const incidentsQuery = useQuery({
    queryKey: ['admin-incidents', 'for-reporting'],
    queryFn: () => fetchAdminIncidents(200),
  });
  const overviewQuery = useQuery({
    queryKey: ['admin-analytics-overview', overviewRange],
    queryFn: () => fetchAdminAnalyticsOverview(overviewRange),
  });
  const slaQuery = useQuery({
    queryKey: ['public-uptime-overview', slaRange],
    queryFn: () => fetchPublicUptimeOverview(slaRange),
  });

  const settings = settingsQuery.data?.settings;
  useApplyServerLocaleSetting(settings?.site_locale);
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';
  const timeZone = settings?.site_timezone || 'UTC';

  const activeLabel = useMemo(() => {
    for (const group of REPORT_GROUPS) {
      const found = group.reports.find((item) => item.key === report);
      if (found) return t(found.labelKey);
    }
    return '';
  }, [report, t]);

  useEffect(() => {
    document.title = `${siteTitle} · ${t('reporting.title')}`;
  }, [siteTitle, t]);

  const incidents = useMemo(
    () => incidentsQuery.data?.incidents ?? [],
    [incidentsQuery.data?.incidents],
  );
  const unresolved = incidents.filter((incident) => incident.resolved_at === null);
  const resolved = incidents.filter((incident) => incident.resolved_at !== null);

  const incidentDurations = resolved
    .map((incident) => (incident.resolved_at ?? 0) - incident.started_at)
    .filter((value) => value > 0);
  const mttrSec =
    incidentDurations.length > 0
      ? incidentDurations.reduce((sum, value) => sum + value, 0) / incidentDurations.length
      : null;

  const incidentsByDay = useMemo(() => {
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    const dateKey = (date: Date) => {
      const parts = formatter.formatToParts(date);
      const value = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((part) => part.type === type)?.value;
      return `${value('year')}-${value('month')}-${value('day')}`;
    };
    const buckets = new Map<string, number>();
    const today = new Date(`${dateKey(new Date())}T00:00:00Z`).getTime();
    // Step through calendar dates so daylight-saving transitions do not shift the buckets.
    for (let offset = 13; offset >= 0; offset -= 1) {
      const day = new Date(today - offset * 86_400_000).toISOString().slice(0, 10);
      buckets.set(day, 0);
    }
    for (const incident of incidents) {
      const day = dateKey(new Date(incident.started_at * 1000));
      if (buckets.has(day)) buckets.set(day, (buckets.get(day) ?? 0) + 1);
    }
    return [...buckets.entries()].map(([day, count]) => ({ day, count }));
  }, [incidents, timeZone]);

  const maxDailyIncidents = Math.max(1, ...incidentsByDay.map((entry) => entry.count));

  const slaMonitors = slaQuery.data?.monitors ?? [];
  const compound = slaQuery.data?.overall;

  const monitorVolume = useMemo(() => {
    const counts = new Map<string, number>();
    for (const incident of incidents) {
      for (const monitorId of incident.monitor_ids) {
        const key = String(monitorId);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    const nameById = new Map(
      (monitorsQuery.data?.monitors ?? []).map((m) => [String(m.id), m.name] as const),
    );
    return [...counts.entries()]
      .map(([id, count]) => ({ id, name: nameById.get(id) ?? `#${id}`, count }))
      .sort((a, b) => b.count - a.count);
  }, [incidents, monitorsQuery.data?.monitors]);

  const reportQueries = [
    settingsQuery,
    ...(report.startsWith('incidents_') || report === 'monitors_volume' ? [incidentsQuery] : []),
    ...(report === 'incidents_overview' ? [overviewQuery] : []),
    ...(report === 'monitors_volume' ? [monitorsQuery] : []),
    ...(report === 'monitors_average_sla' || report === 'monitors_compound_sla' ? [slaQuery] : []),
  ];
  const reportFailed = reportQueries.some((query) => query.isError);
  const reportLoading = reportQueries.some((query) => query.isLoading);
  const reportReady = !reportFailed && !reportLoading;

  const rangeChips =
    report === 'incidents_overview' ? (
      <>
        <div className="ui-range-segments">
          {OVERVIEW_RANGES.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setOverviewRange(value)}
              aria-pressed={overviewRange === value}
              className="ui-range-segment"
            >
              {value}
            </button>
          ))}
        </div>
      </>
    ) : report === 'monitors_average_sla' || report === 'monitors_compound_sla' ? (
      <div className="ui-range-segments">
        {(['30d', '90d'] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setSlaRange(value)}
            aria-pressed={slaRange === value}
            className="ui-range-segment"
          >
            {value}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <AdminShell active="reporting" layout="sidebar">
      <main className="mx-auto w-full max-w-[1040px] px-5 pb-12 pt-2.5">
        <div className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <nav
            aria-label={t('reporting.title')}
            className="flex h-fit gap-6 overflow-x-auto pb-2 lg:block lg:overflow-visible lg:pb-0"
          >
            {REPORT_GROUPS.map((group) => (
              <div key={group.key} className="min-w-max lg:mb-6 lg:min-w-0 lg:last:mb-0">
                <div className="pb-2 text-[13px] font-semibold leading-5 text-ink">
                  {t(group.labelKey)}
                </div>
                <ul className="flex lg:block">
                  {group.reports.map((item) => (
                    <li key={item.key} className="shrink-0">
                      <button
                        type="button"
                        onClick={() => setReport(item.key)}
                        aria-current={report === item.key}
                        className={cn(
                          'min-h-11 w-auto whitespace-nowrap rounded-md px-3 py-3 text-left text-[13px] leading-5 transition-colors lg:w-full lg:whitespace-normal',
                          report === item.key
                            ? 'bg-surface-2 font-medium text-ink'
                            : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
                        )}
                      >
                        {t(item.labelKey)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          <section className="min-w-0">
            <header className="mb-6 flex min-h-8 flex-wrap items-center justify-between gap-3">
              <h1 className="ui-page-title truncate">{activeLabel}</h1>
              <div className="flex items-center gap-3">{rangeChips}</div>
            </header>

            <div className="ui-panel overflow-hidden">
              {reportFailed ? (
                <div
                  role="alert"
                  className="flex flex-wrap items-center justify-center gap-3 px-4 py-8 text-[13px] text-status-down"
                >
                  {t('common.loading_failed')}
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={reportQueries.some((query) => query.isFetching)}
                    onClick={() => {
                      for (const query of reportQueries) {
                        if (query.isError) void query.refetch();
                      }
                    }}
                  >
                    {t('common.retry')}
                  </Button>
                </div>
              ) : reportLoading ? (
                <p role="status" className="px-4 py-8 text-center text-[13px] text-ink-3">
                  {t('common.loading')}
                </p>
              ) : null}

              {reportReady && report === 'incidents_overview' && (
                <div>
                  <StatRow
                    label={t('reporting.uptime')}
                    value={
                      overviewQuery.data
                        ? formatPct(overviewQuery.data.totals.uptime_pct)
                        : t('common.loading')
                    }
                  />
                  <StatRow
                    label={t('reporting.incidents_open')}
                    value={String(unresolved.length)}
                    {...(unresolved.length > 0 ? { tone: 'danger' as const } : {})}
                  />
                  <StatRow
                    label={t('reporting.incidents_resolved_count')}
                    value={String(resolved.length)}
                  />
                  <StatRow
                    label={t('reporting.alerts')}
                    value={overviewQuery.data ? String(overviewQuery.data.alerts.count) : '-'}
                  />
                  <StatRow
                    label={t('reporting.longest_incident')}
                    value={
                      overviewQuery.data
                        ? formatDurationSec(overviewQuery.data.outages.longest_sec)
                        : '-'
                    }
                  />
                  <StatRow
                    label={t('reporting.mttr_site')}
                    value={
                      overviewQuery.data
                        ? formatDurationSec(overviewQuery.data.outages.mttr_sec)
                        : '-'
                    }
                  />
                </div>
              )}

              {reportReady && report === 'incidents_started' && (
                <div className="px-4 py-4">
                  <div className="flex h-[180px] items-end gap-1.5">
                    {incidentsByDay.map((entry) => (
                      <div
                        key={entry.day}
                        className="group flex flex-1 flex-col items-center gap-1"
                      >
                        <div
                          className={cn(
                            'w-full rounded-sm transition-colors',
                            entry.count > 0 ? 'bg-accent' : 'bg-surface-2',
                          )}
                          style={{
                            height: `${Math.max(3, (entry.count / maxDailyIncidents) * 140)}px`,
                          }}
                          title={`${entry.day}: ${entry.count}`}
                        />
                        <span className="text-[10px] text-ink-3">
                          {Number(entry.day.slice(-2))}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[12px] text-ink-3">{t('reporting.last_14_days')}</p>
                </div>
              )}

              {reportReady && report === 'incidents_mttr' && (
                <div>
                  <StatRow
                    label={t('reporting.mttr_manual')}
                    value={mttrSec === null ? '-' : formatDurationSec(mttrSec)}
                  />
                  <StatRow label={t('reporting.resolved_count')} value={String(resolved.length)} />
                  <StatRow label={t('reporting.open_count')} value={String(unresolved.length)} />
                  <div className="divide-y divide-line-soft">
                    {incidents.slice(0, 10).map((incident) => (
                      <div key={incident.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          {incident.title}
                        </span>
                        <span className="text-[12px] text-ink-3">
                          {incident.resolved_at === null
                            ? t('admin_dashboard.incident_ongoing')
                            : formatDurationSec(incident.resolved_at - incident.started_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {reportReady && report === 'incidents_resolved' && (
                <div className="divide-y divide-line-soft">
                  {resolved.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] text-ink-3">
                      {t('reporting.no_resolved')}
                    </p>
                  ) : (
                    resolved.map((incident) => (
                      <div
                        key={incident.id}
                        className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5"
                      >
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          {incident.title}
                        </span>
                        <Badge variant="up">{incidentStatusLabel(incident.status, t)}</Badge>
                        <span className="text-[12px] text-ink-3">
                          {formatDurationSec((incident.resolved_at ?? 0) - incident.started_at)}
                        </span>
                        <span className="w-[9.5rem] text-right text-[12px] text-ink-3">
                          {incident.resolved_at
                            ? formatRelativeTime(incident.resolved_at, locale)
                            : '-'}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {reportReady && report === 'monitors_average_sla' && (
                <div className="divide-y divide-line-soft">
                  {slaQuery.isLoading ? (
                    <p className="px-4 py-8 text-center text-[13px] text-ink-3">
                      {t('common.loading')}
                    </p>
                  ) : slaMonitors.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] text-ink-3">
                      {t('reporting.no_data')}
                    </p>
                  ) : (
                    slaMonitors.map((monitor) => (
                      <div key={monitor.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          {monitor.name}
                        </span>
                        <span className="text-[12px] text-ink-3">
                          {formatDurationSec(monitor.downtime_sec)} {t('reporting.downtime')}
                        </span>
                        <span className="w-[5.5rem] text-right text-[13px] tabular-nums text-ink">
                          {formatPct(monitor.uptime_pct)}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}

              {reportReady && report === 'monitors_compound_sla' && (
                <div>
                  <StatRow
                    label={t('reporting.compound_uptime')}
                    value={compound ? formatPct(compound.uptime_pct) : '-'}
                  />
                  <StatRow
                    label={t('reporting.total_downtime')}
                    value={compound ? formatDurationSec(compound.downtime_sec) : '-'}
                  />
                  <StatRow
                    label={t('reporting.total_unknown')}
                    value={compound ? formatDurationSec(compound.unknown_sec) : '-'}
                  />
                  <StatRow
                    label={t('reporting.monitor_count')}
                    value={String(slaMonitors.length)}
                  />
                </div>
              )}

              {reportReady && report === 'monitors_volume' && (
                <div className="divide-y divide-line-soft">
                  {monitorVolume.length === 0 ? (
                    <p className="px-4 py-8 text-center text-[13px] text-ink-3">
                      {t('reporting.no_incident_volume')}
                    </p>
                  ) : (
                    monitorVolume.map((entry) => (
                      <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
                          {entry.name}
                        </span>
                        <span className="text-[13px] tabular-nums text-ink-2">{entry.count}</span>
                      </div>
                    ))
                  )}
                </div>
              )}

              <footer className="flex items-center justify-between gap-3 border-t border-line-soft px-4 py-2.5 text-[12px] text-ink-3">
                <span>
                  {t('reporting.generated_at', {
                    value: formatDateTime(Math.floor(Date.now() / 1000), timeZone, locale),
                  })}
                </span>
                <span>{t('reporting.footer_note')}</span>
              </footer>
            </div>
          </section>
        </div>
      </main>
    </AdminShell>
  );
}

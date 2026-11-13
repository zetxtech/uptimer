import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { useI18n } from '../app/I18nContext';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { ADMIN_PATH } from '../app/adminPaths';
import {
  exportMonitorCheckResultsCsv,
  exportMonitorOutagesCsv,
  fetchAdminAnalyticsOverview,
  fetchAdminMonitorAnalytics,
  fetchAdminMonitorOutages,
  fetchAllAdminMonitors,
  fetchAdminProbeHistory,
  fetchAdminSettings,
} from '../api/client';
import type { AnalyticsOverviewRange, AnalyticsRange } from '../api/types';
import { DailyLatencyChart } from '../components/DailyLatencyChart';
import { DailyUptimeChart } from '../components/DailyUptimeChart';
import { LatencyChart } from '../components/LatencyChart';
import { MenuItem, RowMenu } from '../components/MonitorList';
import { ProbeHistoryChart } from '../components/ProbeHistoryChart';
import { AdminShell } from '../components/AdminShell';
import { EmptyState, SectionHeader } from '../components/AdminSection';
import { KpiCell } from '../components/KpiCell';
import { Select } from '../components/Select';
import { Button, Card, Toast, ToastStack, cn } from '../components/ui';
import { formatDateTime } from '../utils/datetime';
import { formatPct } from '../utils/uptime';

const overviewRanges: AnalyticsOverviewRange[] = ['24h', '7d'];
const monitorRanges: AnalyticsRange[] = ['24h', '7d', '30d', '90d'];

function formatSec(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (v < 60) return `${v}s`;

  const m = Math.floor(v / 60);
  const s = v % 60;
  if (m < 60) return `${m}m ${s}s`;

  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h}h ${mm}m`;
}

function RangeTabs<T extends string>({
  values,
  current,
  onChange,
}: {
  values: readonly T[];
  current: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-surface p-1 dark:border-line dark:bg-surface/70">
      {values.map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={current === value}
          onClick={() => onChange(value)}
          className={cn(
            'rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors sm:px-3',
            current === value
              ? 'bg-surface text-ink dark:bg-surface-2 dark:text-ink'
              : 'text-ink-2 hover:text-ink dark:text-ink-3 dark:hover:text-ink',
          )}
        >
          {value}
        </button>
      ))}
    </div>
  );
}

export function AdminAnalytics() {
  const { locale, t } = useI18n();

  const [overviewRange, setOverviewRange] = useState<AnalyticsOverviewRange>('24h');
  const [monitorRange, setMonitorRange] = useState<AnalyticsRange>('24h');
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger'; title: string } | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
  });

  const overviewQuery = useQuery({
    queryKey: ['admin-analytics-overview', overviewRange],
    queryFn: () => fetchAdminAnalyticsOverview(overviewRange),
  });

  const monitorsQuery = useQuery({
    queryKey: ['admin-monitors', 'for-analytics'],
    queryFn: () => fetchAllAdminMonitors(),
  });

  const monitors = useMemo(
    () => monitorsQuery.data?.monitors ?? [],
    [monitorsQuery.data?.monitors],
  );

  const settings = settingsQuery.data?.settings;
  useApplyServerLocaleSetting(settings?.site_locale);
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';
  const timeZone = settings?.site_timezone || 'UTC';

  useEffect(() => {
    document.title = `${siteTitle} · ${t('admin_analytics.analytics_title')}`;
  }, [siteTitle, t]);

  useEffect(() => {
    if (!settings) return;
    setOverviewRange(settings.admin_default_overview_range);
    setMonitorRange(settings.admin_default_monitor_range);
  }, [settings]);

  useEffect(() => {
    if (!monitorsQuery.isSuccess) return;

    if (monitors.length === 0) {
      setSelectedMonitorId(null);
      return;
    }

    const exists =
      selectedMonitorId !== null && monitors.some((monitor) => monitor.id === selectedMonitorId);

    if (!exists) {
      setSelectedMonitorId(monitors[0]?.id ?? null);
    }
  }, [monitors, monitorsQuery.isSuccess, selectedMonitorId]);

  const selectedMonitor = useMemo(
    () => monitors.find((monitor) => monitor.id === selectedMonitorId) ?? null,
    [monitors, selectedMonitorId],
  );

  const monitorAnalyticsQuery = useQuery({
    queryKey: ['admin-monitor-analytics', selectedMonitorId, monitorRange],
    queryFn: () => fetchAdminMonitorAnalytics(selectedMonitorId as number, monitorRange),
    enabled: selectedMonitorId !== null,
  });

  const probeHistoryQuery = useQuery({
    queryKey: ['admin-probe-history', selectedMonitorId, monitorRange],
    queryFn: () => fetchAdminProbeHistory(selectedMonitorId as number, monitorRange),
    enabled: selectedMonitorId !== null,
  });

  const outagesQuery = useInfiniteQuery({
    queryKey: ['admin-monitor-outages', selectedMonitorId, monitorRange],
    queryFn: ({ pageParam }) => {
      const opts: { range: AnalyticsRange; limit: number; cursor?: number } = {
        range: monitorRange,
        limit: 50,
      };
      if (typeof pageParam === 'number') opts.cursor = pageParam;
      return fetchAdminMonitorOutages(selectedMonitorId as number, opts);
    },
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    enabled: selectedMonitorId !== null,
  });

  const outages = outagesQuery.data?.pages.flatMap((page) => page.outages) ?? [];

  const runExport = async (job: () => Promise<void>) => {
    try {
      await job();
      setNotice({ tone: 'success', title: t('admin_analytics.export_downloaded') });
    } catch (error) {
      setNotice({
        tone: 'danger',
        title: error instanceof Error ? error.message : t('admin_analytics.export_failed'),
      });
    }
  };

  return (
    <AdminShell active="analytics" layout="sidebar">
      <main className="mx-auto w-full max-w-[1040px] space-y-10 px-5 pb-12 pt-2.5">
        <SectionHeader
          size="page"
          title={t('admin_analytics.analytics_title')}
          description={t('admin_analytics.page_desc')}
        />
        <Card className="overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <SectionHeader
              title={t('admin_analytics.overview_title')}
              description={t('admin_analytics.overview_desc')}
              actions={
                <RangeTabs
                  values={overviewRanges}
                  current={overviewRange}
                  onChange={setOverviewRange}
                />
              }
            />
          </div>

          {overviewQuery.isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-4 text-sm text-red-600 dark:border-line dark:text-red-400"
            >
              <span>{t('admin_analytics.failed_overview')}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => overviewQuery.refetch()}
                disabled={overviewQuery.isFetching}
              >
                {overviewQuery.isFetching ? t('common.loading') : t('common.retry')}
              </Button>
            </div>
          )}
          {overviewQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-px border-t border-line bg-surface-2 lg:grid-cols-4 dark:border-line dark:bg-surface-2">
              {Array.from({ length: 4 }).map((_, idx) => (
                <div key={idx} className="ui-skeleton h-[70px] bg-surface" />
              ))}
            </div>
          ) : overviewQuery.data ? (
            <div className="grid grid-cols-2 gap-px border-t border-line-soft bg-surface-2 lg:grid-cols-4 dark:border-line dark:bg-surface-2">
              <KpiCell
                label={t('admin_analytics.uptime')}
                value={formatPct(overviewQuery.data.totals.uptime_pct)}
                icon="M3 12h4l3-8 4 16 3-8h4"
              />
              <KpiCell
                label={t('admin_analytics.alerts')}
                icon="M12 9v4m0 4h.01M10.3 3.9L2.4 17a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"
                value={String(overviewQuery.data.alerts.count)}
                tone={overviewQuery.data.alerts.count > 0 ? 'warning' : undefined}
              />
              <KpiCell
                label={t('admin_analytics.longest_outage')}
                icon="M12 8v4l2.5 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                value={
                  overviewQuery.data.outages.longest_sec === null
                    ? '-'
                    : formatSec(overviewQuery.data.outages.longest_sec)
                }
                tone="danger"
              />
              <KpiCell
                label={t('admin_analytics.mttr')}
                icon="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
                value={
                  overviewQuery.data.outages.mttr_sec === null
                    ? '-'
                    : formatSec(overviewQuery.data.outages.mttr_sec)
                }
              />
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex flex-col gap-3 px-4 pt-4 pb-3 lg:flex-row lg:items-start lg:justify-between">
            <SectionHeader
              title={t('admin_analytics.monitor_title')}
              description={t('admin_analytics.monitor_desc')}
              className="min-w-0 flex-1"
            />
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={selectedMonitorId ?? ''}
                onChange={(next) => setSelectedMonitorId(Number(next))}
                className="ui-select ui-compact w-full min-w-0 sm:w-[16rem]"
                disabled={monitorsQuery.isLoading || monitors.length === 0}
              >
                {monitors.length === 0 ? (
                  <option value="">
                    {monitorsQuery.isPending
                      ? t('common.loading')
                      : !monitorsQuery.data
                        ? (monitorsQuery.error?.message ?? t('common.loading_failed'))
                        : t('admin_analytics.no_monitors_available')}
                  </option>
                ) : (
                  monitors.map((monitor) => (
                    <option key={monitor.id} value={monitor.id}>
                      {monitor.name} (#{monitor.id})
                    </option>
                  ))
                )}
              </Select>
              <RangeTabs values={monitorRanges} current={monitorRange} onChange={setMonitorRange} />
              {selectedMonitorId === null ? null : (
                <RowMenu label={t('admin_analytics.export')}>
                  {(close) => (
                    <>
                      <MenuItem
                        icon="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15"
                        onClick={() => {
                          close();
                          void runExport(() =>
                            exportMonitorCheckResultsCsv(selectedMonitorId, '24h'),
                          );
                        }}
                      >
                        {t('admin_analytics.export_checks_24h')}
                      </MenuItem>
                      <MenuItem
                        icon="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15"
                        onClick={() => {
                          close();
                          void runExport(() =>
                            exportMonitorCheckResultsCsv(selectedMonitorId, '7d'),
                          );
                        }}
                      >
                        {t('admin_analytics.export_checks_7d')}
                      </MenuItem>
                      <MenuItem
                        icon="M12 3v12m0 0 4.5-4.5M12 15l-4.5-4.5M4.5 19.5h15"
                        onClick={() => {
                          close();
                          void runExport(() =>
                            exportMonitorOutagesCsv(selectedMonitorId, monitorRange),
                          );
                        }}
                      >
                        {t('admin_analytics.export_outages', { range: monitorRange })}
                      </MenuItem>
                    </>
                  )}
                </RowMenu>
              )}
            </div>
          </div>

          {monitorsQuery.isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 border-t border-line-soft px-4 py-4 text-sm text-red-600 dark:text-red-400"
            >
              <span>{monitorsQuery.error.message || t('common.loading_failed')}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => monitorsQuery.refetch()}
                disabled={monitorsQuery.isFetching}
              >
                {monitorsQuery.isFetching ? t('common.loading') : t('common.retry')}
              </Button>
            </div>
          )}
          {selectedMonitor && monitorAnalyticsQuery.isError && (
            <div
              role="alert"
              className="flex flex-wrap items-center gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-400/30 dark:bg-red-500/10 dark:text-red-300"
            >
              <span>{t('admin_analytics.failed_monitor')}</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => monitorAnalyticsQuery.refetch()}
                disabled={monitorAnalyticsQuery.isFetching}
              >
                {monitorAnalyticsQuery.isFetching ? t('common.loading') : t('common.retry')}
              </Button>
            </div>
          )}
          {monitorsQuery.isPending ? (
            <p className="p-4 text-sm text-ink-2">{t('common.loading')}</p>
          ) : !monitorsQuery.data ? null : monitors.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon="pulse"
                title={t('admin_analytics.no_monitors_available')}
                description={t('admin_analytics.create_monitor_first')}
                action={
                  <Link to={ADMIN_PATH} className="ui-btn ui-btn-primary">
                    {t('admin_dashboard.create_monitor')}
                  </Link>
                }
              />
            </div>
          ) : !selectedMonitor || monitorAnalyticsQuery.isLoading ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {Array.from({ length: 5 }).map((_, idx) => (
                  <div key={idx} className="ui-skeleton h-24 rounded-xl border border-line" />
                ))}
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="ui-skeleton h-64 rounded-xl border border-line" />
                <div className="ui-skeleton h-64 rounded-xl border border-line" />
              </div>
            </div>
          ) : monitorAnalyticsQuery.data ? (
            <>
              <div className="grid grid-cols-2 gap-px border-t border-line bg-surface-2 sm:grid-cols-3 lg:grid-cols-5 dark:border-line dark:bg-surface-2">
                <KpiCell
                  label={t('admin_analytics.uptime')}
                  value={formatPct(monitorAnalyticsQuery.data.uptime_pct)}
                  icon="M3 12h4l3-8 4 16 3-8h4"
                />
                <KpiCell
                  label={t('admin_analytics.unknown')}
                  icon="M9.9 9a2.1 2.1 0 114.2 0c0 1.4-2.1 2-2.1 3.4M12 17h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  value={formatPct(monitorAnalyticsQuery.data.unknown_pct)}
                />
                <KpiCell
                  label={t('admin_analytics.downtime')}
                  icon="M6 7l12 12M18 7L6 19"
                  value={formatSec(monitorAnalyticsQuery.data.downtime_sec)}
                  tone="danger"
                />
                <KpiCell
                  label={t('admin_analytics.p95')}
                  icon="M3 12h4l3-8 4 16 3-8h4"
                  value={
                    monitorAnalyticsQuery.data.p95_latency_ms === null
                      ? '-'
                      : `${monitorAnalyticsQuery.data.p95_latency_ms}ms`
                  }
                />
                <KpiCell
                  label={t('admin_analytics.p50')}
                  icon="M4 18V9m6 9V5m6 13v-6"
                  value={
                    monitorAnalyticsQuery.data.p50_latency_ms === null
                      ? '-'
                      : `${monitorAnalyticsQuery.data.p50_latency_ms}ms`
                  }
                />
                <div aria-hidden className="hidden bg-surface sm:block lg:hidden dark:bg-surface" />
              </div>

              <div className="grid divide-y divide-line-soft border-t border-line-soft md:grid-cols-2 md:divide-x md:divide-y-0 dark:divide-line-soft dark:border-line">
                <div className="p-4">
                  <div className="mb-2 text-sm font-medium text-ink">
                    {t('admin_analytics.daily_uptime')}
                  </div>
                  {monitorRange === '24h' ? (
                    <div className="flex h-[220px] items-center justify-center text-sm text-ink-2 dark:text-ink-3">
                      {t('admin_analytics.daily_rollup_hint')}
                    </div>
                  ) : (
                    <DailyUptimeChart points={monitorAnalyticsQuery.data.daily} />
                  )}
                </div>

                <div className="p-4">
                  <div className="mb-2 text-sm font-medium text-ink">
                    {t('admin_analytics.latency')}
                  </div>
                  {monitorRange === '24h' ? (
                    <LatencyChart points={monitorAnalyticsQuery.data.points} />
                  ) : (
                    <DailyLatencyChart points={monitorAnalyticsQuery.data.daily} />
                  )}
                </div>
              </div>

              <section className="border-t border-line-soft p-4 dark:border-line">
                <h3 className="ui-metric-label mb-3">{t('probes.history_title')}</h3>
                {probeHistoryQuery.isError && (
                  <div
                    role="alert"
                    className="mb-3 flex flex-wrap items-center gap-3 text-sm text-red-600 dark:text-red-400"
                  >
                    <span>{t('probes.history_error')}</span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => probeHistoryQuery.refetch()}
                      disabled={probeHistoryQuery.isFetching}
                    >
                      {probeHistoryQuery.isFetching ? t('common.loading') : t('common.retry')}
                    </Button>
                  </div>
                )}
                {probeHistoryQuery.isLoading ? (
                  <p className="text-sm text-ink-2">{t('common.loading')}</p>
                ) : probeHistoryQuery.data ? (
                  <ProbeHistoryChart
                    key={`${selectedMonitor.id}:${monitorRange}`}
                    history={probeHistoryQuery.data}
                    timeZone={timeZone}
                  />
                ) : null}
              </section>

              <div className="border-t border-line-soft p-4 dark:border-line">
                <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="ui-metric-label">{t('admin_analytics.outages')}</h3>
                  <div className="text-xs text-ink-2 dark:text-ink-3">
                    {selectedMonitor.name} (#{selectedMonitor.id})
                  </div>
                </div>

                {outagesQuery.isError && (
                  <div
                    role="alert"
                    className="mb-3 flex flex-wrap items-center gap-3 text-sm text-red-600 dark:text-red-400"
                  >
                    <span>
                      {outagesQuery.error.message || t('status_page.failed_load_outages')}
                    </span>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() =>
                        outagesQuery.isFetchNextPageError
                          ? outagesQuery.fetchNextPage()
                          : outagesQuery.refetch()
                      }
                      disabled={outagesQuery.isFetching}
                    >
                      {outagesQuery.isFetching ? t('common.loading') : t('common.retry')}
                    </Button>
                  </div>
                )}
                {outagesQuery.isLoading ? (
                  <div className="text-sm text-ink-2 dark:text-ink-3">
                    {t('admin_analytics.loading_outages')}
                  </div>
                ) : !outagesQuery.data ? null : outages.length === 0 ? (
                  <div className="text-sm text-ink-2 dark:text-ink-3">
                    {t('admin_analytics.no_outages')}
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <table className="ui-table min-w-[540px]">
                        <thead>
                          <tr>
                            <th className="px-3 py-2 text-left">
                              {t('admin_analytics.outage_start')}
                            </th>
                            <th className="px-3 py-2 text-left">
                              {t('admin_analytics.outage_end')}
                            </th>
                            <th className="px-3 py-2 text-left">
                              {t('admin_analytics.initial_error')}
                            </th>
                            <th className="px-3 py-2 text-left">
                              {t('admin_analytics.last_error')}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {outages.map((outage) => (
                            <tr
                              key={outage.id}
                              className="hover:bg-surface-2 dark:hover:bg-surface-2"
                            >
                              <td className="px-3 py-2 whitespace-nowrap text-ink">
                                {formatDateTime(outage.started_at, timeZone, locale)}
                              </td>
                              <td className="px-3 py-2 whitespace-nowrap text-ink">
                                {outage.ended_at
                                  ? formatDateTime(outage.ended_at, timeZone, locale)
                                  : t('admin_analytics.ongoing')}
                              </td>
                              <td className="px-3 py-2 text-ink-2 dark:text-ink-3">
                                {outage.initial_error ?? '-'}
                              </td>
                              <td className="px-3 py-2 text-ink-2 dark:text-ink-3">
                                {outage.last_error ?? '-'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {outagesQuery.hasNextPage && !outagesQuery.isFetchNextPageError && (
                      <div className="mt-4">
                        <Button
                          variant="secondary"
                          onClick={() => outagesQuery.fetchNextPage()}
                          disabled={outagesQuery.isFetchingNextPage}
                        >
                          {outagesQuery.isFetchingNextPage
                            ? t('common.loading_ellipsis')
                            : t('common.load_more')}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          ) : null}
        </Card>
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
    </AdminShell>
  );
}

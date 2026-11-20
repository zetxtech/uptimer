import { useQuery } from '@tanstack/react-query';
import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { useI18n } from '../app/I18nContext';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import {
  fetchLatency,
  fetchHomepage,
  fetchPublicDayContext,
  fetchPublicIncidentDetail,
  fetchPublicMonitorOutages,
} from '../api/client';
import type { Incident, IncidentSummary, Outage, PublicHomepageResponse } from '../api/types';
import { DayDowntimeModal } from '../components/DayDowntimeModal';
import { Markdown } from '../components/Markdown';
import { MonitorCard } from '../components/MonitorCard';
import { PublicDialog } from '../components/PublicDialog';
import { PublicStatusHeader } from '../components/PublicStatusHeader';
import { incidentImpactLabel, incidentStatusLabel, statusLabel } from '../i18n/labels';
import { formatDateTime, getBrowserTimeZone } from '../utils/datetime';
import { Badge, Card } from '../components/ui';

type BannerStatus = PublicHomepageResponse['banner']['status'];
type IncidentCardData = IncidentSummary | Incident;

const LatencyChart = lazy(async () => {
  const mod = await import('../components/LatencyChart');
  return { default: mod.LatencyChart };
});

function getBannerConfig(status: BannerStatus, t: ReturnType<typeof useI18n>['t']) {
  const configs = {
    operational: {
      text: t('status_page.all_systems_operational'),
    },
    partial_outage: {
      text: t('status_page.partial_system_outage'),
    },
    major_outage: {
      text: t('status_page.major_system_outage'),
    },
    maintenance: {
      text: t('status_page.scheduled_maintenance'),
    },
    unknown: {
      text: t('status_page.status_unknown'),
    },
  };
  return configs[status] || configs.unknown;
}

function monitorGroupLabel(groupName: string | null | undefined, ungroupedLabel: string): string {
  const trimmed = groupName?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : ungroupedLabel;
}

function MonitorDetail({ monitorId, onClose }: { monitorId: number; onClose: () => void }) {
  const { t } = useI18n();
  const { data, isLoading } = useQuery({
    queryKey: ['latency', monitorId],
    queryFn: () => fetchLatency(monitorId),
  });

  return (
    <PublicDialog
      label={data?.monitor.name ?? t('monitor_detail.response_times')}
      onClose={onClose}
      panelClassName="sm:max-w-2xl p-5 sm:p-6"
    >
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-semibold text-ink">
          {data?.monitor.name ?? t('common.loading')}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 text-ink-3 hover:text-ink-2 dark:hover:text-ink-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {isLoading ? (
        <div className="h-[200px] flex items-center justify-center text-ink-2 dark:text-ink-3">
          {t('status_page.loading_chart')}
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-6">
            <div className="bg-surface-2 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="text-xs text-ink-2 dark:text-ink-3 uppercase tracking-wide mb-1">
                {t('status_page.avg_latency')}
              </div>
              <div className="text-base sm:text-base font-semibold text-ink">
                {data.avg_latency_ms ?? '-'}ms
              </div>
            </div>
            <div className="bg-surface-2 rounded-lg px-3 sm:px-4 py-2.5 sm:py-3">
              <div className="text-xs text-ink-2 dark:text-ink-3 uppercase tracking-wide mb-1">
                {t('status_page.p95_latency')}
              </div>
              <div className="text-base sm:text-base font-semibold text-ink">
                {data.p95_latency_ms ?? '-'}ms
              </div>
            </div>
          </div>
          <Suspense
            fallback={
              <div className="h-[200px] flex items-center justify-center text-ink-2 dark:text-ink-3">
                {t('status_page.loading_chart')}
              </div>
            }
          >
            <LatencyChart points={data.points} />
          </Suspense>
        </>
      ) : (
        <div className="h-[200px] flex items-center justify-center text-ink-2 dark:text-ink-3">
          {t('status_page.failed_load_data')}
        </div>
      )}
    </PublicDialog>
  );
}

function IncidentCard({
  incident,
  onClick,
  timeZone,
}: {
  incident: IncidentCardData;
  onClick: () => void;
  timeZone: string;
}) {
  const { locale, t } = useI18n();

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full rounded border-l-2 border-line py-1 pl-5 text-left transition-colors hover:border-ink-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-3">
        <time dateTime={new Date(incident.started_at * 1000).toISOString()}>
          {formatDateTime(incident.started_at, timeZone, locale)}
        </time>
        <span className={incident.status === 'resolved' ? 'text-status-up' : 'text-status-paused'}>
          {incidentStatusLabel(incident.status, t)}
        </span>
      </div>
      <h4 className="break-words text-[14px] font-semibold text-ink">{incident.title}</h4>
      {incident.message && (
        <p className="mt-2 line-clamp-3 break-words text-sm leading-relaxed text-ink-2">
          {incident.message}
        </p>
      )}
    </button>
  );
}

function IncidentDetail({
  incident,
  monitorNames,
  onClose,
  timeZone,
  isLoadingDetails,
  hasDetailsError,
}: {
  incident: Incident;
  monitorNames: Map<number, string>;
  onClose: () => void;
  timeZone: string;
  isLoadingDetails: boolean;
  hasDetailsError: boolean;
}) {
  const { locale, t } = useI18n();

  return (
    <PublicDialog label={incident.title} onClose={onClose} panelClassName="sm:max-w-2xl p-5 sm:p-6">
      <div className="flex justify-between items-start mb-4 sm:mb-6">
        <div>
          <h2 className="text-base sm:text-xl font-semibold text-ink mb-2">{incident.title}</h2>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant={
                incident.impact === 'critical' || incident.impact === 'major' ? 'down' : 'paused'
              }
            >
              {incidentImpactLabel(incident.impact, t)}
            </Badge>
            <Badge variant="info">{incidentStatusLabel(incident.status, t)}</Badge>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-2 dark:hover:bg-surface-2 text-ink-3 hover:text-ink-2 dark:hover:text-ink-2 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div className="space-y-2 sm:space-y-3 text-sm text-ink-2 mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-line-soft dark:border-line">
        <div className="flex flex-col sm:flex-row sm:gap-2">
          <span className="text-ink-3 dark:text-ink-2 sm:w-20 text-xs sm:text-sm">
            {t('common.affected')}:
          </span>
          <span className="text-sm">
            {incident.monitor_ids.length > 0
              ? incident.monitor_ids.map((id) => monitorNames.get(id) ?? `#${id}`).join(', ')
              : isLoadingDetails
                ? t('common.loading')
                : hasDetailsError
                  ? t('status_page.failed_load_data')
                  : '-'}
          </span>
        </div>
        <div className="flex flex-col sm:flex-row sm:gap-2">
          <span className="text-ink-3 dark:text-ink-2 sm:w-20 text-xs sm:text-sm">
            {t('common.started')}:
          </span>
          <span className="text-sm">{formatDateTime(incident.started_at, timeZone, locale)}</span>
        </div>
        {incident.resolved_at && (
          <div className="flex flex-col sm:flex-row sm:gap-2">
            <span className="text-ink-3 dark:text-ink-2 sm:w-20 text-xs sm:text-sm">
              {t('common.resolved')}:
            </span>
            <span className="text-sm">
              {formatDateTime(incident.resolved_at, timeZone, locale)}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {incident.message && (
          <div className="bg-surface-2 rounded-lg p-4">
            <div className="text-xs uppercase tracking-wide text-ink-3 dark:text-ink-2 mb-2">
              {t('status_page.initial_report')}
            </div>
            <Markdown text={incident.message} />
          </div>
        )}

        {incident.updates.map((u) => (
          <div key={u.id} className="border-l-2 border-line pl-4">
            <div className="flex items-center gap-3 mb-2">
              {u.status && <Badge variant="info">{incidentStatusLabel(u.status, t)}</Badge>}
              <span className="text-xs text-ink-3 dark:text-ink-2">
                {formatDateTime(u.created_at, timeZone, locale)}
              </span>
            </div>
            <Markdown text={u.message} />
          </div>
        ))}

        {incident.updates.length === 0 && isLoadingDetails && (
          <div className="text-sm text-ink-2 dark:text-ink-3">{t('common.loading')}</div>
        )}

        {incident.updates.length === 0 && hasDetailsError && (
          <div className="text-sm text-red-600 dark:text-red-400">
            {t('status_page.failed_load_data')}
          </div>
        )}
      </div>
    </PublicDialog>
  );
}

function StatusPageSkeleton() {
  return (
    <div className="min-h-screen bg-surface">
      <PublicStatusHeader />
      <main className="ui-public-container py-10 sm:py-14" aria-busy="true">
        <div className="ui-skeleton h-9 w-3/4 rounded sm:w-1/2" />
        <div className="ui-skeleton mt-3 h-4 w-44 rounded" />
        <div className="mt-12 divide-y divide-line-soft">
          {Array.from({ length: 4 }).map((_, idx) => (
            <div key={idx} className="py-6">
              <div className="mb-3 flex justify-between">
                <div className="ui-skeleton h-4 w-32 rounded" />
                <div className="ui-skeleton h-4 w-14 rounded" />
              </div>
              <div className="ui-skeleton h-8 rounded" />
              <div className="mt-2 flex justify-between">
                <div className="ui-skeleton h-3 w-16 rounded" />
                <div className="ui-skeleton h-3 w-10 rounded" />
              </div>
              <div className="ui-skeleton mt-3 h-3 w-12 rounded" />
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

export function StatusPage() {
  const { locale, t } = useI18n();
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | null>(null);
  const [selectedIncidentRequest, setSelectedIncidentRequest] = useState<{
    incident: IncidentCardData;
    resolvedOnly: boolean;
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<{ monitorId: number; dayStartAt: number } | null>(
    null,
  );

  const homepageQuery = useQuery({
    queryKey: ['homepage'],
    queryFn: fetchHomepage,
    staleTime: 30_000,
    refetchInterval: 30_000,
    // Keep a recent injected homepage bootstrap stable through the current monitor window.
    // Immediate mount refetch can temporarily downgrade recent artifact data to UNKNOWN
    // before the next scheduled check has refreshed monitor_state/snapshots.
    refetchOnMount: (query) => {
      const data = query.state.data as PublicHomepageResponse | undefined;
      if (!data || typeof data.generated_at !== 'number') {
        return true;
      }
      return Date.now() - data.generated_at * 1000 > 60_000;
    },
  });

  const derivedTitle = homepageQuery.data?.site_title || 'Uptimer';
  const derivedTimeZone = getBrowserTimeZone() || homepageQuery.data?.site_timezone || 'UTC';

  useApplyServerLocaleSetting(homepageQuery.data?.site_locale);

  useEffect(() => {
    document.title = derivedTitle;
  }, [derivedTitle]);

  const outagesQuery = useQuery({
    queryKey: ['public-monitor-outages', selectedDay?.monitorId, selectedDay?.dayStartAt],
    queryFn: () =>
      fetchPublicMonitorOutages(selectedDay?.monitorId as number, { range: '30d', limit: 200 }),
    enabled: selectedDay !== null,
  });

  const dayContextQuery = useQuery({
    queryKey: ['public-day-context', selectedDay?.monitorId, selectedDay?.dayStartAt],
    queryFn: () =>
      fetchPublicDayContext(selectedDay?.monitorId as number, selectedDay?.dayStartAt as number),
    enabled: selectedDay !== null,
  });

  const currentDayOutages = useMemo((): Outage[] => {
    if (!selectedDay) return [];
    const all = outagesQuery.data?.outages ?? [];
    const dayStart = selectedDay.dayStartAt;
    const dayEnd = dayStart + 86400;
    return all.filter((o) => o.started_at < dayEnd && (o.ended_at ?? dayEnd) > dayStart);
  }, [outagesQuery.data?.outages, selectedDay]);

  const incidentDetailQuery = useQuery({
    queryKey: [
      'public-incident-detail',
      selectedIncidentRequest?.incident.id,
      selectedIncidentRequest?.resolvedOnly,
    ],
    queryFn: () => {
      const resolvedOnly = selectedIncidentRequest?.resolvedOnly;
      return fetchPublicIncidentDetail(
        selectedIncidentRequest?.incident.id as number,
        resolvedOnly === undefined ? {} : { resolvedOnly },
      );
    },
    enabled: selectedIncidentRequest !== null,
  });

  const selectedIncident =
    incidentDetailQuery.data ??
    (selectedIncidentRequest
      ? {
          ...selectedIncidentRequest.incident,
          monitor_ids: [],
          updates: [],
        }
      : null);

  const resolvedIncidentPreview = homepageQuery.data?.resolved_incident_preview ?? null;
  const maintenanceHistoryPreview = homepageQuery.data?.maintenance_history_preview ?? null;

  const groupedMonitors = useMemo(() => {
    const groups = new Map<string, PublicHomepageResponse['monitors']>();
    for (const monitor of homepageQuery.data?.monitors ?? []) {
      const key = monitorGroupLabel(monitor.group_name, t('status_page.group_ungrouped'));
      const list = groups.get(key) ?? [];
      list.push(monitor);
      groups.set(key, list);
    }

    return [...groups.entries()].map(([name, monitors]) => ({ name, monitors }));
  }, [homepageQuery.data?.monitors, t]);
  const monitorNames = useMemo(
    () => new Map((homepageQuery.data?.monitors ?? []).map((m) => [m.id, m.name] as const)),
    [homepageQuery.data?.monitors],
  );

  if (homepageQuery.isLoading && !homepageQuery.data) {
    return <StatusPageSkeleton />;
  }

  if (!homepageQuery.data) {
    return (
      <div className="min-h-screen bg-surface">
        <PublicStatusHeader siteTitle={derivedTitle} />
        <main className="ui-public-container py-12">
          <h1 className="mb-3 text-[20px] font-semibold text-ink">
            {t('status_page.unable_to_load_status')}
          </h1>
          <p className="text-sm text-ink-3">{t('status_page.check_connection')}</p>
        </main>
      </div>
    );
  }

  const data = homepageQuery.data;
  const bannerConfig = getBannerConfig(data.banner.status, t);
  const activeIncidents = data.active_incidents;

  const siteTitle = derivedTitle;
  const timeZone = derivedTimeZone;

  return (
    <div className="min-h-screen bg-surface">
      <PublicStatusHeader siteTitle={siteTitle} />

      <main className="ui-public-container break-words pb-12 sm:pb-16">
        <section className="flex flex-col items-center pb-12 pt-16 text-center sm:pt-20">
          <span className="ui-public-banner-mark" data-status={data.banner.status} aria-hidden>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d={data.banner.status === 'operational' ? 'm7 12 3 3 7-8' : 'M12 7v6m0 4h.01'}
              />
            </svg>
          </span>
          <h1 className="ui-public-title mt-2">{bannerConfig.text}</h1>
          {data.banner.source === 'incident' && data.banner.incident && (
            <p className="mt-3 text-sm text-ink-2">
              {t('status_page.incident_prefix', { value: data.banner.incident.title })}
            </p>
          )}
          {data.banner.source === 'maintenance' && data.banner.maintenance_window && (
            <p className="mt-3 text-sm text-ink-2">
              {t('status_page.maintenance_prefix', { value: data.banner.maintenance_window.title })}
            </p>
          )}
          <p className="mt-3 text-[13px] font-medium text-ink-3">
            {t('common.last_updated', {
              value: formatDateTime(data.generated_at, timeZone, locale),
            })}
          </p>
          {data.site_description && (
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-2">
              {data.site_description}
            </p>
          )}
        </section>

        {/* Maintenance Windows */}
        {(data.maintenance_windows.active.length > 0 ||
          data.maintenance_windows.upcoming.length > 0) && (
          <section className="mb-10 sm:mb-12">
            <h2 className="mb-5 text-[16px] font-semibold text-ink">
              {t('status_page.scheduled_maintenance')}
            </h2>

            {data.maintenance_windows.active.length > 0 && (
              <div className="mb-4">
                <div className="mb-3 text-xs text-ink-3">{t('common.active')}</div>
                <div className="space-y-3">
                  {data.maintenance_windows.active.map((w) => (
                    <article
                      key={w.id}
                      className="min-w-0 border-l-2 border-status-maintenance py-1 pl-5"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-2">
                        <h3 className="min-w-0 break-words text-[14px] font-semibold text-ink">
                          {w.title}
                        </h3>
                        <span className="text-xs text-ink-3">
                          {formatDateTime(w.starts_at, timeZone, locale)} –{' '}
                          {formatDateTime(w.ends_at, timeZone, locale)}
                        </span>
                      </div>
                      <div className="text-sm text-ink-2 mb-2">
                        {t('common.affected')}:{' '}
                        {w.monitor_ids.map((id) => monitorNames.get(id) ?? `#${id}`).join(', ')}
                      </div>
                      {w.message && <Markdown text={w.message} />}
                    </article>
                  ))}
                </div>
              </div>
            )}

            {data.maintenance_windows.upcoming.length > 0 && (
              <div>
                <div className="mb-3 text-xs text-ink-3">{t('common.upcoming')}</div>
                <div className="space-y-3">
                  {data.maintenance_windows.upcoming.map((w) => (
                    <article key={w.id} className="min-w-0 border-l-2 border-line py-1 pl-5">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4 mb-2">
                        <h3 className="min-w-0 break-words text-[14px] font-semibold text-ink">
                          {w.title}
                        </h3>
                        <span className="text-xs text-ink-3">
                          {formatDateTime(w.starts_at, timeZone, locale)} –{' '}
                          {formatDateTime(w.ends_at, timeZone, locale)}
                        </span>
                      </div>
                      <div className="text-sm text-ink-2">
                        {t('common.affected')}:{' '}
                        {w.monitor_ids.map((id) => monitorNames.get(id) ?? `#${id}`).join(', ')}
                      </div>
                      {w.message && (
                        <div className="mt-2">
                          <Markdown text={w.message} />
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Active Incidents */}
        {activeIncidents.length > 0 && (
          <section className="mb-10 sm:mb-12">
            <h2 className="mb-5 text-[16px] font-semibold text-ink">
              {t('status_page.active_incidents')}
            </h2>
            <div className="space-y-6">
              {activeIncidents.map((it) => (
                <IncidentCard
                  key={it.id}
                  incident={it}
                  timeZone={timeZone}
                  onClick={() =>
                    setSelectedIncidentRequest({
                      incident: it,
                      resolvedOnly: false,
                    })
                  }
                />
              ))}
            </div>
          </section>
        )}

        {/* Monitors */}
        <section>
          <h2 className="sr-only">{t('status_page.services')}</h2>
          <div className="rounded-xl border border-line bg-surface px-3 py-2">
            {groupedMonitors.map((group) => {
              const groupStatus =
                (['down', 'maintenance', 'unknown', 'paused', 'up'] as const).find((status) =>
                  group.monitors.some((monitor) => monitor.status === status),
                ) ?? 'unknown';
              return (
                <details
                  key={group.name}
                  open
                  className="ui-public-group border-t border-line-soft first:border-t-0"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded px-3 py-3 text-[13px] font-medium text-ink hover:bg-surface-2 sm:px-4 [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0 truncate">
                      {group.name === t('status_page.group_ungrouped') ? siteTitle : group.name}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <Badge variant={groupStatus}>{statusLabel(groupStatus, t)}</Badge>
                      <svg
                        className="ui-public-group-chevron h-4 w-4 text-ink-3"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        aria-hidden
                      >
                        <path d="m6 8 4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  </summary>
                  <div className="min-w-0 px-2 sm:px-3">
                    {group.monitors.map((monitor) => (
                      <MonitorCard
                        key={monitor.id}
                        monitor={monitor}
                        ratingLevel={data.uptime_rating_level}
                        timeZone={timeZone}
                        onSelect={() => setSelectedMonitorId(monitor.id)}
                        onDayClick={(dayStartAt) =>
                          setSelectedDay({ monitorId: monitor.id, dayStartAt })
                        }
                      />
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
          {data.monitors.length === 0 && (
            <Card className="p-8 text-center">
              <p className="text-ink-2 dark:text-ink-3">{t('status_page.no_monitors')}</p>
            </Card>
          )}
        </section>

        <section className="mt-10 space-y-10 border-t border-line pt-8 sm:mt-12 sm:space-y-12 sm:pt-10">
          <div>
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-[20px] font-semibold text-ink">
                {t('status_page.incident_history')}
              </h2>
              <Link to="/history/incidents" className="shrink-0 text-sm text-ink-3 hover:text-ink">
                {t('common.view_more')}
              </Link>
            </div>

            {resolvedIncidentPreview ? (
              <IncidentCard
                incident={resolvedIncidentPreview}
                timeZone={timeZone}
                onClick={() =>
                  setSelectedIncidentRequest({
                    incident: resolvedIncidentPreview,
                    resolvedOnly: true,
                  })
                }
              />
            ) : (
              <p className="text-sm text-ink-3">{t('status_page.no_past_incidents')}</p>
            )}
          </div>

          <div>
            <div className="mb-6 flex items-center justify-between gap-4">
              <h2 className="text-[20px] font-semibold text-ink">
                {t('status_page.maintenance_history')}
              </h2>
              <Link
                to="/history/maintenance"
                className="shrink-0 text-sm text-ink-3 hover:text-ink"
              >
                {t('common.view_more')}
              </Link>
            </div>

            {maintenanceHistoryPreview ? (
              <article className="min-w-0 border-l-2 border-line py-1 pl-5">
                <div className="mb-2 text-xs text-ink-3">
                  <span>
                    {formatDateTime(maintenanceHistoryPreview.starts_at, timeZone, locale)} –{' '}
                    {formatDateTime(maintenanceHistoryPreview.ends_at, timeZone, locale)}
                  </span>
                </div>
                <h3 className="mb-2 break-words text-[14px] font-semibold text-ink">
                  {maintenanceHistoryPreview.title}
                </h3>
                <div className="text-sm text-ink-2 mb-2">
                  {t('common.affected')}:{' '}
                  {maintenanceHistoryPreview.monitor_ids
                    .map((id) => monitorNames.get(id) ?? `#${id}`)
                    .join(', ')}
                </div>
                {maintenanceHistoryPreview.message && (
                  <Markdown text={maintenanceHistoryPreview.message} />
                )}
              </article>
            ) : (
              <p className="text-sm text-ink-3">{t('status_page.no_past_maintenance')}</p>
            )}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="ui-public-container">
        <div className="py-10 text-center text-xs text-ink-3">
          {t('status_page.powered_by', { value: siteTitle })}
        </div>
      </footer>

      {/* Modals */}
      {selectedMonitorId !== null && (
        <MonitorDetail monitorId={selectedMonitorId} onClose={() => setSelectedMonitorId(null)} />
      )}

      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          monitorNames={monitorNames}
          timeZone={timeZone}
          isLoadingDetails={incidentDetailQuery.isLoading}
          hasDetailsError={incidentDetailQuery.isError}
          onClose={() => setSelectedIncidentRequest(null)}
        />
      )}

      {selectedDay && (
        <DayDowntimeModal
          dayStartAt={selectedDay.dayStartAt}
          outages={currentDayOutages}
          maintenanceWindows={dayContextQuery.data?.maintenance_windows ?? []}
          incidents={dayContextQuery.data?.incidents ?? []}
          isLoading={outagesQuery.isLoading || dayContextQuery.isLoading}
          error={
            outagesQuery.isError
              ? t('status_page.failed_load_outages')
              : dayContextQuery.isError
                ? t('status_page.failed_load_context')
                : undefined
          }
          onRetry={() => {
            void outagesQuery.refetch();
            void dayContextQuery.refetch();
          }}
          timeZone={timeZone}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

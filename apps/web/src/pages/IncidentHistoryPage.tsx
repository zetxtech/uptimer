import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../app/I18nContext';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { ApiError, fetchPublicIncidents, fetchStatus } from '../api/client';
import type { Incident } from '../api/types';
import { Markdown } from '../components/Markdown';
import { PublicDialog } from '../components/PublicDialog';
import { PublicStatusHeader } from '../components/PublicStatusHeader';
import { Badge, Button, Card } from '../components/ui';
import { incidentImpactLabel, incidentStatusLabel } from '../i18n/labels';
import { formatDateTime, getBrowserTimeZone } from '../utils/datetime';

function formatError(err: unknown): string | undefined {
  if (!err) return undefined;
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

function IncidentCard({
  incident,
  onClick,
  timeZone,
}: {
  incident: Incident;
  onClick: () => void;
  timeZone: string;
}) {
  const { locale, t } = useI18n();
  const latestUpdate = incident.updates.at(-1);
  const message = latestUpdate?.message ?? incident.message;
  const updatedAt = latestUpdate?.created_at ?? incident.started_at;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2 bg-surface-2 px-5 py-3 text-[13px] font-medium text-ink-2 sm:px-7">
        <time dateTime={new Date(incident.started_at * 1000).toISOString()}>
          {formatDateTime(incident.started_at, timeZone, locale)}
        </time>
        <span>{incidentImpactLabel(incident.impact, t)}</span>
      </div>
      <button
        type="button"
        onClick={onClick}
        className="block w-full min-w-0 px-5 py-7 text-left hover:bg-surface-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink sm:px-7"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="min-w-0 break-words text-[16px] font-semibold text-ink">
            {incident.title}
          </h3>
          <Badge variant={incident.status === 'resolved' ? 'up' : 'paused'}>
            {incidentStatusLabel(incident.status, t)}
          </Badge>
        </div>
        <div className="mt-6 flex gap-2">
          <svg
            viewBox="0 0 24 24"
            className={`mt-4 h-[18px] w-[18px] shrink-0 ${incident.status === 'resolved' ? 'text-status-up' : 'text-status-paused'}`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.5}
            aria-hidden
          >
            <circle cx="12" cy="12" r="9" />
            <path
              d={incident.status === 'resolved' ? 'm8 12 3 3 5-6' : 'M12 7v6m0 4h.01'}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="min-w-0 grow rounded-lg border border-line bg-surface-2 p-4 text-[13px] text-ink-3">
            <p className="flex flex-wrap gap-x-2 gap-y-1">
              <span className="font-medium text-ink">
                {incidentStatusLabel(latestUpdate?.status ?? incident.status, t)}
              </span>
              <time dateTime={new Date(updatedAt * 1000).toISOString()}>
                {formatDateTime(updatedAt, timeZone, locale)}
              </time>
            </p>
            {message && (
              <p className="mt-3 line-clamp-4 break-words leading-relaxed text-ink-2">{message}</p>
            )}
          </div>
        </div>
      </button>
    </>
  );
}

function IncidentDetail({
  incident,
  monitorNames,
  onClose,
  timeZone,
}: {
  incident: Incident;
  monitorNames: Map<number, string>;
  onClose: () => void;
  timeZone: string;
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
        <Button
          onClick={onClose}
          aria-label={t('common.close')}
          variant="ghost"
          size="sm"
          className="h-8 w-8 rounded-full !p-0 text-ink-3 hover:text-ink-2 dark:hover:text-ink-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </Button>
      </div>

      <div className="space-y-2 sm:space-y-3 text-sm text-ink-2 mb-4 sm:mb-6 pb-4 sm:pb-6 border-b border-line-soft dark:border-line">
        <div className="flex flex-col sm:flex-row sm:gap-2">
          <span className="text-ink-3 dark:text-ink-2 sm:w-20 text-xs sm:text-sm">
            {t('common.affected')}:
          </span>
          <span className="text-sm">
            {incident.monitor_ids.map((id) => monitorNames.get(id) ?? `#${id}`).join(', ')}
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
      </div>
    </PublicDialog>
  );
}

export function IncidentHistoryPage() {
  const { locale, t } = useI18n();
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [all, setAll] = useState<Incident[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<Incident | null>(null);

  const statusQuery = useQuery({ queryKey: ['status'], queryFn: fetchStatus });
  const timeZone = getBrowserTimeZone() ?? statusQuery.data?.site_timezone ?? 'UTC';
  useApplyServerLocaleSetting(statusQuery.data?.site_locale);

  const query = useQuery({
    queryKey: ['public-incidents', 'resolved', cursor],
    queryFn: () => fetchPublicIncidents(20, cursor, { resolvedOnly: true }),
  });

  useEffect(() => {
    document.title = t('incident_history.title');
  }, [t]);

  useEffect(() => {
    if (!query.data) return;
    setAll((prev) => {
      const merged = [...prev];
      const seen = new Set(prev.map((it) => it.id));
      for (const it of query.data.incidents) {
        if (it.status !== 'resolved') continue;
        if (seen.has(it.id)) continue;
        merged.push(it);
      }
      return merged;
    });
    setNextCursor(query.data.next_cursor);
  }, [query.data]);

  const monitorNames = useMemo(() => {
    const monitors = statusQuery.data?.monitors ?? [];
    return new Map(monitors.map((m) => [m.id, m.name] as const));
  }, [statusQuery.data?.monitors]);

  const months = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone });
    const groups = new Map<string, Incident[]>();
    for (const incident of [...all].sort((a, b) => b.started_at - a.started_at)) {
      const month = formatter.format(new Date(incident.started_at * 1000));
      const incidents = groups.get(month) ?? [];
      incidents.push(incident);
      groups.set(month, incidents);
    }
    return [...groups.entries()];
  }, [all, locale, timeZone]);

  const isInitialLoading = query.isLoading && all.length === 0;

  return (
    <div className="min-h-screen bg-surface">
      <PublicStatusHeader siteTitle={statusQuery.data?.site_title || 'Uptimer'} />

      <main className="ui-public-container pb-16 pt-16 sm:pt-20">
        <h1 className="ui-public-title mb-11 text-center">{t('incident_history.title')}</h1>
        {isInitialLoading ? (
          <div className="space-y-8" aria-busy="true">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="ui-skeleton h-24 rounded" />
            ))}
          </div>
        ) : query.isError && all.length === 0 ? (
          <Card className="space-y-4 p-5">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formatError(query.error) ?? t('history.failed_load_incidents')}
            </p>
            <Button
              variant="secondary"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {query.isFetching ? t('common.loading_ellipsis') : t('common.retry')}
            </Button>
          </Card>
        ) : all.length > 0 ? (
          <>
            <div className="space-y-11">
              {months.map(([month, incidents]) => (
                <section
                  key={month}
                  className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <h2 className="border-b border-line px-5 py-5 text-[14px] font-semibold text-ink sm:px-7">
                    {month}
                  </h2>
                  <ol className="min-w-0 divide-y divide-line-soft">
                    {incidents.map((incident) => (
                      <li key={incident.id} className="min-w-0">
                        <IncidentCard
                          incident={incident}
                          timeZone={timeZone}
                          onClick={() => setSelectedIncident(incident)}
                        />
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>

            {query.isError && (
              <p className="mt-6 text-sm text-status-down">
                {formatError(query.error) ?? t('history.failed_load_incidents')}
              </p>
            )}
            {(nextCursor || query.isError) && (
              <div className="mt-10 flex justify-center">
                <Button
                  onClick={() => {
                    if (query.isError) {
                      void query.refetch();
                    } else if (nextCursor !== null) {
                      setCursor(nextCursor);
                    }
                  }}
                  disabled={query.isFetching}
                  variant="secondary"
                >
                  {query.isFetching
                    ? t('common.loading_ellipsis')
                    : query.isError
                      ? t('common.retry')
                      : t('common.load_more')}
                </Button>
              </div>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-line bg-surface px-5 py-14 text-center text-[14px] font-medium text-ink-3">
            {t('status_page.no_past_incidents')}
          </div>
        )}
      </main>

      {selectedIncident && (
        <IncidentDetail
          incident={selectedIncident}
          monitorNames={monitorNames}
          timeZone={timeZone}
          onClose={() => setSelectedIncident(null)}
        />
      )}
    </div>
  );
}

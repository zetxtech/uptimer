import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { adminEventDetailPath } from '../app/adminPaths';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { useI18n } from '../app/I18nContext';
import { fetchAdminEvents, fetchAdminSettings } from '../api/client';
import type { MonitorEvent } from '../api/types';
import { AdminPageHeader, AdminShell } from '../components/AdminShell';
import { AdminSearchField } from '../components/AdminResourceLists';
import { Select } from '../components/Select';
import { Button, SkeletonRows, cn } from '../components/ui';
import { formatRelativeTime } from '../utils/datetime';
import { eventCauseLabel } from '../utils/eventCause';
import { useDebouncedValue } from '../utils/useDebouncedValue';

type EventStatusFilter = 'all' | 'open' | 'resolved';

function eventDurationSec(event: MonitorEvent, nowSec: number): number {
  return Math.max(0, (event.ended_at ?? nowSec) - event.started_at);
}

function formatEventDuration(seconds: number, locale: string): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  if (minutes < 1) return locale.startsWith('zh') ? '不到 1 分钟' : 'less than a minute';
  if (minutes < 60) return locale.startsWith('zh') ? `${minutes} 分钟` : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (locale.startsWith('zh')) {
    return rest === 0 ? `${hours} 小时` : `${hours} 小时 ${rest} 分钟`;
  }
  return rest === 0 ? `${hours} hours` : `${hours} hours ${rest} minutes`;
}

export function AdminEvents() {
  const { locale, t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const monitorParam = Number(searchParams.get('monitor'));
  const monitorId = Number.isFinite(monitorParam) && monitorParam > 0 ? monitorParam : undefined;
  const [status, setStatus] = useState<EventStatusFilter>('all');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search.trim(), 350);

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings });
  const settings = settingsQuery.data?.settings;
  useApplyServerLocaleSetting(settings?.site_locale);
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';

  const eventsQuery = useInfiniteQuery({
    queryKey: [
      'admin-events',
      { monitorId: monitorId ?? null, status, q: debouncedSearch || null },
    ],
    queryFn: ({ pageParam }) =>
      fetchAdminEvents({
        limit: 50,
        status,
        ...(monitorId ? { monitorId } : {}),
        ...(debouncedSearch ? { q: debouncedSearch } : {}),
        ...(pageParam === undefined ? {} : { cursor: pageParam }),
      }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    document.title = `${siteTitle} · ${t('events.title')}`;
  }, [siteTitle, t]);

  const nowSec = Date.now() / 1000;
  const events = useMemo(
    () => eventsQuery.data?.pages.flatMap((page) => page.events) ?? [],
    [eventsQuery.data?.pages],
  );
  const monitorName = events.length > 0 && monitorId !== undefined ? events[0]?.monitor_name : null;

  const openCount = events.filter((event) => event.ended_at === null).length;

  return (
    <AdminShell active="events" layout="sidebar">
      <main className="mx-auto w-full max-w-[1160px] px-5 pb-10 pt-6 sm:pt-8">
        <AdminPageHeader
          title={t('events.title')}
          description={t('events.subtitle')}
          search={
            <AdminSearchField value={search} onChange={setSearch} label={t('events.search')} />
          }
          actions={
            monitorId === undefined ? null : (
              <div className="flex items-center gap-2 text-[13px] text-ink-2">
                <span>{t('events.filtered_by_monitor')}</span>
                <span className="font-medium text-ink">{monitorName ?? `#${monitorId}`}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setSearchParams({}, { replace: true })}
                >
                  {t('events.clear_filter')}
                </Button>
              </div>
            )
          }
        />

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <div className="w-[10rem]">
            <Select
              className="ui-select ui-compact"
              value={status}
              aria-label={t('events.filter_state')}
              onChange={(next) => setStatus(next as EventStatusFilter)}
            >
              <option value="all">{t('events.filter_all')}</option>
              <option value="open">{t('events.filter_open')}</option>
              <option value="resolved">{t('events.filter_resolved')}</option>
            </Select>
          </div>
          <span className="text-[12px] text-ink-3">
            {t('events.summary', { total: events.length, open: openCount })}
          </span>
        </div>

        {eventsQuery.isError ? (
          <div
            role="alert"
            className="ui-panel mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <span className="text-[13px] text-status-down">{t('events.load_failed')}</span>
            <Button
              variant="secondary"
              size="sm"
              disabled={eventsQuery.isFetching}
              onClick={() => void eventsQuery.refetch()}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : eventsQuery.isLoading ? (
          <SkeletonRows
            className="ui-panel mt-4 overflow-hidden"
            rows={6}
            rowClassName="ui-event-row"
            cells={['w-56', 'hidden w-40 lg:block', 'hidden w-24 lg:block', 'w-20']}
          />
        ) : events.length === 0 ? (
          <p className="ui-panel mt-4 px-4 py-10 text-center text-[13px] text-ink-3">
            {debouncedSearch ? t('events.empty_search') : t('events.empty')}
          </p>
        ) : (
          <div className="ui-event-list mt-4">
            <div className="ui-event-row ui-event-head" aria-hidden>
              <span>{t('events.col_event')}</span>
              <span className="hidden lg:block">{t('events.col_monitor')}</span>
              <span className="hidden lg:block">{t('events.col_duration')}</span>
              <span>{t('events.col_state')}</span>
            </div>
            <div className="divide-y divide-line">
              {events.map((event) => {
                const open = event.ended_at === null;
                const cause = eventCauseLabel(event, [], t);
                return (
                  <Link key={event.id} to={adminEventDetailPath(event.id)} className="ui-event-row">
                    <div className="flex min-w-0 items-start gap-3">
                      <span
                        className={cn('ui-event-mark', !open && 'ui-event-mark-resolved')}
                        aria-hidden
                      >
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.7}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d={
                              open
                                ? 'M12 9v3.75m0 3h.008M20.618 5.984A15.557 15.557 0 0 1 12 2.25a15.557 15.557 0 0 1-8.618 3.734A15.58 15.58 0 0 0 3 9.75c0 6.116 3.52 11.154 9 12.75 5.48-1.596 9-6.634 9-12.75 0-1.293-.132-2.554-.382-3.766Z'
                                : 'm9 12.75 2.25 2.25L15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
                            }
                          />
                        </svg>
                      </span>
                      <div className="min-w-0">
                        <span className="block truncate text-[13px] font-semibold leading-[19px] text-ink">
                          {event.monitor_name}
                        </span>
                        <div className="truncate text-[12px] leading-[19px] text-ink-2">
                          {cause}
                        </div>
                        <div className="text-[11px] text-ink-3">
                          {t('events.started')} {formatRelativeTime(event.started_at, locale)}
                        </div>
                      </div>
                    </div>
                    <div className="hidden min-w-0 lg:block">
                      <span
                        className="block truncate text-[13px] text-ink"
                        title={event.monitor_target}
                      >
                        {event.monitor_target}
                      </span>
                    </div>
                    <div className="hidden text-[13px] tabular-nums text-ink-2 lg:block">
                      {formatEventDuration(eventDurationSec(event, nowSec), locale)}
                    </div>
                    <div className="text-[13px] text-ink-2">
                      {open ? t('events.state_open') : t('events.state_resolved')}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {events.length > 0 && (eventsQuery.hasNextPage || eventsQuery.isFetchNextPageError) ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="secondary"
              disabled={eventsQuery.isFetchingNextPage}
              aria-busy={eventsQuery.isFetchingNextPage}
              onClick={() => void eventsQuery.fetchNextPage()}
            >
              {eventsQuery.isFetchingNextPage
                ? t('common.loading_ellipsis')
                : eventsQuery.isFetchNextPageError
                  ? t('common.retry')
                  : t('common.load_more')}
            </Button>
          </div>
        ) : null}
      </main>
    </AdminShell>
  );
}

import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

import { useI18n } from '../app/I18nContext';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { ApiError, fetchPublicMaintenanceWindows, fetchStatus } from '../api/client';
import type { MaintenanceWindow } from '../api/types';
import { Markdown } from '../components/Markdown';
import { PublicStatusHeader } from '../components/PublicStatusHeader';
import { Button, Card } from '../components/ui';
import { formatDateTime, getBrowserTimeZone } from '../utils/datetime';

function formatError(err: unknown): string | undefined {
  if (!err) return undefined;
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function MaintenanceHistoryPage() {
  const { locale, t } = useI18n();
  const [cursor, setCursor] = useState<number | undefined>(undefined);
  const [all, setAll] = useState<MaintenanceWindow[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);

  const statusQuery = useQuery({ queryKey: ['status'], queryFn: fetchStatus });
  const timeZone = getBrowserTimeZone() ?? statusQuery.data?.site_timezone ?? 'UTC';
  useApplyServerLocaleSetting(statusQuery.data?.site_locale);
  const monitorNames = useMemo(
    () => new Map((statusQuery.data?.monitors ?? []).map((m) => [m.id, m.name] as const)),
    [statusQuery.data?.monitors],
  );

  const query = useQuery({
    queryKey: ['public-maintenance-windows', 'history', cursor],
    queryFn: () => fetchPublicMaintenanceWindows(20, cursor),
  });

  useEffect(() => {
    document.title = t('maintenance_history.title');
  }, [t]);

  useEffect(() => {
    if (!query.data) return;
    setAll((prev) => {
      const merged = [...prev];
      const seen = new Set(prev.map((it) => it.id));
      for (const it of query.data.maintenance_windows) {
        if (seen.has(it.id)) continue;
        merged.push(it);
      }
      return merged;
    });
    setNextCursor(query.data.next_cursor);
  }, [query.data]);

  const months = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone });
    const groups = new Map<string, MaintenanceWindow[]>();
    for (const window of [...all].sort((a, b) => b.starts_at - a.starts_at)) {
      const month = formatter.format(new Date(window.starts_at * 1000));
      const windows = groups.get(month) ?? [];
      windows.push(window);
      groups.set(month, windows);
    }
    return [...groups.entries()];
  }, [all, locale, timeZone]);

  const isInitialLoading = query.isLoading && all.length === 0;

  return (
    <div className="min-h-screen bg-surface">
      <PublicStatusHeader siteTitle={statusQuery.data?.site_title || 'Uptimer'} />

      <main className="ui-public-container pb-16 pt-16 sm:pt-20">
        <h1 className="ui-public-title mb-11 text-center">{t('maintenance_history.title')}</h1>
        {isInitialLoading ? (
          <div className="space-y-8" aria-busy="true">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={idx} className="ui-skeleton h-24 rounded" />
            ))}
          </div>
        ) : query.isError && all.length === 0 ? (
          <Card className="space-y-4 p-5">
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {formatError(query.error) ?? t('history.failed_load_maintenance')}
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
              {months.map(([month, windows]) => (
                <section
                  key={month}
                  className="min-w-0 overflow-hidden rounded-xl border border-line bg-surface"
                >
                  <h2 className="border-b border-line px-5 py-5 text-[14px] font-semibold text-ink sm:px-7">
                    {month}
                  </h2>
                  <ol className="min-w-0 divide-y divide-line-soft">
                    {windows.map((window) => (
                      <li key={window.id} className="min-w-0 px-5 py-7 sm:px-7">
                        <div className="mb-2 text-xs leading-relaxed text-ink-3">
                          <time dateTime={new Date(window.starts_at * 1000).toISOString()}>
                            {formatDateTime(window.starts_at, timeZone, locale)}
                          </time>
                          {' – '}
                          <time dateTime={new Date(window.ends_at * 1000).toISOString()}>
                            {formatDateTime(window.ends_at, timeZone, locale)}
                          </time>
                        </div>
                        <h3 className="mb-3 break-words text-[16px] font-semibold text-ink">
                          {window.title}
                        </h3>
                        <p className="mb-3 break-words text-sm text-ink-2">
                          {t('common.affected')}:{' '}
                          {window.monitor_ids
                            .map((id) => monitorNames.get(id) ?? `#${id}`)
                            .join(', ')}
                        </p>
                        {window.message && (
                          <div className="min-w-0 break-words leading-relaxed">
                            <Markdown text={window.message} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ol>
                </section>
              ))}
            </div>

            {query.isError && (
              <p className="mt-6 text-sm text-status-down">
                {formatError(query.error) ?? t('history.failed_load_maintenance')}
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
            {t('status_page.no_past_maintenance')}
          </div>
        )}
      </main>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { ADMIN_HEARTBEATS_PATH, adminMonitorDetailPath } from '../app/adminPaths';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { useI18n } from '../app/I18nContext';
import { ApiError, createMonitor, fetchAllAdminMonitors, fetchAdminSettings } from '../api/client';
import type { AdminMonitor } from '../api/types';
import { AdminBreadcrumbs, AdminShell } from '../components/AdminShell';
import { MonitorForm } from '../components/MonitorForm';
import { Button, SkeletonRows, Toast, ToastStack, cn } from '../components/ui';
import { statusLabel } from '../i18n/labels';
import { formatRelativeTime } from '../utils/datetime';
import { heartbeatPingUrl } from '../utils/heartbeat';

function formatError(err: unknown): string | undefined {
  if (!err) return undefined;
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

function formatIntervalLabel(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function AdminHeartbeats() {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings });
  const monitorsQuery = useQuery({
    queryKey: ['admin-monitors', 'heartbeats'],
    queryFn: () => fetchAllAdminMonitors(),
  });

  const settings = settingsQuery.data?.settings;
  useApplyServerLocaleSetting(settings?.site_locale);
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';

  useEffect(() => {
    document.title = `${siteTitle} · ${t('heartbeats.title')}`;
  }, [siteTitle, t]);

  const heartbeats = useMemo(
    () => (monitorsQuery.data?.monitors ?? []).filter((monitor) => monitor.type === 'heartbeat'),
    [monitorsQuery.data?.monitors],
  );

  const createMut = useMutation({
    mutationFn: createMonitor,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      setCreating(false);
    },
  });

  const copyPingUrl = async (monitor: AdminMonitor) => {
    setCopyFailed(false);
    const url = heartbeatPingUrl(monitor.heartbeat_token);
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(monitor.id);
      window.setTimeout(
        () => setCopiedId((current) => (current === monitor.id ? null : current)),
        1500,
      );
    } catch {
      setCopiedId(null);
      setCopyFailed(true);
    }
  };

  if (creating) {
    return (
      <AdminShell
        active="heartbeats"
        layout="sidebar"
        workspaceHeader={
          <AdminBreadcrumbs
            items={[
              { label: t('heartbeats.title'), to: ADMIN_HEARTBEATS_PATH },
              { label: t('heartbeats.create') },
            ]}
          />
        }
      >
        <MonitorForm
          variant="page"
          showBreadcrumb={false}
          initialType="heartbeat"
          isLoading={createMut.isPending}
          error={createMut.error ? formatError(createMut.error) : undefined}
          onCancel={() => setCreating(false)}
          onSubmit={(data) => createMut.mutate(data)}
        />
      </AdminShell>
    );
  }

  return (
    <AdminShell active="heartbeats" layout="sidebar">
      <main className="mx-auto w-full max-w-[1040px] px-5 pb-12 pt-2.5">
        {heartbeats.length > 0 || monitorsQuery.isLoading || monitorsQuery.isError ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="ui-page-title">{t('heartbeats.title')}</h1>
              <p className="mt-1 max-w-[46rem] text-[13px] text-ink-2">
                {t('heartbeats.subtitle')}
              </p>
            </div>
            <Button
              onClick={() => {
                createMut.reset();
                setCreating(true);
              }}
            >
              {t('heartbeats.create')}
            </Button>
          </div>
        ) : null}

        {settingsQuery.isError ? (
          <div
            role="alert"
            className="mt-4 flex flex-wrap items-center gap-3 text-[13px] text-status-down"
          >
            {t('admin_dashboard.failed_load_settings')}
            <Button
              size="sm"
              variant="secondary"
              disabled={settingsQuery.isFetching}
              onClick={() => void settingsQuery.refetch()}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : null}

        {monitorsQuery.isError ? (
          <div
            role="alert"
            className="ui-panel mt-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-status-down">
                {t('status_page.failed_load_data')}
              </p>
              <p className="mt-1 break-words text-[13px] text-ink-2">
                {formatError(monitorsQuery.error)}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void monitorsQuery.refetch()}
              disabled={monitorsQuery.isFetching}
              aria-busy={monitorsQuery.isFetching}
            >
              {t('common.retry')}
            </Button>
          </div>
        ) : null}

        {monitorsQuery.isLoading ? (
          <div className="ui-panel mt-5 overflow-hidden">
            <div className="ui-heartbeat-grid ui-heartbeat-head">
              <span>{t('common.name')}</span>
              <span>{t('heartbeats.col_ping_url')}</span>
              <span>{t('heartbeats.col_interval')}</span>
              <span>{t('heartbeats.col_last_ping')}</span>
              <span className="text-right">{t('common.state')}</span>
            </div>
            <SkeletonRows
              className="divide-y divide-line-soft"
              rows={3}
              rowClassName="ui-heartbeat-grid ui-heartbeat-row"
              cells={['h-5 w-40', 'w-56', 'w-10', 'w-24', 'ml-auto w-16']}
            />
          </div>
        ) : heartbeats.length === 0 ? (
          !monitorsQuery.isError && (
            <section className="mx-auto flex max-w-[24rem] items-start gap-5 py-16 md:pt-[264px]">
              <svg
                className="mt-1 h-10 w-10 shrink-0 text-ink-3"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M2 12h4l3-8 6 16 3-8h4" />
              </svg>
              <div className="min-w-0">
                <h1 className="ui-page-title">{t('heartbeats.empty_title')}</h1>
                <p className="mt-2 text-[13px] leading-[22px] text-ink-2">
                  {t('heartbeats.subtitle')}
                </p>
                <div className="mt-6">
                  <Button
                    onClick={() => {
                      createMut.reset();
                      setCreating(true);
                    }}
                  >
                    {t('heartbeats.create')}
                  </Button>
                </div>
              </div>
            </section>
          )
        ) : (
          <div className="ui-panel mt-5 overflow-hidden">
            <div className="ui-heartbeat-grid ui-heartbeat-head">
              <span>{t('common.name')}</span>
              <span>{t('heartbeats.col_ping_url')}</span>
              <span>{t('heartbeats.col_interval')}</span>
              <span>{t('heartbeats.col_last_ping')}</span>
              <span className="text-right">{t('common.state')}</span>
            </div>
            <div className="divide-y divide-line-soft">
              {heartbeats.map((monitor) => {
                const pingUrl = heartbeatPingUrl(monitor.heartbeat_token);
                return (
                  <div key={monitor.id} className="ui-heartbeat-grid ui-heartbeat-row">
                    <div className="min-w-0">
                      <Link
                        to={adminMonitorDetailPath(monitor.id)}
                        className="ui-incident-name block truncate hover:underline"
                      >
                        {monitor.name}
                      </Link>
                      <div className="ui-incident-meta">#{monitor.id}</div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2">
                      <code className="truncate font-mono text-[12px] text-ink-2" title={pingUrl}>
                        {pingUrl}
                      </code>
                      <button
                        type="button"
                        onClick={() => void copyPingUrl(monitor)}
                        className="ui-icon-btn"
                        aria-label={t('heartbeats.copy_ping_url')}
                        title={t('heartbeats.copy_ping_url')}
                      >
                        {copiedId === monitor.id ? (
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M4 12.5l5 5L20 6.5"
                            />
                          </svg>
                        ) : (
                          <svg
                            className="h-4 w-4"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.6}
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M9 9V5.4A1.4 1.4 0 0 1 10.4 4h8.2A1.4 1.4 0 0 1 20 5.4v8.2a1.4 1.4 0 0 1-1.4 1.4H15M5.4 9h8.2A1.4 1.4 0 0 1 15 10.4v8.2a1.4 1.4 0 0 1-1.4 1.4H5.4A1.4 1.4 0 0 1 4 18.6v-8.2A1.4 1.4 0 0 1 5.4 9z"
                            />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="text-[13px] text-ink-2">
                      {formatIntervalLabel(monitor.interval_sec)}
                    </div>
                    <div className="text-[13px] text-ink-2">
                      {monitor.last_heartbeat_at === null
                        ? t('heartbeats.never')
                        : formatRelativeTime(monitor.last_heartbeat_at, locale)}
                    </div>
                    <div className="flex justify-end">
                      <span
                        className={cn('ui-heartbeat-state', `ui-monitor-state-${monitor.status}`)}
                      >
                        {monitor.status !== 'paused' && monitor.last_heartbeat_at === null
                          ? t('heartbeats.pending')
                          : statusLabel(monitor.status, t)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {heartbeats.length > 0 ? (
          <p className="mt-3 text-[12px] text-ink-3">{t('heartbeats.hint')}</p>
        ) : null}
      </main>
      <ToastStack>
        {copyFailed ? (
          <Toast
            tone="danger"
            title={t('common.copy_failed')}
            onClose={() => setCopyFailed(false)}
            closeLabel={t('common.close')}
          />
        ) : null}
      </ToastStack>
    </AdminShell>
  );
}

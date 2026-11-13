import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ADMIN_PATH, adminMonitorDetailPath } from '../app/adminPaths';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { useI18n } from '../app/I18nContext';
import {
  ApiError,
  addIncidentUpdate,
  deleteIncident,
  fetchAdminIncident,
  fetchAdminSettings,
  fetchIncidentAttachment,
  resolveIncident,
} from '../api/client';
import type { IncidentStatus } from '../api/types';
import { AdminShell } from '../components/AdminShell';
import { Select } from '../components/Select';
import { Button, cn } from '../components/ui';
import { incidentImpactLabel, incidentStatusLabel } from '../i18n/labels';
import {
  ATTACHMENT_MAX_FILES,
  attachmentSelectionError,
  fileToAttachment,
} from '../utils/attachments';
import {
  formatDateTime,
  formatDateTimeHeading,
  formatDuration,
  formatRelativeTime,
} from '../utils/datetime';

type UpdateStatus = Exclude<IncidentStatus, 'resolved'>;

const UPDATE_STATUSES: UpdateStatus[] = ['investigating', 'identified', 'monitoring'];

function formatError(err: unknown): string {
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function AdminIncidentDetail() {
  const { id } = useParams();
  return <IncidentDetail key={id} incidentId={Number(id)} />;
}

function IncidentDetail({ incidentId }: { incidentId: number }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();

  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings });
  const incidentQuery = useQuery({
    queryKey: ['admin-incidents', 'detail', incidentId],
    queryFn: () => fetchAdminIncident(incidentId),
    enabled: Number.isFinite(incidentId),
  });

  const settings = settingsQuery.data?.settings;
  useApplyServerLocaleSetting(settings?.site_locale);
  const timeZone = settings?.site_timezone || 'UTC';
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';

  const notFound = incidentQuery.error instanceof ApiError && incidentQuery.error.status === 404;
  const incident = notFound ? null : (incidentQuery.data?.incident ?? null);
  const updateStatus = status ?? (incident?.status === 'resolved' ? undefined : incident?.status);

  useEffect(() => {
    if (incident) document.title = `${incident.title} · ${siteTitle}`;
  }, [incident, siteTitle]);

  const updates = useMemo(
    () => [...(incident?.updates ?? [])].sort((a, b) => b.created_at - a.created_at),
    [incident?.updates],
  );

  const monitorNameById = useMemo(
    () =>
      new Map((incidentQuery.data?.monitors ?? []).map((monitor) => [monitor.id, monitor.name])),
    [incidentQuery.data?.monitors],
  );

  const addUpdateMut = useMutation({
    mutationFn: async () => {
      const attachments = await Promise.all(updateFiles.map(fileToAttachment));
      return addIncidentUpdate(incidentId, {
        message,
        ...(updateStatus === undefined ? {} : { status: updateStatus }),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
    },
    onSuccess: async () => {
      setMessage('');
      setUpdateFiles([]);
      await queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
    },
  });

  const resolveMut = useMutation({
    mutationFn: () => resolveIncident(incidentId, message ? { message } : {}),
    onSuccess: async () => {
      setMessage('');
      await queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteIncident(incidentId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
    },
  });

  const isMutating = addUpdateMut.isPending || resolveMut.isPending || deleteMut.isPending;
  const mutationError = resolveMut.error ?? deleteMut.error;
  const resetMutationErrors = () => {
    addUpdateMut.reset();
    resolveMut.reset();
    deleteMut.reset();
  };
  const incidentLoadError =
    incidentQuery.isError && !notFound ? (
      <div
        role="alert"
        className="ui-panel mt-4 flex flex-wrap items-center justify-between gap-3 px-4 py-3"
      >
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-status-down">
            {t('history.failed_load_incidents')}
          </p>
          <p className="mt-1 break-words text-[13px] text-ink-2">
            {formatError(incidentQuery.error)}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={() => void incidentQuery.refetch()}
          disabled={incidentQuery.isFetching}
          aria-busy={incidentQuery.isFetching}
        >
          {t('common.retry')}
        </Button>
      </div>
    ) : null;

  if (incidentQuery.isLoading) {
    return (
      <AdminShell active="dashboard" layout="sidebar">
        <div className="px-5 pt-6 sm:px-8" role="status" aria-label={t('common.loading')} aria-busy>
          <div className="ui-skeleton h-7 w-64" />
          <div className="ui-skeleton mt-3 h-4 w-48" />
        </div>
      </AdminShell>
    );
  }

  if (!incident) {
    return (
      <AdminShell active="dashboard" layout="sidebar">
        <main className="mx-auto w-full max-w-[1040px] px-5 pb-12 pt-2.5">
          {incidentLoadError ?? (
            <h1 className="text-[20px] font-semibold">{t('incident_detail.not_found')}</h1>
          )}
          <Link
            to={`${ADMIN_PATH}?tab=incidents`}
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
          >
            ← {t('admin_dashboard.tab.incidents')}
          </Link>
        </main>
      </AdminShell>
    );
  }

  const resolved = incident.status === 'resolved';
  const length = incident.resolved_at === null ? null : incident.resolved_at - incident.started_at;
  const deleteCurrentIncident = () => {
    if (confirm(`${t('common.delete')} "${incident.title}"?`)) {
      resetMutationErrors();
      deleteMut.mutate(undefined, {
        onSuccess: () => navigate(`${ADMIN_PATH}?tab=incidents`),
      });
    }
  };

  return (
    <AdminShell active="dashboard" layout="sidebar">
      <main className="ui-incident-detail mx-auto w-full max-w-[1040px] px-5 pb-12 pt-10 md:pt-20">
        {incidentLoadError}

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

        <div className="flex flex-col justify-between gap-6 md:flex-row md:gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden
              className={cn(
                'ui-incident-status mt-1.5 grid h-[46px] w-[46px] shrink-0 place-items-center rounded-full border-[5px] bg-clip-padding text-white',
                resolved && 'ui-incident-status-resolved',
              )}
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d={resolved ? 'm4.5 12.75 6 6 9-13.5' : 'M12 8.25v4.5m0 3h.008v.008H12z'}
                />
              </svg>
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-[28px] font-semibold leading-[1.2] tracking-[-0.02em] text-ink">
                {incident.title}
              </h1>
              <div className="mt-[2px] flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px] text-ink-2">
                <span className={resolved ? 'text-status-up' : 'text-status-down'}>
                  {incidentStatusLabel(incident.status, t)}
                </span>
                <span aria-hidden>·</span>
                <time dateTime={new Date(incident.started_at * 1000).toISOString()}>
                  {formatDateTimeHeading(incident.started_at, timeZone, locale)}
                </time>
              </div>
            </div>
          </div>
          {!resolved ? (
            <Button
              className="self-start md:mt-2"
              onClick={() => {
                resetMutationErrors();
                resolveMut.mutate();
              }}
              disabled={isMutating}
              aria-busy={resolveMut.isPending}
            >
              {t('resolve_incident.resolve')}
            </Button>
          ) : null}
        </div>

        {mutationError ? (
          <p role="alert" className="mt-4 break-words text-[13px] text-status-down">
            {formatError(mutationError)}
          </p>
        ) : null}

        <div className="mt-10 flex flex-wrap items-center gap-x-2 gap-y-2 text-[14px] text-ink-2">
          <Link
            to={`${ADMIN_PATH}?tab=incidents`}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
            </svg>
            {t('admin_dashboard.tab.incidents')}
          </Link>
          {incident.monitor_ids.map((monitorId) => (
            <Link
              key={monitorId}
              to={adminMonitorDetailPath(monitorId)}
              className="inline-flex min-w-0 max-w-full items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg
                className="h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 21a9 9 0 0 0 8.716-6.747M12 21a9 9 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.965 8.965 0 0 1 7.843 4.582M12 3a8.965 8.965 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-3 0-5.74-1.1-7.843-2.918m15.686 0a8.959 8.959 0 0 1 .873 6.671m0 0A17.919 17.919 0 0 1 12 16.5c-3.142 0-6.1-.805-8.716-2.247m0 0a8.959 8.959 0 0 1 .873-6.671"
                />
              </svg>
              <span className="truncate">{monitorNameById.get(monitorId) ?? `#${monitorId}`}</span>
            </Link>
          ))}
          <button
            type="button"
            onClick={deleteCurrentIncident}
            disabled={isMutating}
            aria-busy={deleteMut.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-surface-2 hover:text-status-down disabled:opacity-50"
          >
            <svg
              className="h-5 w-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
              />
            </svg>
            {t('common.delete')}
          </button>
          <span className="ml-auto font-mono text-[12px] text-ink-3">#{incident.id}</span>
        </div>

        <dl className="mt-5 grid gap-4 md:grid-cols-3">
          {[
            { label: t('common.impact'), value: incidentImpactLabel(incident.impact, t) },
            {
              label: t('common.started'),
              value: formatRelativeTime(incident.started_at, locale),
              title: formatDateTime(incident.started_at, timeZone, locale),
            },
            {
              label: t('admin_dashboard.incident_col_length'),
              value:
                length !== null ? formatDuration(length) : t('admin_dashboard.incident_ongoing'),
              title:
                incident.resolved_at === null
                  ? undefined
                  : formatDateTime(incident.resolved_at, timeZone, locale),
            },
          ].map((item) => (
            <div key={item.label} className="min-w-0 rounded-lg border border-line bg-surface p-5">
              <dt className="text-[14px] text-ink-2">{item.label}</dt>
              <dd
                className="mt-2 break-words text-[20px] font-semibold leading-[28px] text-ink"
                title={item.title}
              >
                {item.value}
              </dd>
            </div>
          ))}
        </dl>

        <section className="mt-12" aria-labelledby="incident-timeline-title">
          <h2 id="incident-timeline-title" className="text-[16px] font-semibold leading-6 text-ink">
            {t('incident_detail.timeline')}
          </h2>
          {downloadError ? (
            <p role="alert" className="mt-2 text-[12px] text-status-down">
              {t('incident_detail.attachment_download_failed')}
            </p>
          ) : null}
          {updates.length === 0 ? (
            <p className="py-6 text-[14px] text-ink-2">{t('incident_detail.no_updates')}</p>
          ) : (
            <ul className="mt-6">
              {updates.map((update, index) => (
                <li key={update.id} className="mt-1">
                  <div className="flex justify-between">
                    <div className="flex grow items-stretch">
                      <div className="mt-[3.5px] flex w-10 shrink-0 flex-col items-center self-stretch">
                        <span
                          aria-hidden
                          className={cn(
                            'grid h-5 w-5 shrink-0 place-items-center rounded-full border bg-surface',
                            update.status === 'resolved'
                              ? 'border-status-up text-status-up'
                              : 'border-line text-ink-3',
                          )}
                        >
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d={
                                update.status === 'resolved'
                                  ? 'm4.5 12.75 6 6 9-13.5'
                                  : 'M7.5 8.25h9m-9 3H12m-3.75 6-3 3V6a2.25 2.25 0 0 1 2.25-2.25h12A2.25 2.25 0 0 1 21.75 6v9a2.25 2.25 0 0 1-2.25 2.25h-9.75Z'
                              }
                            />
                          </svg>
                        </span>
                        {index < updates.length - 1 ? (
                          <div
                            aria-hidden
                            className="mt-[6px] -mb-[6px] min-h-[20px] w-[3px] grow rounded-full bg-line"
                          />
                        ) : null}
                      </div>
                      <div className="mr-3 mb-5 ml-2 grow">
                        <div className="text-[14px] leading-6 break-words whitespace-pre-wrap text-ink first-line:leading-8">
                          {update.message}
                        </div>
                        {update.attachments?.length ? (
                          <ul className="mt-1 space-y-1">
                            {update.attachments.map((attachment, attachmentIndex) => (
                              <li key={`${attachment.name}-${attachmentIndex}`}>
                                <button
                                  type="button"
                                  className="text-accent hover:underline"
                                  onClick={() => {
                                    setDownloadError(false);
                                    fetchIncidentAttachment(incidentId, update.id, attachmentIndex)
                                      .then((blob) => {
                                        const url = URL.createObjectURL(blob);
                                        const link = document.createElement('a');
                                        link.href = url;
                                        link.download = attachment.name;
                                        link.click();
                                        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
                                      })
                                      .catch(() => setDownloadError(true));
                                  }}
                                >
                                  {attachment.name}
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        <div className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12px] text-ink-2">
                          <h3 className="text-[12px] font-medium text-ink-2">
                            {update.status
                              ? incidentStatusLabel(update.status, t)
                              : t('common.update')}
                          </h3>
                          <span aria-hidden>·</span>
                          <time
                            dateTime={new Date(update.created_at * 1000).toISOString()}
                            title={formatDateTime(update.created_at, timeZone, locale)}
                            className="sm:hidden"
                          >
                            {formatRelativeTime(update.created_at, locale)}
                          </time>
                          <span className="sm:hidden" aria-hidden>
                            · {formatDateTime(update.created_at, timeZone, locale)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="hidden shrink-0 text-[14px] leading-8 text-ink-2 sm:block">
                      <time
                        dateTime={new Date(update.created_at * 1000).toISOString()}
                        title={formatDateTime(update.created_at, timeZone, locale)}
                      >
                        {formatRelativeTime(update.created_at, locale)}
                      </time>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {!resolved ? (
            <div className="ui-panel mt-8 overflow-hidden" aria-busy={isMutating}>
              <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-4">
                <h3 className="text-[14px] font-medium text-ink">
                  {t('incident_detail.post_update')}
                </h3>
                <Select
                  value={updateStatus}
                  onChange={(next) => setStatus(next as UpdateStatus)}
                  disabled={isMutating}
                  aria-label={t('common.state')}
                  className="ui-select ui-compact w-[11rem]"
                >
                  {UPDATE_STATUSES.map((value) => (
                    <option key={value} value={value}>
                      {incidentStatusLabel(value, t)}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-3 p-5 pt-3">
                <textarea
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  disabled={isMutating}
                  rows={3}
                  placeholder={t('incident_detail.message_placeholder')}
                  aria-label={t('incident_detail.message_placeholder')}
                  className="ui-textarea"
                />

                <div className="flex flex-wrap items-center gap-3">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink">
                    <input
                      type="file"
                      multiple
                      disabled={isMutating}
                      className="sr-only"
                      aria-label={t('incident_detail.attachment_add')}
                      onChange={(event) => {
                        const files = [...updateFiles, ...Array.from(event.target.files ?? [])];
                        if (attachmentSelectionError(files)) {
                          setFileError(true);
                        } else {
                          setUpdateFiles(files);
                          setFileError(false);
                        }
                        event.target.value = '';
                      }}
                    />
                    <svg
                      className="h-4 w-4"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m18.4 12.5-6.9 6.9a4.5 4.5 0 0 1-6.4-6.4l8.5-8.5a3 3 0 0 1 4.3 4.3l-8.5 8.5a1.5 1.5 0 0 1-2.1-2.1l7.4-7.4"
                      />
                    </svg>
                    {t('incident_detail.attachment_add')}
                  </label>
                  <span className="text-[12px] text-ink-3">
                    {t('incident_detail.attachment_limit', { count: ATTACHMENT_MAX_FILES })}
                  </span>
                </div>

                {updateFiles.length ? (
                  <ul className="space-y-1 text-[12px] text-ink-2">
                    {updateFiles.map((file, index) => (
                      <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          disabled={isMutating}
                          onClick={() =>
                            setUpdateFiles((files) => files.filter((_, i) => i !== index))
                          }
                          aria-label={`${t('incident_detail.attachment_remove')}: ${file.name}`}
                          className="text-ink-3 hover:text-ink"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {fileError ? (
                  <p role="alert" className="text-[12px] text-status-down">
                    {t('incident_detail.attachment_error')}
                  </p>
                ) : null}

                {addUpdateMut.error ? (
                  <p role="alert" className="break-words text-[13px] text-status-down">
                    {formatError(addUpdateMut.error)}
                  </p>
                ) : null}
                <Button
                  onClick={() => {
                    resetMutationErrors();
                    addUpdateMut.mutate();
                  }}
                  disabled={isMutating || message.trim().length === 0}
                  aria-busy={addUpdateMut.isPending}
                >
                  {t('incident_detail.post_update')}
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-8 text-[14px] text-ink-2">{t('incident_detail.resolved_help')}</p>
          )}
        </section>
      </main>
    </AdminShell>
  );
}

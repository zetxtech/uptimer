import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';

import { ADMIN_EVENTS_PATH, adminMonitorDetailPath } from '../app/adminPaths';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { useI18n } from '../app/I18nContext';
import {
  ApiError,
  fetchAdminEvent,
  fetchAdminMonitor,
  addEventMetadata,
  captureEventScreenshot,
  deleteEventMetadata,
  deleteEvent,
  deleteEventUpdate,
  fetchEventScreenshot,
  fetchEventAttachment,
  fetchAdminSettings,
  postEventUpdate,
  renameEvent,
  reopenEvent,
  requestEventPostmortem,
} from '../api/client';
import type { AdminMonitor, EventCheckResult, EventUpdate } from '../api/types';
import { AdminShell } from '../components/AdminShell';
import { Button, MODAL_OVERLAY_CLASS, MODAL_PANEL_CLASS, SkeletonRows, cn } from '../components/ui';
import { statusLabel } from '../i18n/labels';
import { eventCauseLabel } from '../utils/eventCause';
import { locationFlag } from '../utils/probeLocation';
import { formatDateTimeHeading, formatProseDuration, formatRelativeTime } from '../utils/datetime';

type TimelineTone = 'start' | 'down' | 'up' | 'idle';

interface TimelineEntry {
  key: string;
  tone: TimelineTone;
  updateId?: number;
  text: string;
  at: number;
  location?: string | null;
  attachments?: EventUpdate['attachments'];
}

const TONE_COLOR: Record<TimelineTone, string> = {
  start: 'var(--color-blue)',
  down: 'var(--color-down)',
  up: 'var(--color-up)',
  idle: 'var(--color-text-muted)',
};

/**
 * Timeline marker taken from the reference page: a status-coloured disc with a
 * ring at its edge and a white bolt. The ring is white on light surfaces and
 * matches the bordered input colour on dark ones.
 */
const POINT_RING =
  'M11.2586 19.3078C15.8059 19.3078 19.5172 15.6708 19.5172 11.1539C19.5172 6.63698 15.8059 3 11.2586 3C6.71125 3 3 6.63698 3 11.1539C3 15.6708 6.71125 19.3078 11.2586 19.3078Z';
const POINT_BOLT_HEAD =
  'M11.9386 11.108V7.70125C11.9386 7.08492 11.1646 6.8101 10.7759 7.28845L8.00792 10.6952C7.66032 11.123 7.96477 11.7626 8.516 11.7626H11.284C11.6455 11.7626 11.9386 11.4695 11.9386 11.108Z';
const POINT_BOLT_TAIL =
  'M13.8053 10.6553H11.155C10.7725 10.6553 10.4624 10.9654 10.4624 11.3479V14.6097C10.4624 15.2618 11.2813 15.5526 11.6925 15.0465L14.3428 11.7846C14.7106 11.332 14.3885 10.6553 13.8053 10.6553Z';

function TimelinePoint({ tone }: { tone: TimelineTone }) {
  return (
    <svg className="mt-[2px] h-5 w-5 shrink-0" viewBox="2 2 18.6 18.2" fill="none" aria-hidden>
      <ellipse cx="11.2586" cy="11.1539" rx="7.25859" ry="7.1539" fill={TONE_COLOR[tone]} />
      <path
        d={POINT_RING}
        strokeWidth="2"
        className="stroke-white dark:stroke-[var(--color-input-border)]"
      />
      <path d={POINT_BOLT_HEAD} fill="white" />
      <path d={POINT_BOLT_TAIL} fill="white" />
    </svg>
  );
}

/** Builds the curl command that reproduces this check from a terminal. */
function buildReplayCurl(monitor: AdminMonitor): string {
  const method = (monitor.http_method ?? 'GET').toUpperCase();
  const timeoutSec = Math.max(1, Math.round(monitor.timeout_ms / 1000));
  const lines = [`curl -L --connect-timeout ${timeoutSec} --max-time ${timeoutSec + 2} \\`];
  if (method !== 'GET') lines.push(`  -X ${method} \\`);
  const headerEntries = Object.entries(monitor.http_headers_json ?? {});
  if (!headerEntries.some(([name]) => name.toLowerCase() === 'user-agent')) {
    headerEntries.unshift(['User-Agent', 'Uptimer/0.1']);
  }
  for (const [name, value] of headerEntries) {
    lines.push(`  -H '${name}: ${String(value).replace(/'/g, `'\\''`)}' \\`);
  }
  lines.push(`  '${monitor.target}'`);
  return lines.join('\n');
}

function checkSignature(check: Pick<EventCheckResult, 'error' | 'http_status'>): string {
  return check.error ?? (check.http_status === null ? '' : `HTTP ${check.http_status}`);
}

export function AdminEventDetail() {
  const { id } = useParams();
  return <EventDetail key={id} eventId={Number(id)} />;
}

function EventDetail({ eventId }: { eventId: number }) {
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'ips' | 'timing' | 'headers' | 'replay'>('ips');
  const [copied, setCopied] = useState(false);
  const [eventTitle, setEventTitle] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [renameDraft, setRenameDraft] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [actionState, setActionState] = useState<'idle' | 'working' | 'failed'>('idle');
  const [metadataDraft, setMetadataDraft] = useState<{ key: string; value: string } | null>(null);
  const [screenshotState, setScreenshotState] = useState<'idle' | 'working' | 'failed'>('idle');
  const [openEntryMenu, setOpenEntryMenu] = useState<string | null>(null);
  const [updateDraft, setUpdateDraft] = useState('');
  const [updateState, setUpdateState] = useState<'idle' | 'posting' | 'failed'>('idle');
  const [updateFiles, setUpdateFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState(false);
  const [downloadError, setDownloadError] = useState(false);

  const settingsQuery = useQuery({ queryKey: ['admin-settings'], queryFn: fetchAdminSettings });
  const eventQuery = useQuery({
    queryKey: ['admin-events', 'detail', eventId],
    queryFn: () => fetchAdminEvent(eventId),
    enabled: Number.isFinite(eventId) && eventId > 0,
  });

  const event = eventQuery.data?.event ?? null;
  const postmortemQuery = useQuery({
    queryKey: ['admin-events', 'postmortem', eventId],
    queryFn: () => requestEventPostmortem(eventId),
    enabled: event !== null && event.ended_at !== null && !event.ai_summary,
    staleTime: Infinity,
    retry: false,
  });
  const monitorQuery = useQuery({
    queryKey: ['admin-monitors', 'detail', event?.monitor_id ?? 0],
    queryFn: () => fetchAdminMonitor(event?.monitor_id ?? 0),
    enabled: event !== null,
  });

  const settings = settingsQuery.data?.settings;
  useApplyServerLocaleSetting(settings?.site_locale);
  const timeZone = settings?.site_timezone || 'UTC';
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';

  useEffect(() => {
    document.title = `${siteTitle} · ${t('events.title')}`;
  }, [siteTitle, t]);

  const checks = useMemo(() => eventQuery.data?.checks ?? [], [eventQuery.data?.checks]);
  const timeline = useMemo<TimelineEntry[]>(() => {
    if (!event) return [];
    const entries: TimelineEntry[] = [];
    const unknown = t('monitor_detail.unknown_error');

    entries.push({
      key: 'started',
      tone: 'start',
      text: t('events.timeline_event_started'),
      at: event.started_at,
    });

    for (const update of eventQuery.data?.updates ?? []) {
      entries.push({
        key: `update-${update.id}`,
        updateId: update.id,
        tone: 'start',
        text: `${t('events.update_posted_by')}: ${update.body}`,
        at: update.created_at,
        attachments: update.attachments,
      });
    }

    const failures = checks.filter((check) => check.status === 'down');
    let signature: string | null = null;
    for (const check of failures) {
      const next = checkSignature(check);
      if (next === signature) continue;
      signature = next;
      entries.push({
        key: `check-${check.checked_at}`,
        tone: 'down',
        text: t('events.timeline_down', { error: next || unknown }),
        at: check.checked_at,
        location: check.location,
      });
    }
    if (failures.length > 1) {
      const last = failures[failures.length - 1];
      if (last) {
        entries.push({
          key: 'failures',
          tone: 'idle',
          text: t('events.timeline_failures', { count: failures.length }),
          at: last.checked_at,
        });
      }
    }

    if (event.ended_at !== null) {
      entries.push({
        key: 'resolved',
        tone: 'up',
        text: t('events.timeline_recovered'),
        at: event.ended_at,
      });
    } else {
      const last = checks[checks.length - 1];
      entries.push({
        key: 'ongoing',
        tone: 'idle',
        text: t('events.timeline_ongoing'),
        at: last?.checked_at ?? event.started_at,
      });
    }

    return entries.sort((a, b) => b.at - a.at);
  }, [checks, event, t, eventQuery.data?.updates]);

  const eventAiSummary = event?.ai_summary ?? postmortemQuery.data?.ai_summary ?? null;
  const eventAiTitle = eventTitle ?? event?.title ?? null;
  const hasScreenshot = eventQuery.data?.screenshot?.has_image ?? false;
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hasScreenshot) {
      setScreenshotUrl(null);
      return;
    }
    let url: string | null = null;
    let cancelled = false;
    void fetchEventScreenshot(eventId).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setScreenshotUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [eventId, hasScreenshot, eventQuery.data?.screenshot?.captured_at]);
  const metadata = eventQuery.data?.metadata ?? [];

  if (eventQuery.error instanceof ApiError && eventQuery.error.status === 404) {
    return (
      <AdminShell active="events" layout="sidebar">
        <main className="mx-auto w-full max-w-[1040px] px-5 pb-12 pt-2.5">
          <h1 className="text-[20px] font-semibold">{t('events.not_found')}</h1>
          <Link
            to={ADMIN_EVENTS_PATH}
            className="mt-4 inline-flex items-center gap-1.5 text-[13px] text-accent hover:underline"
          >
            ← {t('events.title')}
          </Link>
        </main>
      </AdminShell>
    );
  }

  if (eventQuery.isError) {
    return (
      <AdminShell active="events" layout="sidebar">
        <main className="mx-auto w-full max-w-[1040px] px-5 pb-12 pt-2.5">
          <div
            role="alert"
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-5 py-4"
          >
            <span className="text-[13px] text-status-down">{t('events.load_failed')}</span>
            <Button
              size="sm"
              variant="secondary"
              disabled={eventQuery.isFetching}
              onClick={() => void eventQuery.refetch()}
            >
              {t('common.retry')}
            </Button>
          </div>
        </main>
      </AdminShell>
    );
  }

  if (!event) {
    return (
      <AdminShell active="events" layout="sidebar">
        <main className="mx-auto w-full max-w-[1040px] px-5 pb-12 pt-10 md:pt-20">
          <SkeletonRows
            className="overflow-hidden rounded-lg border border-line bg-surface"
            rows={4}
            rowClassName="ui-event-row"
            cells={['w-52', 'hidden w-40 lg:block', 'hidden w-24 lg:block', 'w-20']}
          />
        </main>
      </AdminShell>
    );
  }

  const causeLabel = eventCauseLabel(event, checks, t);
  const open = event.ended_at === null;
  const nowSec = Math.floor(Date.now() / 1000);
  const durationSec = Math.max(0, (event.ended_at ?? nowSec) - event.started_at);
  const monitor = monitorQuery.data?.monitor ?? null;
  const method = monitor?.http_method?.toUpperCase() ?? 'GET';
  const detailCheck =
    [...checks]
      .reverse()
      .find((check) => check.timings ?? check.response_headers ?? check.resolved_ips) ??
    checks[checks.length - 1] ??
    null;
  const resolvedIps = detailCheck?.resolved_ips ?? null;
  const timings = detailCheck?.timings ?? null;
  const responseHeaders = detailCheck?.response_headers ?? null;
  const headerLines = responseHeaders
    ? [
        `HTTP ${detailCheck?.http_status ?? '—'}`,
        ...Object.entries(responseHeaders).map(([k, v]) => `${k}: ${v}`),
      ]
    : null;
  const replayCurl = monitor ? buildReplayCurl(monitor) : null;
  const timingRows: Array<{ label: string; value: string }> = detailCheck
    ? [
        { label: t('events.timing_effective_url'), value: detailCheck.effective_url ?? '—' },
        {
          label: t('events.timing_redirects'),
          value: detailCheck.redirect_count === null ? '—' : String(detailCheck.redirect_count),
        },
        {
          label: t('events.timing_dns'),
          value: timings?.dnsMs === undefined ? '—' : `${timings.dnsMs} ms`,
        },
        {
          label: t('events.timing_ttfb'),
          value: timings?.ttfbMs === undefined ? '—' : `${timings.ttfbMs} ms`,
        },
        {
          label: t('events.timing_read'),
          value: timings?.readMs === undefined ? '—' : `${timings.readMs} ms`,
        },
        {
          label: t('events.timing_total'),
          value:
            detailCheck.latency_ms === null ? '—' : `${(detailCheck.latency_ms / 1000).toFixed(6)}`,
        },
        {
          label: t('events.timing_status'),
          value: detailCheck.http_status === null ? '—' : String(detailCheck.http_status),
        },
        {
          label: t('events.timing_keyword'),
          value: monitor?.response_keyword ? (detailCheck.status === 'up' ? 'ok' : '—') : '—',
        },
      ]
    : [];

  const targetLabel =
    event.monitor_type === 'heartbeat'
      ? monitor?.heartbeat_token
        ? `POST ${window.location.origin}/api/v1/heartbeat/${monitor.heartbeat_token}`
        : ''
      : event.monitor_target;
  const lastCheck = checks[checks.length - 1] ?? null;
  const metadataRows: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: t('events.col_monitor'),
      value: (
        <Link to={adminMonitorDetailPath(event.monitor_id)} className="hover:underline">
          {event.monitor_name}
        </Link>
      ),
    },
    {
      label: t('events.monitor_type'),
      value:
        event.monitor_type === 'http'
          ? t('monitor_form.type_http')
          : event.monitor_type === 'heartbeat'
            ? t('monitor_form.type_heartbeat')
            : t('monitor_form.type_tcp'),
    },
    { label: t('events.target'), value: targetLabel || '—' },
    {
      label: t('events.request_duration'),
      value: lastCheck?.latency_ms != null ? `${lastCheck.latency_ms} ms` : '—',
    },
    {
      label: t('events.response_code'),
      value: lastCheck?.http_status != null ? String(lastCheck.http_status) : '—',
    },
  ];

  return (
    <AdminShell active="events" layout="sidebar">
      <main className="mx-auto flex w-full max-w-[1040px] flex-col px-5 pb-8 pt-10 md:pt-20">
        <nav className="flex items-center gap-1 text-[13px] text-ink-2">
          <Link
            to={ADMIN_EVENTS_PATH}
            className="-m-1 flex h-[26px] items-center gap-1.5 rounded p-1 transition-colors hover:bg-surface-2 hover:text-ink"
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
                d="M12 9v3.75m0 3h.008M20.618 5.984A15.557 15.557 0 0 1 12 2.25a15.557 15.557 0 0 1-8.618 3.734A15.58 15.58 0 0 0 3 9.75c0 6.116 3.52 11.154 9 12.75 5.48-1.596 9-6.634 9-12.75 0-1.293-.132-2.554-.382-3.766Z"
              />
            </svg>
            {t('events.title')}
          </Link>
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
          <Link
            to={adminMonitorDetailPath(event.monitor_id)}
            className="-m-1 flex h-[26px] items-center rounded p-1 font-medium text-ink transition-colors hover:bg-surface-2"
          >
            {event.monitor_name}
          </Link>
        </nav>

        <div className="mt-6 flex flex-col justify-between gap-6 md:flex-row md:gap-3">
          <div className="flex items-start gap-3">
            <span
              aria-hidden
              className="relative mt-0.5 grid h-[46px] w-[46px] shrink-0 place-items-center rounded-[10px] border border-line bg-surface-2 text-ink-2"
            >
              <svg
                className="h-6 w-6"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 3.5 5.25 5.9v5.2c0 3.9 2.7 7.4 6.75 8.6 4.05-1.2 6.75-4.7 6.75-8.6V5.9L12 3.5Z"
                />
              </svg>
              <span
                className={cn(
                  'absolute -right-1 -bottom-1 grid h-[18px] w-[18px] place-items-center rounded-full text-white ring-2 ring-surface',
                  open ? 'bg-status-down' : 'bg-status-up',
                )}
              >
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <path
                    d={
                      open
                        ? 'M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25Zm0 4.5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 12 6.75Zm0 9a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z'
                        : 'M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z'
                    }
                  />
                </svg>
              </span>
            </span>
            <div className="min-w-0">
              <h1 className="break-words text-[28px] font-semibold leading-[33.6px] text-ink">
                {eventAiTitle ?? event.monitor_name}
              </h1>
              <div className="mt-[2px] text-[14px] text-ink-2">
                <span className={open ? 'text-status-down' : 'text-status-up'}>
                  {open ? t('events.state_open') : t('events.state_resolved')}
                </span>
                <span aria-hidden> · </span>
                <time dateTime={new Date(event.started_at * 1000).toISOString()}>
                  {formatDateTimeHeading(event.started_at, timeZone, locale)}
                </time>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between md:flex-row">
          <div className="flex flex-row flex-wrap gap-y-0.5 text-[14px] text-ink-2">
            <Link
              to={adminMonitorDetailPath(event.monitor_id)}
              className="mr-2 inline-flex items-center whitespace-nowrap rounded px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg
                className="mr-[2px] h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
                />
              </svg>
              <span className="leading-none">{t('events.view_monitor')}</span>
            </Link>
            <button
              type="button"
              onClick={() => {
                setRenameDraft(eventAiTitle ?? '');
                setRenaming(true);
              }}
              className="mr-2 inline-flex items-center whitespace-nowrap rounded px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink"
            >
              <svg
                className="mr-[2px] h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.862 4.487z"
                />
              </svg>
              <span className="leading-none">{t('events.rename')}</span>
            </button>
            {open ? null : (
              <button
                type="button"
                disabled={actionState === 'working'}
                onClick={() => {
                  setActionState('working');
                  reopenEvent(eventId)
                    .then(() => {
                      setActionState('idle');
                      return eventQuery.refetch();
                    })
                    .catch(() => setActionState('failed'));
                }}
                className="mr-2 inline-flex items-center whitespace-nowrap rounded px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
              >
                <svg
                  className="mr-[2px] h-5 w-5 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M16.023 9.348h4.992V4.356m-1.156 12.14a8.25 8.25 0 01-14.335-2.83m-.527-6.01a8.25 8.25 0 0114.35-2.79"
                  />
                </svg>
                <span className="leading-none">{t('events.reopen')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setConfirmRemove(true)}
              className="mr-2 inline-flex items-center whitespace-nowrap rounded px-2 py-1 transition-colors hover:bg-surface-2 hover:text-status-down"
            >
              <svg
                className="mr-[2px] h-5 w-5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 7h12M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7m-7 0l.7 11a1.5 1.5 0 001.5 1.4h3.6a1.5 1.5 0 001.5-1.4L16 7"
                />
              </svg>
              <span className="leading-none">{t('events.remove')}</span>
            </button>
          </div>
          {monitor ? (
            <div className="mt-2 md:mt-0 md:pt-[3px]">
              <div
                aria-label={t('events.monitor_status')}
                className="flex h-6 items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2.5 text-[12px] text-ink-2"
              >
                <span
                  aria-hidden
                  className={cn(
                    'h-2 w-2 rounded-full',
                    monitor.status === 'up' && 'bg-status-up',
                    monitor.status === 'down' && 'bg-status-down',
                    monitor.status === 'maintenance' && 'bg-status-maintenance',
                    monitor.status === 'paused' && 'bg-status-paused',
                    monitor.status === 'unknown' && 'bg-status-unknown',
                  )}
                />
                {statusLabel(monitor.status, t)}
              </div>
            </div>
          ) : null}
        </div>

        <div className="mt-5 flex flex-col md:flex-row md:space-x-4">
          <div className="mt-5 flex-1 rounded-lg border border-line bg-surface p-5">
            <h6 className="text-[14px] text-ink-2">{t('events.cause')}</h6>
            <h2
              className="mt-2 truncate text-xl font-semibold text-ink"
              title={event.initial_error ?? event.last_error ?? undefined}
            >
              {causeLabel}
            </h2>
          </div>
          <div className="mt-5 flex-1 rounded-lg border border-line bg-surface p-5">
            <h6 className="text-[14px] text-ink-2">{t('events.started_at')}</h6>
            <h2 className="mt-2 whitespace-nowrap text-xl font-semibold text-ink">
              <time
                dateTime={new Date(event.started_at * 1000).toISOString()}
                title={formatDateTimeHeading(event.started_at, timeZone, locale)}
              >
                {formatRelativeTime(event.started_at, locale)}
              </time>
            </h2>
          </div>
          <div className="mt-5 flex-1 rounded-lg border border-line bg-surface p-5">
            <h6 className="text-[14px] text-ink-2">{t('events.length')}</h6>
            <h2 className="mt-2 text-xl font-semibold text-ink">
              {formatProseDuration(durationSec, locale, true)}
            </h2>
          </div>
        </div>

        {eventAiSummary || postmortemQuery.isFetching ? (
          <div className="mt-5 rounded-lg border border-line bg-surface p-5">
            <div className="flex items-center gap-2 text-[14px] font-medium text-ink-2">
              <svg
                className="h-4 w-4 text-accent"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden
              >
                <path d="M12 2.25l1.9 5.35 5.35 1.9-5.35 1.9L12 16.75l-1.9-5.35L4.75 9.5l5.35-1.9L12 2.25z" />
                <path d="M18.75 15l.95 2.3 2.3.95-2.3.95-.95 2.3-.95-2.3-2.3-.95 2.3-.95.95-2.3z" />
              </svg>
              {t('events.ai_postmortem')}
            </div>
            <p className="mt-3 text-[14px] leading-6 text-ink">
              {eventAiSummary ?? t('events.ai_generating')}
            </p>
          </div>
        ) : null}

        <div className="mt-5 rounded-lg border border-line bg-surface p-5 pt-0">
          <div className="my-5">
            <p className="text-[14px] font-medium text-ink-2">{t('events.target')}</p>
            <code className="mt-2 block rounded-lg border border-[color:var(--color-input-border)] bg-surface-2 px-3 py-2 font-mono text-[14px] leading-[21.7px] break-all text-ink-2">
              {event.monitor_type === 'http' ? (
                <>
                  {method}{' '}
                  <a
                    className="underline"
                    href={event.monitor_target}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {event.monitor_target}
                  </a>
                </>
              ) : event.monitor_type === 'heartbeat' ? (
                monitor?.heartbeat_token ? (
                  `POST ${window.location.origin}/api/v1/heartbeat/${monitor.heartbeat_token}`
                ) : (
                  t('monitor_detail.unknown_error')
                )
              ) : (
                event.monitor_target
              )}
            </code>
          </div>
          <div className="-m-5 mt-0 border-t border-line p-5">
            <p className="text-[14px] text-ink-2">{t('events.col_monitor')}</p>
            <p className="mt-3 text-[14px] font-medium text-ink">
              <Link to={adminMonitorDetailPath(event.monitor_id)} className="hover:underline">
                {event.monitor_name}
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-line bg-surface">
          <div className="flex items-stretch gap-6 overflow-x-auto border-b border-line-soft px-5 text-[13px]">
            {(
              [
                { id: 'ips', label: t('events.tab_resolved_ips'), hint: t('events.ips_hint') },
                { id: 'timing', label: t('events.tab_timing'), hint: null },
                { id: 'headers', label: t('events.tab_headers'), hint: null },
                { id: 'replay', label: t('events.tab_replay'), hint: t('events.replay_hint') },
              ] as const
            ).map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-pressed={tab === entry.id}
                className={cn(
                  'relative flex items-center gap-1.5 whitespace-nowrap py-4 transition-colors',
                  tab === entry.id ? 'text-ink' : 'text-ink-2 hover:text-ink',
                )}
              >
                {entry.label}
                {entry.hint ? (
                  <svg
                    role="img"
                    aria-label={entry.hint}
                    className="h-[14px] w-[14px] text-ink-3"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <title>{entry.hint}</title>
                    <circle cx="12" cy="12" r="9" />
                    <path strokeLinecap="round" d="M12 11v5m0-8.5h.01" />
                  </svg>
                ) : null}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-0 bottom-0 h-[2px] rounded-t-full',
                    tab === entry.id ? 'bg-[color:var(--color-blue)]' : 'bg-transparent',
                  )}
                />
              </button>
            ))}
          </div>
          <div className="max-h-[380px] overflow-auto px-5 py-4">
            {tab === 'ips' ? (
              resolvedIps && resolvedIps.length > 0 ? (
                <code className="block font-mono text-[13px] leading-[22px] whitespace-pre-line text-ink-2">
                  {resolvedIps.join('\n')}
                </code>
              ) : (
                <p className="py-1 text-[13px] text-ink-3">{t('events.ips_missing')}</p>
              )
            ) : tab === 'timing' ? (
              timingRows.length > 0 ? (
                <table className="w-full border-collapse font-mono text-[13px] leading-[22px]">
                  <tbody>
                    {timingRows.map((row) => (
                      <tr key={row.label}>
                        <td className="w-[190px] py-0.5 pr-4 align-top whitespace-nowrap text-ink-2">
                          {row.label}
                        </td>
                        <td className="py-0.5 align-top break-all text-ink">{row.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="py-1 text-[13px] text-ink-3">{t('events.timing_missing')}</p>
              )
            ) : tab === 'headers' ? (
              headerLines ? (
                <code className="block font-mono text-[13px] leading-[22px] whitespace-pre text-ink-2">
                  {headerLines.join('\n')}
                </code>
              ) : (
                <p className="py-1 text-[13px] text-ink-3">{t('events.headers_missing')}</p>
              )
            ) : replayCurl ? (
              <div className="relative">
                <code className="block overflow-x-auto font-mono text-[13px] leading-[22px] whitespace-pre text-ink-2">
                  {replayCurl}
                </code>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard?.writeText(replayCurl).then(
                        () => setCopied(true),
                        () => setCopied(false),
                      );
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-[13px] text-ink-2 transition-colors hover:text-ink"
                  >
                    {copied ? t('events.replay_copied') : t('events.replay_copy')}
                  </button>
                </div>
              </div>
            ) : (
              <p className="py-1 text-[13px] text-ink-3">{t('events.replay_missing')}</p>
            )}
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-line">
          <div className="flex h-[42px] items-center justify-between rounded-t-[7px] border-b border-line bg-surface px-4 text-[13px] font-medium text-ink-2">
            {t('events.screenshot_title')}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={screenshotState === 'working'}
                onClick={() => {
                  setScreenshotState('working');
                  captureEventScreenshot(eventId)
                    .then((hasImage) => {
                      if (!hasImage) throw new Error('unavailable');
                      return eventQuery.refetch();
                    })
                    .then(() => setScreenshotState('idle'))
                    .catch(() => setScreenshotState('failed'));
                }}
                className="rounded px-2 py-1 text-[13px] transition-colors hover:bg-surface-2 hover:text-ink disabled:opacity-60"
              >
                {screenshotState === 'working'
                  ? t('events.action_working')
                  : t('events.screenshot_recapture')}
              </button>
            </div>
          </div>
          {screenshotUrl ? (
            <div className="p-3">
              <a href={screenshotUrl} download={`event-${event.id}.jpg`} className="block">
                <img
                  src={screenshotUrl}
                  alt={t('events.screenshot_title')}
                  className="w-full rounded border border-line"
                />
              </a>
              <div className="mt-2 flex items-center justify-between text-[12px] text-ink-3">
                <span>
                  {eventQuery.data?.screenshot
                    ? formatDateTimeHeading(
                        eventQuery.data.screenshot.captured_at,
                        timeZone,
                        locale,
                      )
                    : ''}
                </span>
                <a
                  href={screenshotUrl}
                  download={`event-${event.id}.jpg`}
                  className="rounded px-2 py-1 transition-colors hover:bg-surface-2 hover:text-ink"
                >
                  {t('events.screenshot_download')}
                </a>
              </div>
            </div>
          ) : (
            <p className="px-4 py-3 text-[13px] text-ink-2">{t('events.screenshot_empty')}</p>
          )}
        </div>

        <div className="mt-5 overflow-hidden rounded-lg border border-line">
          <div className="flex h-[42px] items-center justify-between rounded-t-[7px] border-b border-line bg-surface px-4 text-[13px] font-medium text-ink-2">
            {t('events.metadata')}
            <button
              type="button"
              onClick={() => setMetadataDraft({ key: '', value: '' })}
              className="rounded px-2 py-1 text-[13px] transition-colors hover:bg-surface-2 hover:text-ink"
            >
              + {t('events.metadata_add')}
            </button>
          </div>
          {metadataRows.map((row) => (
            <div key={row.label} className="flex items-stretch border-b border-line">
              <div className="flex h-[39px] flex-1 items-center border-r border-line bg-[color-mix(in_srgb,var(--color-bg-secondary)_20%,transparent)] py-2 pl-5 pr-3 text-[13px] text-ink-2">
                {row.label}
              </div>
              <div className="flex h-[39px] flex-[1.6] items-center overflow-hidden py-2 pl-4 pr-3 text-[13px] break-all text-ink">
                {row.value}
              </div>
              <div className="h-[39px] w-[26px] shrink-0" />
            </div>
          ))}
          {metadata.map((entry) => (
            <div key={entry.id} className="group flex items-stretch border-b border-line">
              <div className="flex h-[39px] flex-1 items-center border-r border-line bg-[color-mix(in_srgb,var(--color-bg-secondary)_20%,transparent)] py-2 pl-5 pr-3 text-[13px] text-ink-2">
                {entry.key}
              </div>
              <div className="flex h-[39px] flex-[1.6] items-center overflow-hidden py-2 pl-4 pr-3 text-[13px] break-all text-ink">
                {entry.value || '—'}
              </div>
              <div className="flex h-[39px] w-[26px] shrink-0 items-center justify-center">
                <button
                  type="button"
                  aria-label={t('events.metadata_remove')}
                  title={t('events.metadata_remove')}
                  onClick={() => {
                    deleteEventMetadata(eventId, entry.id)
                      .then(() => eventQuery.refetch())
                      .catch(() => setActionState('failed'));
                  }}
                  className="rounded p-1 text-ink-3 opacity-0 transition-opacity group-hover:opacity-100 hover:text-status-down focus-visible:opacity-100"
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
                      d="M6 7h12M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7m-7 0 .7 11a1.5 1.5 0 0 0 1.5 1.4h3.6a1.5 1.5 0 0 0 1.5-1.4L16 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {metadataDraft ? (
            <div className="flex items-stretch border-b border-line bg-surface-2/40">
              <div className="flex h-[39px] flex-1 items-center border-r border-line py-1 pl-3 pr-2">
                <input
                  autoFocus
                  value={metadataDraft.key}
                  onChange={(e) => setMetadataDraft({ ...metadataDraft, key: e.target.value })}
                  placeholder={t('events.metadata_key')}
                  aria-label={t('events.metadata_key')}
                  className="ui-input h-7 w-full text-[13px]"
                />
              </div>
              <div className="flex h-[39px] flex-[1.6] items-center border-r border-line py-1 pl-2 pr-2">
                <input
                  value={metadataDraft.value}
                  onChange={(e) => setMetadataDraft({ ...metadataDraft, value: e.target.value })}
                  placeholder={t('events.metadata_value')}
                  aria-label={t('events.metadata_value')}
                  className="ui-input h-7 w-full text-[13px]"
                />
              </div>
              <div className="flex h-[39px] w-[92px] shrink-0 items-center gap-1 px-2">
                <Button
                  size="sm"
                  disabled={metadataDraft.key.trim().length === 0}
                  onClick={() => {
                    const draft = metadataDraft;
                    addEventMetadata(eventId, draft.key.trim(), draft.value.trim())
                      .then(() => {
                        setMetadataDraft(null);
                        return eventQuery.refetch();
                      })
                      .catch(() => setActionState('failed'));
                  }}
                >
                  {t('events.metadata_add')}
                </Button>
                <button
                  type="button"
                  onClick={() => setMetadataDraft(null)}
                  className="rounded p-1 text-ink-3 hover:text-ink"
                  aria-label={t('common.cancel')}
                >
                  <svg
                    className="h-3.5 w-3.5"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>
            </div>
          ) : null}
        </div>

        {actionState === 'failed' || screenshotState === 'failed' ? (
          <p role="alert" className="mt-4 text-[13px] text-status-down">
            {screenshotState === 'failed'
              ? t('events.screenshot_unavailable')
              : t('events.action_failed')}
          </p>
        ) : null}

        <h3 className="mt-12 text-[16px] font-semibold text-ink">{t('events.timeline')}</h3>
        {downloadError ? (
          <p role="alert" className="mt-2.5 text-[12px] text-status-down">
            {t('events.attachment_download_failed')}
          </p>
        ) : null}
        <div className="mt-8 pb-28">
          <div className="flex items-stretch">
            <div className="flex w-10 shrink-0 flex-col items-center self-stretch">
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px] font-semibold"
                style={{
                  background: 'color-mix(in srgb, var(--color-up) 18%, transparent)',
                  color: 'var(--color-up)',
                }}
              >
                {t('events.update_posted_by').slice(0, 2)}
              </span>
              <div
                aria-hidden
                className="mt-[6px] mb-[6px] min-h-14 w-[3px] grow rounded-full bg-line"
              />
            </div>
            <div className="mb-5 ml-3 min-w-0 grow">
              <div className="relative">
                <input
                  value={updateDraft}
                  disabled={updateState === 'posting'}
                  onChange={(e) => setUpdateDraft(e.target.value)}
                  placeholder={t('events.update_placeholder')}
                  className="ui-input h-[42px] w-full pr-11"
                  aria-label={t('events.update_placeholder')}
                />
                <label className="absolute right-1.5 top-1 grid h-8 w-8 cursor-pointer place-items-center rounded-lg text-ink-2 hover:bg-surface-2">
                  <input
                    type="file"
                    multiple
                    disabled={updateState === 'posting'}
                    className="sr-only"
                    aria-label={t('events.attachment_add')}
                    onChange={(e) => {
                      const files = [...updateFiles, ...Array.from(e.target.files ?? [])];
                      if (
                        files.length > 3 ||
                        files.some((file) => file.size > 204800 || file.name.length > 200)
                      ) {
                        setFileError(true);
                      } else {
                        setUpdateFiles(files);
                        setFileError(false);
                      }
                      e.target.value = '';
                    }}
                  />
                  <svg
                    className="h-5 w-5"
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
                </label>
              </div>
              {updateFiles.length ? (
                <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
                  {updateFiles.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                      <span className="truncate">{file.name}</span>
                      <button
                        type="button"
                        disabled={updateState === 'posting'}
                        onClick={() =>
                          setUpdateFiles((files) => files.filter((_, i) => i !== index))
                        }
                        aria-label={`${t('events.attachment_remove')}: ${file.name}`}
                        className="text-ink-3 hover:text-ink"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
              {fileError ? (
                <p role="alert" className="mt-2.5 text-[12px] text-status-down">
                  {t('events.attachment_limit')}
                </p>
              ) : null}
              {updateState === 'failed' ? (
                <p role="alert" className="mt-2.5 text-[12px] text-status-down">
                  {t('events.update_failed')}
                </p>
              ) : null}
            </div>
            <Button
              variant="secondary"
              size="lg"
              className="ml-3 w-16 shrink-0 rounded"
              disabled={updateState === 'posting' || updateDraft.trim().length === 0}
              onClick={() => {
                const body = updateDraft.trim();
                if (!body) return;
                setUpdateState('posting');
                Promise.all(
                  updateFiles.map(async (file) => {
                    const bytes = new Uint8Array(await file.arrayBuffer());
                    let binary = '';
                    for (const byte of bytes) binary += String.fromCharCode(byte);
                    return { name: file.name, data: btoa(binary) };
                  }),
                )
                  .then((attachments) => postEventUpdate(eventId, body, attachments))
                  .then(() => {
                    setUpdateDraft('');
                    setUpdateFiles([]);
                    setUpdateState('idle');
                    void eventQuery.refetch();
                  })
                  .catch(() => setUpdateState('failed'));
              }}
            >
              {updateState === 'posting' ? t('events.update_posting') : t('events.update_post')}
            </Button>
          </div>

          {timeline.map((entry, index) => (
            <div key={entry.key}>
              <div className="flex justify-between">
                <div className="flex grow items-stretch">
                  <div className="mt-[3.5px] flex w-10 shrink-0 flex-col items-center self-stretch">
                    <TimelinePoint tone={entry.tone} />
                    {index < timeline.length - 1 ? (
                      <div
                        aria-hidden
                        className="mt-[6px] mb-[6px] min-h-[20px] w-[3px] grow rounded-full bg-line"
                      />
                    ) : null}
                  </div>
                  <div className="mr-3 mb-5 ml-3 grow text-[14px] leading-6 break-words text-ink first-line:leading-8">
                    {entry.text}
                    {entry.attachments?.length ? (
                      <ul className="mt-1 space-y-1">
                        {entry.attachments.map((attachment, index) => (
                          <li key={`${attachment.name}-${index}`}>
                            <button
                              type="button"
                              className="text-accent hover:underline"
                              onClick={() => {
                                if (!entry.updateId) return;
                                setDownloadError(false);
                                fetchEventAttachment(eventId, entry.updateId, index)
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
                    {entry.location ? (
                      <span className="ml-2 inline-flex h-6 items-center gap-1 rounded-full bg-surface-2 px-2 align-middle text-[12px] text-ink-2">
                        {locationFlag(entry.location) === '🇺🇸' ||
                        locationFlag(entry.location) === '🇦🇺' ? (
                          <img
                            aria-hidden
                            alt=""
                            className="h-3.5 w-3.5 rounded-full object-cover"
                            src={`${import.meta.env.BASE_URL}flags/${locationFlag(entry.location) === '🇺🇸' ? 'us' : 'au'}.svg`}
                          />
                        ) : locationFlag(entry.location) ? (
                          <span aria-hidden>{locationFlag(entry.location)}</span>
                        ) : null}
                        {entry.location}
                      </span>
                    ) : null}
                    {entry.updateId ? (
                      <span className="relative ml-2 inline-flex align-middle">
                        <button
                          type="button"
                          aria-label={t('events.entry_actions')}
                          aria-haspopup="menu"
                          aria-expanded={openEntryMenu === entry.key}
                          onClick={() =>
                            setOpenEntryMenu((open) => (open === entry.key ? null : entry.key))
                          }
                          className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-ink-3 transition-colors hover:text-ink"
                        >
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M6 12a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Zm4.5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0Z" />
                          </svg>
                        </button>
                        {openEntryMenu === entry.key ? (
                          <>
                            <button
                              type="button"
                              aria-hidden
                              tabIndex={-1}
                              className="fixed inset-0 z-10 cursor-default"
                              onClick={() => setOpenEntryMenu(null)}
                            />
                            <span
                              role="menu"
                              className="absolute top-full left-0 z-20 mt-1 min-w-[9rem] overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg"
                            >
                              <button
                                type="button"
                                role="menuitem"
                                onClick={() => {
                                  setOpenEntryMenu(null);
                                  deleteEventUpdate(eventId, entry.updateId!)
                                    .then(() => eventQuery.refetch())
                                    .catch(() => setActionState('failed'));
                                }}
                                className="block w-full px-3 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-status-down"
                              >
                                {t('events.update_delete')}
                              </button>
                            </span>
                          </>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="hidden shrink-0 pl-4 text-[14px] leading-8 text-ink-2 sm:block">
                  <time dateTime={new Date(entry.at * 1000).toISOString()}>
                    {formatDateTimeHeading(entry.at, timeZone, locale)}
                  </time>
                </div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {renaming ? (
        <div
          className={MODAL_OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          aria-label={t('events.rename')}
        >
          <div className={cn(MODAL_PANEL_CLASS, 'w-full max-w-md p-5')}>
            <h2 className="text-[16px] font-semibold text-ink">{t('events.rename_title')}</h2>
            <p className="mt-1 text-[13px] text-ink-2">{t('events.rename_help')}</p>
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              className="ui-input mt-3 text-[14px]"
              aria-label={t('events.rename_title')}
            />
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setActionState('working');
                  renameEvent(eventId, null)
                    .then(() => {
                      setEventTitle(null);
                      setRenaming(false);
                      setActionState('idle');
                      return eventQuery.refetch();
                    })
                    .catch(() => setActionState('failed'));
                }}
              >
                {t('events.rename_clear')}
              </Button>
              <Button
                size="sm"
                disabled={actionState === 'working'}
                onClick={() => {
                  setActionState('working');
                  renameEvent(eventId, renameDraft.trim())
                    .then(() => {
                      setEventTitle(renameDraft.trim() || null);
                      setRenaming(false);
                      setActionState('idle');
                      return eventQuery.refetch();
                    })
                    .catch(() => setActionState('failed'));
                }}
              >
                {actionState === 'working' ? t('events.action_working') : t('events.rename_save')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmRemove ? (
        <div
          className={MODAL_OVERLAY_CLASS}
          role="dialog"
          aria-modal="true"
          aria-label={t('events.remove')}
        >
          <div className={cn(MODAL_PANEL_CLASS, 'w-full max-w-md p-5')}>
            <h2 className="text-[16px] font-semibold text-ink">{t('events.remove')}</h2>
            <p className="mt-1 text-[13px] text-ink-2">{t('events.remove_confirm')}</p>
            <div className="mt-5 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setConfirmRemove(false)}>
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="danger"
                disabled={actionState === 'working'}
                onClick={() => {
                  setActionState('working');
                  deleteEvent(eventId)
                    .then(() => {
                      navigate(ADMIN_EVENTS_PATH);
                    })
                    .catch(() => {
                      setConfirmRemove(false);
                      setActionState('failed');
                    });
                }}
              >
                {actionState === 'working' ? t('events.action_working') : t('events.remove')}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

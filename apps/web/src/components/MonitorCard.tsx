import { useMemo, useState } from 'react';

import type {
  HomepageHeartbeatStrip,
  HomepageMonitorCard,
  PublicMonitor,
  UptimeRatingLevel,
} from '../api/types';
import { useI18n } from '../app/I18nContext';
import { statusLabel } from '../i18n/labels';
import { HeartbeatBar } from './HeartbeatBar';
import { UptimeBar30d } from './UptimeBar30d';
import { formatTime } from '../utils/datetime';
import { formatLatency, formatPct } from '../utils/uptime';

const HEARTBEAT_BARS = 60;
export const AVAILABILITY_BARS = 60;
export const MOBILE_AVAILABILITY_BARS = 30;

type PublicMonitorLike = Pick<
  PublicMonitor,
  | 'id'
  | 'name'
  | 'type'
  | 'display_url'
  | 'status'
  | 'is_stale'
  | 'last_checked_at'
  | 'heartbeats'
  | 'uptime_30d'
  | 'uptime_days'
>;

type HomepageMonitorLike = Pick<
  HomepageMonitorCard,
  | 'id'
  | 'name'
  | 'type'
  | 'display_url'
  | 'status'
  | 'is_stale'
  | 'last_checked_at'
  | 'heartbeat_strip'
  | 'uptime_30d'
  | 'uptime_day_strip'
>;

type MonitorLike = PublicMonitorLike | HomepageMonitorLike;

export interface MonitorCardProps {
  monitor: MonitorLike;
  ratingLevel: UptimeRatingLevel;
  timeZone: string;
  onSelect: () => void;
  onDayClick: (dayStartAt: number) => void;
}

function hasHomepageStrips(monitor: MonitorLike): monitor is HomepageMonitorLike {
  return 'heartbeat_strip' in monitor && 'uptime_day_strip' in monitor;
}

function hasPublicTimeseries(monitor: MonitorLike): monitor is PublicMonitorLike {
  return 'heartbeats' in monitor && 'uptime_days' in monitor;
}

function getHeartbeatLatencyStats(
  heartbeats: PublicMonitor['heartbeats'] | undefined,
  heartbeatStrip: HomepageHeartbeatStrip | undefined,
): {
  fastestMs: number | null;
  avgMs: number | null;
  slowestMs: number | null;
} {
  let fastestMs = Number.POSITIVE_INFINITY;
  let slowestMs = Number.NEGATIVE_INFINITY;
  let latencySum = 0;
  let latencyCount = 0;

  if (Array.isArray(heartbeats)) {
    for (const hb of heartbeats) {
      if (hb.status !== 'up') continue;
      if (typeof hb.latency_ms !== 'number' || !Number.isFinite(hb.latency_ms)) continue;

      const latency = hb.latency_ms;
      if (latency < fastestMs) fastestMs = latency;
      if (latency > slowestMs) slowestMs = latency;
      latencySum += latency;
      latencyCount++;
    }
  } else if (heartbeatStrip) {
    for (let index = 0; index < heartbeatStrip.status_codes.length; index += 1) {
      if (heartbeatStrip.status_codes[index] !== 'u') continue;
      const latency = heartbeatStrip.latency_ms[index];
      if (typeof latency !== 'number' || !Number.isFinite(latency)) continue;

      if (latency < fastestMs) fastestMs = latency;
      if (latency > slowestMs) slowestMs = latency;
      latencySum += latency;
      latencyCount++;
    }
  }

  if (latencyCount === 0) {
    return { fastestMs: null, avgMs: null, slowestMs: null };
  }

  const avgMs = Math.round(latencySum / latencyCount);

  return { fastestMs, avgMs, slowestMs };
}

export function MonitorCard({
  monitor,
  ratingLevel,
  onSelect,
  onDayClick,
  timeZone,
}: MonitorCardProps) {
  const { locale, t } = useI18n();
  const uptime30d = monitor.uptime_30d;
  const checkedAt = monitor.last_checked_at
    ? timeZone
      ? formatTime(monitor.last_checked_at, { timeZone, locale })
      : formatTime(monitor.last_checked_at, { locale })
    : t('monitor_card.never_checked');
  const heartbeatStrip = hasHomepageStrips(monitor) ? monitor.heartbeat_strip : undefined;
  const uptimeDayStrip = hasHomepageStrips(monitor) ? monitor.uptime_day_strip : undefined;
  const heartbeats = hasPublicTimeseries(monitor) ? monitor.heartbeats : undefined;
  const uptimeDays = hasPublicTimeseries(monitor) ? monitor.uptime_days : undefined;
  const latencyStats = useMemo(
    () => getHeartbeatLatencyStats(heartbeats, heartbeatStrip),
    [heartbeatStrip, heartbeats],
  );

  const [detailsOpen, setDetailsOpen] = useState(false);
  const detailsId = `public-monitor-details-${monitor.id}`;
  const statusTone = {
    up: 'text-status-up',
    down: 'text-status-down',
    maintenance: 'text-status-maintenance',
    paused: 'text-status-paused',
    unknown: 'text-ink-3',
  }[monitor.status];

  return (
    <article className="group/monitor min-w-0 border-b border-line-soft px-4 py-3.5 last:border-b-0 sm:px-5 sm:py-4">
      <div className="mb-2.5 flex min-w-0 items-center justify-between gap-3">
        <h3 className="min-w-0 flex-1 text-[13px] font-medium text-ink sm:text-[14px]">
          <button
            type="button"
            onClick={onSelect}
            className="flex max-w-full items-center gap-2 rounded text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 shrink-0 rounded-full ${
                {
                  up: 'bg-status-up',
                  down: 'bg-status-down',
                  maintenance: 'bg-status-maintenance',
                  paused: 'bg-status-paused',
                  unknown: 'bg-status-unknown',
                }[monitor.status]
              }`}
            />
            <span className="truncate">{monitor.name}</span>
          </button>
        </h3>
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          <span
            className="hidden text-[11px] tabular-nums text-ink-3 sm:inline"
            title={t('monitor_card.uptime_title')}
          >
            {uptime30d ? formatPct(uptime30d.uptime_pct) : '—'}
          </span>
          <span className={`max-w-[105px] truncate text-[12px] font-medium ${statusTone}`}>
            {statusLabel(monitor.status, t)}
          </span>
          <button
            type="button"
            onClick={() => setDetailsOpen((current) => !current)}
            aria-label={t('incident_detail.details')}
            aria-expanded={detailsOpen}
            aria-controls={detailsOpen ? detailsId : undefined}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              strokeLinecap="round"
            >
              <path d="M4.5 10h11" />
              <path d="M10 4.5v11" className={detailsOpen ? 'opacity-0' : undefined} />
            </svg>
          </button>
        </div>
      </div>

      <UptimeBar30d
        variant="block"
        days={uptimeDays}
        strip={uptimeDayStrip}
        ratingLevel={ratingLevel}
        maxBars={AVAILABILITY_BARS}
        timeZone={timeZone}
        onDayClick={onDayClick}
        fillMode="pad"
        blockClassName="h-[19px] sm:h-[20px]"
      />

      {detailsOpen && (
        <div
          id={detailsId}
          className="mt-3 space-y-3 rounded-lg border border-line-soft bg-surface-2 px-3 py-3 text-sm sm:px-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
            <div className="flex flex-wrap items-center gap-2">
              <span>{statusLabel(monitor.status, t)}</span>
              <span className="uppercase">{monitor.type}</span>
              <span className="tabular-nums sm:hidden">
                {uptime30d ? formatPct(uptime30d.uptime_pct) : '—'}
              </span>
              {monitor.is_stale && (
                <span className="text-status-paused">{t('monitor_card.stale')}</span>
              )}
            </div>
            <span>
              {monitor.last_checked_at
                ? t('common.last_updated', { value: checkedAt })
                : t('monitor_card.never_checked')}
            </span>
          </div>
          {monitor.display_url && (
            <a
              href={monitor.display_url}
              target="_blank"
              rel="noreferrer"
              className="block break-all text-ink-2 underline decoration-line underline-offset-4 hover:text-ink"
            >
              {monitor.display_url}
            </a>
          )}
          <div>
            <p className="mb-2 text-xs text-ink-3">
              {t('monitor_card.last_checks', { count: HEARTBEAT_BARS })}
            </p>
            <HeartbeatBar
              heartbeats={heartbeats}
              strip={heartbeatStrip}
              maxBars={HEARTBEAT_BARS}
              density="compact"
              bare
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line-soft pt-3">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-xs tabular-nums text-ink-2">
              <span>
                {t('monitor_card.fast')} {formatLatency(latencyStats.fastestMs)}
              </span>
              <span>
                {t('monitor_card.avg')} {formatLatency(latencyStats.avgMs)}
              </span>
              <span>
                {t('monitor_card.slow')} {formatLatency(latencyStats.slowestMs)}
              </span>
            </div>
            <button
              type="button"
              onClick={onSelect}
              className="rounded text-xs font-medium text-ink underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              {t('monitor_detail.response_times')}
            </button>
          </div>
        </div>
      )}
    </article>
  );
}

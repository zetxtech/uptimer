import { useMemo } from 'react';

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
const AVAILABILITY_BARS = 60;
const MOBILE_AVAILABILITY_BARS = 30;

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

  return (
    <article className="min-w-0 border-b border-line-soft py-5 last:border-b-0 sm:py-6">
      <div className="mb-3 flex items-center justify-between gap-4">
        <h3 className="min-w-0 text-[14px] font-semibold text-ink">
          <button
            type="button"
            onClick={onSelect}
            className="flex max-w-full items-center gap-2 rounded text-left hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
          >
            <span
              aria-hidden="true"
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${
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
            <span className="sr-only">{statusLabel(monitor.status, t)}</span>
          </button>
        </h3>
        <span
          className="shrink-0 text-sm tabular-nums text-ink-2"
          title={t('monitor_card.uptime_title')}
        >
          {uptime30d ? formatPct(uptime30d.uptime_pct) : '—'}
        </span>
      </div>

      <div className="min-w-0">
        <UptimeBar30d
          variant="block"
          days={uptimeDays}
          strip={uptimeDayStrip}
          ratingLevel={ratingLevel}
          maxBars={AVAILABILITY_BARS}
          timeZone={timeZone}
          onDayClick={onDayClick}
          fillMode="pad"
          blockClassName="h-[19px] sm:h-[20px] [&_button:focus-visible]:relative [&_button:focus-visible]:z-10 [&_button:focus-visible]:ring-2 [&_button:focus-visible]:ring-ink [&_button:focus-visible]:ring-offset-2 [&_button:focus-visible]:ring-offset-surface"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-ink-3">
          <span className="sm:hidden">
            {t('monitor_card.range_start', { count: MOBILE_AVAILABILITY_BARS })}
          </span>
          <span className="hidden sm:inline">
            {t('monitor_card.range_start', { count: AVAILABILITY_BARS })}
          </span>
          <span>{t('monitor_card.range_end')}</span>
        </div>
      </div>

      <details className="group mt-3 text-sm">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1 rounded text-xs text-ink-3 hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink [&::-webkit-details-marker]:hidden">
          {t('incident_detail.details')}
          <svg
            aria-hidden="true"
            className="h-3 w-3 transition-transform group-open:rotate-180"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
          >
            <path d="m4 6 4 4 4-4" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </summary>
        <div className="mt-4 space-y-4 rounded-lg bg-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
            <div className="flex flex-wrap items-center gap-2">
              <span>{statusLabel(monitor.status, t)}</span>
              <span className="uppercase">{monitor.type}</span>
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
          <div className="flex flex-wrap items-center justify-between gap-3">
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
      </details>
    </article>
  );
}

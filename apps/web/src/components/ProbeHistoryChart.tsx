import { useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import type { ProbeHistoryResponse } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { formatDateTime } from '../utils/datetime';

/** Reference palette: primary, amber, green, violet, blue, red, cyan. */
const COLORS = ['#5b63d3', '#dd9c51', '#00af79', '#a579e9', '#4bb9e8', '#e0687d', '#55bfc1'];

export function ProbeHistoryChart({
  history,
  timeZone,
}: {
  history: ProbeHistoryResponse;
  timeZone: string;
}) {
  const { t, locale } = useI18n();
  const [hidden, setHidden] = useState<string[]>([]);
  const [metric, setMetric] = useState<'latency' | 'availability'>('latency');
  const axisColor = 'var(--color-text-secondary)';

  if (history.probes.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-2">{t('probes.history_empty')}</p>;
  }

  const times = new Map<number, Record<string, number | null>>();
  const start = Math.floor(history.start / history.bucket_seconds) * history.bucket_seconds;
  for (let time = start; time <= history.end; time += history.bucket_seconds) {
    times.set(time, { time });
  }
  history.probes.forEach((probe, index) => {
    for (const point of probe.points) {
      const row = times.get(point.checked_at);
      if (row) {
        const knownChecks = point.checks_up + point.checks_down;
        row[`probe_${index}`] =
          metric === 'latency'
            ? point.avg_latency_ms
            : knownChecks > 0
              ? Math.round((point.checks_up / knownChecks) * 1000) / 10
              : null;
      }
    }
  });
  const data = [...times.values()];
  const hasLatency = history.probes.some(
    (probe) =>
      !hidden.includes(probe.probe_id) &&
      probe.points.some((point) =>
        metric === 'latency'
          ? point.avg_latency_ms !== null
          : point.checks_up + point.checks_down > 0,
      ),
  );
  const formatTick = (timestamp: number) =>
    new Intl.DateTimeFormat(locale, {
      timeZone,
      ...(history.range === '24h'
        ? { hour: '2-digit', minute: '2-digit' }
        : { month: 'short', day: 'numeric' }),
    }).format(new Date(timestamp * 1000));

  return (
    <div className="space-y-4">
      {history.truncated && (
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {t('probes.history_truncated')}
        </p>
      )}
      <div
        className="inline-flex rounded-md border border-line p-1 dark:border-line"
        role="group"
        aria-label={t('probes.history_title')}
      >
        {(['latency', 'availability'] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={metric === option}
            onClick={() => setMetric(option)}
            className={
              metric === option
                ? 'rounded px-3 py-1 text-sm bg-surface text-white dark:bg-surface-2 dark:text-ink'
                : 'rounded px-3 py-1 text-sm text-ink-2'
            }
          >
            {option === 'latency' ? t('probes.history_avg') : t('probes.history_availability')}
          </button>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <thead className="text-left text-xs text-ink-2 dark:text-ink-3">
            <tr>
              <th className="py-2 pr-4">{t('probes.title')}</th>
              <th className="py-2 pr-4">{t('probes.history_up')}</th>
              <th className="py-2 pr-4">{t('probes.history_down')}</th>
              <th className="py-2">{t('probes.history_unknown')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {history.probes.map((probe, index) => {
              const counts = probe.points.reduce(
                (total, point) => ({
                  up: total.up + point.checks_up,
                  down: total.down + point.checks_down,
                  unknown: total.unknown + point.checks_unknown,
                }),
                { up: 0, down: 0, unknown: 0 },
              );
              return (
                <tr key={probe.probe_id}>
                  <td className="py-2 pr-4">
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={!hidden.includes(probe.probe_id)}
                        onChange={(event) =>
                          setHidden((previous) =>
                            event.target.checked
                              ? previous.filter((id) => id !== probe.probe_id)
                              : [...previous, probe.probe_id],
                          )
                        }
                      />
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span>
                        {probe.name}
                        {probe.region ? ` · ${probe.region}` : ''}
                      </span>
                    </label>
                  </td>
                  <td className="py-2 pr-4 tabular-nums">{counts.up}</td>
                  <td className="py-2 pr-4 tabular-nums">{counts.down}</td>
                  <td className="py-2 tabular-nums">{counts.unknown}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {hasLatency ? (
        <ResponsiveContainer width="100%" height={240}>
          <LineChart
            data={data}
            margin={{ top: 8, right: 12, bottom: 4, left: 0 }}
            accessibilityLayer
          >
            <XAxis
              dataKey="time"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickFormatter={formatTick}
              tick={{ fontSize: 12, fill: axisColor }}
              stroke={axisColor}
            />
            <YAxis
              width={55}
              domain={metric === 'availability' ? [0, 100] : [0, 'auto']}
              tick={{ fontSize: 12, fill: axisColor }}
              stroke={axisColor}
              tickFormatter={(value) => `${value}${metric === 'latency' ? 'ms' : '%'}`}
            />
            <Tooltip
              labelFormatter={(value) => formatDateTime(Number(value), timeZone, locale)}
              formatter={(value: number, name: string) => [
                `${value}${metric === 'latency' ? 'ms' : '%'}`,
                name,
              ]}
              contentStyle={{
                backgroundColor: 'var(--color-card)',
                borderColor: 'var(--color-border)',
                borderRadius: '0.5rem',
                color: 'var(--color-text-primary)',
              }}
            />
            {history.probes.map((probe, index) => (
              <Line
                key={probe.probe_id}
                name={`${probe.name}${probe.region ? ` · ${probe.region}` : ''}`}
                dataKey={`probe_${index}`}
                stroke={COLORS[index % COLORS.length]}
                strokeWidth={2}
                dot={probe.points.length <= 48 ? { r: 3 } : false}
                connectNulls={false}
                hide={hidden.includes(probe.probe_id)}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <p className="flex h-[240px] items-center justify-center text-sm text-ink-2">
          {metric === 'latency' ? t('common.no_latency_data') : t('common.no_data')}
        </p>
      )}
    </div>
  );
}

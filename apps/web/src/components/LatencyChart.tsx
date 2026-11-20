import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { LatencyPoint } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { suggestLatencyAxisCeiling } from '../utils/latencyScale';

interface LatencyChartProps {
  points: LatencyPoint[];
  height?: number;
}

function formatTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function LatencyChart({ points, height = 200 }: LatencyChartProps) {
  const { t } = useI18n();

  const rawData = points
    .filter((p) => p.status === 'up' && p.latency_ms !== null)
    .map((p) => ({
      time: p.checked_at,
      latency: p.latency_ms as number,
    }));
  const axisCeiling = suggestLatencyAxisCeiling(rawData.map((point) => point.latency));
  const data = rawData.map((point) => ({
    ...point,
    latency_plot: axisCeiling !== null && point.latency > axisCeiling ? null : point.latency,
  }));
  const yAxisDomainProps =
    axisCeiling === null
      ? {}
      : { domain: [0, axisCeiling] as [number, number], allowDataOverflow: true };

  if (rawData.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-ink-2 dark:text-ink-3"
        style={{ height }}
      >
        {t('common.no_latency_data')}
      </div>
    );
  }

  const axisColor = 'var(--color-text-secondary)';
  const lineColor = 'var(--color-up)';

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
        <XAxis
          dataKey="time"
          tickFormatter={formatTime}
          tick={{ fontSize: 12, fill: axisColor }}
          stroke={axisColor}
        />
        <YAxis
          tick={{ fontSize: 12, fill: axisColor }}
          stroke={axisColor}
          {...yAxisDomainProps}
          tickFormatter={(v) => `${v}ms`}
        />
        <Tooltip
          labelFormatter={(v) => new Date(Number(v) * 1000).toLocaleString()}
          formatter={(_value: number, _name, item: unknown) => {
            const rawLatency = (item as { payload?: { latency?: number } }).payload?.latency;
            return [
              typeof rawLatency === 'number' ? `${rawLatency}ms` : '-',
              t('admin_analytics.latency'),
            ];
          }}
          contentStyle={{
            backgroundColor: 'var(--color-card)',
            borderColor: 'var(--color-border)',
            borderRadius: '0.5rem',
            color: 'var(--color-text-primary)',
          }}
        />
        <Line
          type="monotone"
          dataKey="latency_plot"
          stroke={lineColor}
          strokeWidth={2}
          dot={false}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

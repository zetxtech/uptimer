import type { ReactNode } from 'react';

import { cn } from './ui';

type Tone = 'success' | 'danger' | 'warning';

const TONE_CLASS: Record<Tone | 'default', string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  danger: 'text-red-600 dark:text-red-400',
  warning: 'text-amber-600 dark:text-amber-400',
  default: 'text-ink',
};

/** Tinted icon chip mirrors the value tone so state reads before the number does. */
const CHIP_CLASS: Record<Tone | 'default', string> = {
  success:
    'bg-emerald-50 text-emerald-600 ring-emerald-500/15 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
  danger:
    'bg-red-50 text-red-600 ring-red-500/15 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20',
  warning:
    'bg-amber-50 text-amber-600 ring-amber-500/15 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
  default: 'bg-surface-2 text-ink-3 ring-line dark:bg-surface-2 dark:text-ink-2 dark:ring-line',
};

/** One cell of the KPI strip: hairline gap separators come from the parent grid. */
export function KpiCell({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: string;
  tone?: Tone | undefined;
  /** 24x24 svg path drawn inside the leading icon chip. */
  icon?: string | undefined;
}) {
  const resolvedTone = tone ?? 'default';

  return (
    <div className="flex h-full flex-col justify-between gap-1.5 bg-surface px-3 py-2.5 sm:px-5 sm:py-3 dark:bg-surface">
      <div className="flex items-start justify-between gap-2">
        <div className="ui-metric-label min-w-0 leading-tight">{label}</div>
        {icon ? (
          <span
            aria-hidden
            className={cn(
              'grid h-7 w-7 shrink-0 place-items-center rounded-lg ring-1 ring-inset',
              CHIP_CLASS[resolvedTone],
            )}
          >
            <svg
              className="h-[15px] w-[15px]"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d={icon} />
            </svg>
          </span>
        ) : null}
      </div>
      <div
        className={cn(
          'text-[21px] font-semibold leading-none tabular-nums tracking-[-0.02em]',
          TONE_CLASS[resolvedTone],
        )}
      >
        {value}
      </div>
    </div>
  );
}

/** Metrics strip container: cells are separated by the gap colour. */
export function KpiStrip({
  children,
  className,
}: {
  children: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className="ui-panel overflow-hidden">
      <div className={cn('grid gap-px bg-surface-2', className)}>{children}</div>
    </div>
  );
}

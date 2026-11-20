import type { ReactNode } from 'react';

import { cn } from './ui';

interface SectionHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Right-aligned region, usually the primary action for the section. */
  actions?: ReactNode;
  /** `page` for the tab-level heading, `panel` for a card heading. */
  size?: 'page' | 'panel';
  className?: string;
}

/** Page or panel level heading: one line of text, one line of controls. */
export function SectionHeader({
  title,
  description,
  actions,
  size = 'panel',
  className,
}: SectionHeaderProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4',
        className,
      )}
    >
      <div className="min-w-0">
        {size === 'page' ? (
          <h1 className="ui-page-title truncate">{title}</h1>
        ) : (
          <h2 className="text-[16px] font-semibold leading-tight tracking-[-0.01em] text-ink">
            {title}
          </h2>
        )}
        {description ? (
          <p
            className={cn(
              'leading-snug text-ink-2 dark:text-ink-3',
              size === 'page' ? 'mt-1 text-[13px]' : 'mt-0.5 text-[12px]',
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

interface SettingsGroupProps {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}

/** A settings section with its introduction beside an independent form panel. */
export function SettingsGroup({ title, description, children, className }: SettingsGroupProps) {
  return (
    <section
      className={cn(
        'grid min-w-0 gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:gap-20',
        className,
      )}
    >
      <div className="ml-4 min-w-0 xl:ml-0">
        <h2 className="text-[16px] font-semibold leading-6 text-ink">{title}</h2>
        {description ? (
          <p className="mt-3 text-[14px] leading-[21.7px] text-ink-2">{description}</p>
        ) : null}
      </div>
      <div className="ui-panel min-w-0 divide-y divide-line-soft !rounded-[12px] p-6 !shadow-none [&>:first-child]:pt-0 [&>:last-child]:pb-0">
        {children}
      </div>
    </section>
  );
}

interface SettingsRowProps {
  label: ReactNode;
  help?: ReactNode;
  /** Control rendered in the fixed-width slot on the right. */
  control: ReactNode;
  /** Width of the control slot, e.g. `w-24` for numbers or `w-40` for selects. */
  controlWidth?: string;
  className?: string;
}

/** One label/help pair on the left, its control on the right, baseline-aligned. */
export function SettingsRow({
  label,
  help,
  control,
  controlWidth = 'w-24',
  className,
}: SettingsRowProps) {
  return (
    <div className={cn('flex items-center justify-between gap-4 py-4', className)}>
      <div className="min-w-0">
        <p className="text-[12px] font-medium leading-4 text-ink-2">{label}</p>
        {help ? <p className="mt-2 text-[13px] leading-[18px] text-ink-2">{help}</p> : null}
      </div>
      <div className={cn('shrink-0', controlWidth)}>{control}</div>
    </div>
  );
}

interface EmptyStateProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: 'inbox' | 'bell' | 'alert' | 'wrench' | 'pulse';
  className?: string;
}

const ICON_PATHS: Record<NonNullable<EmptyStateProps['icon']>, string> = {
  inbox: 'M4 13h4l2 3h4l2-3h4M4 13l2-7h12l2 7v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5z',
  bell: 'M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2a2 2 0 01-.6 1.4L4 17h5m6 0a3 3 0 11-6 0',
  alert:
    'M12 9v4m0 4h.01M10.3 3.9L2.4 17a2 2 0 001.7 3h15.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z',
  wrench: 'M14.7 6.3a4 4 0 105.3 5.3l-2.2-2.2 2.2-3.1a4 4 0 00-5.3 0zM12.5 9.5L3 19l2 2 9.5-9.5',
  pulse: 'M3 12h4l2-6 3 12 2-6h7',
};

export function EmptyState({
  title,
  description,
  action,
  icon = 'inbox',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-10 text-center md:py-20',
        className,
      )}
    >
      <span className="grid h-9 w-9 place-items-center rounded-full bg-surface-2 text-ink-3">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d={ICON_PATHS[icon]} />
        </svg>
      </span>
      <p className="mt-4 text-[16px] font-semibold leading-6 text-ink">{title}</p>
      {description ? (
        <p className="mt-3 max-w-[295px] text-[14px] leading-[21.7px] text-ink-2">{description}</p>
      ) : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div> : null}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../app/I18nContext';
import { cn } from './ui';

export type MonitorSortMode =
  | 'configured'
  | 'name'
  | 'created_at'
  | 'updated_at'
  | 'interval_sec'
  | 'status'
  | 'last_status_change_at';

export type MonitorSortDirection = 'asc' | 'desc';

interface MonitorSortControlProps {
  mode: MonitorSortMode;
  direction: MonitorSortDirection;
  onModeChange: (mode: MonitorSortMode) => void;
  onDirectionChange: (direction: MonitorSortDirection) => void;
  className?: string;
}

/**
 * Sort control from the reference group header. It owns its own popover state so that every place it
 * is mounted (group headers, the flat-view toolbar) opens exactly one menu.
 */
export function MonitorSortControl({
  mode,
  direction,
  onModeChange,
  onDirectionChange,
  className,
}: MonitorSortControlProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (target && ref.current?.contains(target)) return;
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const modes: Array<[MonitorSortMode, string]> = [
    ['configured', t('admin_dashboard.monitor_sort_mode_configured')],
    ['name', t('common.name')],
    ['created_at', t('admin_dashboard.monitor_sort_mode_created_time')],
    ['updated_at', t('admin_dashboard.monitor_sort_mode_updated_time')],
    ['interval_sec', t('admin_dashboard.monitor_sort_mode_frequency')],
    ['status', t('common.state')],
    ['last_status_change_at', t('admin_dashboard.monitor_sort_mode_last_incident')],
  ];
  const directions: Array<[MonitorSortDirection, string, string]> = [
    ['asc', t('common.asc'), 'M12 19V5m0 0-5 5m5-5 5 5'],
    ['desc', t('common.desc'), 'M12 5v14m0 0 5-5m-5 5-5-5'],
  ];

  return (
    <div className={cn('relative', className)} ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('common.sort')}
        title={t('common.sort')}
        onClick={() => setOpen((previous) => !previous)}
        className="ui-icon-btn"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25"
          />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="animate-fade-in ui-sort-menu">
          {modes.map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === value}
              onClick={() => {
                onModeChange(value);
                setOpen(false);
              }}
              className="ui-sort-menu-item"
              data-active={mode === value}
            >
              <span className="ui-sort-menu-dot" aria-hidden />
              <span className="truncate">{label}</span>
            </button>
          ))}
          <div className="ui-sort-menu-divider" />
          {directions.map(([value, label, icon]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={direction === value}
              onClick={() => {
                onDirectionChange(value);
                setOpen(false);
              }}
              className="ui-sort-menu-item"
              data-active={direction === value}
            >
              <svg
                className="h-3.5 w-3.5 shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
              </svg>
              <span className="truncate">{label}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

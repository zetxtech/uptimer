import { useEffect, useRef, useState } from 'react';

import { useI18n } from '../app/I18nContext';

export type IncidentSortMode = 'default' | 'title' | 'started_at' | 'length';
export type IncidentSortDirection = 'asc' | 'desc';

export function IncidentSortControl({
  mode,
  direction,
  onModeChange,
  onDirectionChange,
}: {
  mode: IncidentSortMode;
  direction: IncidentSortDirection;
  onModeChange: (mode: IncidentSortMode) => void;
  onDirectionChange: (direction: IncidentSortDirection) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const sortOptions: Array<{ value: Exclude<IncidentSortMode, 'default'>; label: string }> = [
    { value: 'title', label: t('common.name') },
    { value: 'started_at', label: t('admin_dashboard.incident_sort_started_at') },
    { value: 'length', label: t('admin_dashboard.incident_col_length') },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('admin_dashboard.incident_sort')}
        title={t('admin_dashboard.incident_sort')}
        onClick={() => setOpen((previous) => !previous)}
        className="ui-icon-btn h-[26px] w-[26px] rounded-md text-ink-3 hover:bg-surface-2"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.6}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M7 12h10m-7 6h4" />
        </svg>
      </button>
      {open ? (
        <div role="menu" className="ui-sort-menu">
          {sortOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={mode === option.value}
              data-active={mode === option.value}
              onClick={() => {
                onModeChange(option.value);
                setOpen(false);
              }}
              className="ui-sort-menu-item"
            >
              <span className="ui-sort-menu-dot" aria-hidden />
              {option.label}
            </button>
          ))}
          <div role="separator" className="ui-sort-menu-divider" />
          {(
            [
              ['asc', t('admin_dashboard.incident_sort_ascending')],
              ['desc', t('admin_dashboard.incident_sort_descending')],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="menuitemradio"
              aria-checked={direction === value}
              data-active={direction === value}
              onClick={() => {
                onDirectionChange(value);
                setOpen(false);
              }}
              className="ui-sort-menu-item"
            >
              <span className="ui-sort-menu-dot" aria-hidden />
              {label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

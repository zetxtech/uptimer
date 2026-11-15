import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../app/I18nContext';
import { cn } from './ui';

const POPUP_GAP = 6;
const VIEWPORT_MARGIN = 8;
const PANEL_WIDTH = 280;

interface DateFieldProps {
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
  className?: string;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseIso(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday-first grid covering the month of `cursor`, six weeks so the panel never jumps. */
function buildGrid(cursor: Date): Date[] {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = new Date(first);
  start.setDate(first.getDate() - offset);
  return Array.from({ length: 42 }, (_, i) => {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    return day;
  });
}

/**
 * App-styled date field: a 36 px trigger with a calendar icon and a portal calendar panel, replacing
 * the browser's native `<input type="date">` popup, which cannot be styled.
 */
export function DateField({ value, onChange, className, ...aria }: DateFieldProps) {
  const { locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const selected = parseIso(value);
  const [cursor, setCursor] = useState<Date>(() => parseIso(value) ?? new Date());
  const today = useMemo(() => toIso(new Date()), []);

  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
        new Date(cursor.getFullYear(), cursor.getMonth(), 1),
      ),
    [cursor, locale],
  );

  const weekdays = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    // 2024-01-01 is a Monday, so the labels line up with the Monday-first grid.
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
  }, [locale]);

  const valueLabel = useMemo(
    () =>
      selected
        ? new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).format(selected)
        : '',
    [locale, selected],
  );

  const measure = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom - POPUP_GAP - VIEWPORT_MARGIN;
    const spaceAbove = box.top - POPUP_GAP - VIEWPORT_MARGIN;
    const height = 320;
    const placeBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    const rawTop = placeBelow ? box.bottom + POPUP_GAP : box.top - POPUP_GAP - height;
    setRect({
      top: Math.min(
        Math.max(rawTop, VIEWPORT_MARGIN),
        Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
      ),
      left: Math.min(
        Math.max(box.left, VIEWPORT_MARGIN),
        Math.max(VIEWPORT_MARGIN, window.innerWidth - PANEL_WIDTH - VIEWPORT_MARGIN),
      ),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [measure, open]);

  useLayoutEffect(() => {
    if (!open || !rect) return;
    const panel = panelRef.current;
    if (!panel) return;
    // Re-anchor with the real height so the panel hugs the trigger instead of floating away from it.
    const height = panel.offsetHeight;
    const trigger = triggerRef.current;
    if (!trigger) return;
    const box = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - box.bottom - POPUP_GAP - VIEWPORT_MARGIN;
    const spaceAbove = box.top - POPUP_GAP - VIEWPORT_MARGIN;
    const placeBelow = spaceBelow >= height || spaceBelow >= spaceAbove;
    const rawTop = placeBelow ? box.bottom + POPUP_GAP : box.top - POPUP_GAP - height;
    const top = Math.min(
      Math.max(rawTop, VIEWPORT_MARGIN),
      Math.max(VIEWPORT_MARGIN, window.innerHeight - height - VIEWPORT_MARGIN),
    );
    if (Math.abs(top - rect.top) > 1) setRect((prev) => (prev ? { ...prev, top } : prev));
  }, [open, rect]);

  useLayoutEffect(() => {
    if (!open) return;
    if (selected) setCursor(selected);

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onScroll = (event: Event) => {
      const target = event.target as Node | null;
      if (target && panelRef.current?.contains(target)) return;
      setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
    // `selected` only seeds the visible month when the panel opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const days = useMemo(() => buildGrid(cursor), [cursor]);
  const month = cursor.getMonth();

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn('ui-date-field', className)}
        {...aria}
      >
        <svg
          className="ui-date-field-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 3v3m8-3v3M4 9h16M5 5h14a1 1 0 011 1v13a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z"
          />
        </svg>
        <span className={cn('ui-date-field-value', !valueLabel && 'text-ink-3')}>
          {valueLabel || '—'}
        </span>
      </button>

      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={aria['aria-label']}
              className="ui-calendar"
              style={{ top: rect.top, left: rect.left, width: PANEL_WIDTH }}
            >
              <div className="ui-calendar-head">
                <button
                  type="button"
                  className="ui-calendar-nav"
                  aria-label="−1"
                  onClick={() =>
                    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.9}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" />
                  </svg>
                </button>
                <span className="ui-calendar-month">{monthLabel}</span>
                <button
                  type="button"
                  className="ui-calendar-nav"
                  aria-label="+1"
                  onClick={() =>
                    setCursor((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
                  }
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.9}
                    aria-hidden
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>

              <div className="ui-calendar-weekdays">
                {weekdays.map((label) => (
                  <span key={label}>{label}</span>
                ))}
              </div>

              <div className="ui-calendar-grid">
                {days.map((day) => {
                  const iso = toIso(day);
                  const outside = day.getMonth() !== month;
                  const isSelected = selected !== null && iso === value;
                  const isToday = iso === today;
                  return (
                    <button
                      key={iso}
                      type="button"
                      aria-current={isToday ? 'date' : undefined}
                      aria-pressed={isSelected}
                      className={cn(
                        'ui-calendar-day',
                        outside && 'is-outside',
                        isToday && 'is-today',
                        isSelected && 'is-selected',
                      )}
                      onClick={() => {
                        onChange(iso);
                        setOpen(false);
                      }}
                    >
                      {day.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

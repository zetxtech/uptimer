import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';

import { useI18n } from '../app/I18nContext';
import { useTheme } from '../app/ThemeContext';

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}

export const PANEL_BASE_CLASS = 'ui-panel rounded-xl border border-line';

export const PANEL_INTERACTIVE_CLASS = 'ui-panel-hover hover:border-line';

export const TABLE_ACTION_BUTTON_CLASS =
  'inline-flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-none';

export const MODAL_OVERLAY_CLASS = 'ui-modal-overlay animate-fade-in';

export const MODAL_PANEL_CLASS = 'ui-modal-panel animate-slide-up';

export const INPUT_CLASS = cn('ui-input', 'text-base', 'border-line', 'placeholder:text-ink-3');

export const SELECT_CLASS = cn('ui-select', 'text-base', 'border-line');

export const TEXTAREA_CLASS = cn(
  'ui-textarea',
  'text-base',
  'border-line',
  'placeholder:text-ink-3',
);

export const FIELD_LABEL_CLASS = 'ui-label';

export const FIELD_HELP_CLASS = 'ui-help';

interface BadgeProps {
  variant: 'up' | 'down' | 'maintenance' | 'paused' | 'unknown' | 'info';
  children: ReactNode;
  size?: 'sm' | 'md';
}

const badgeDot: Record<BadgeProps['variant'], string> = {
  up: 'bg-status-up',
  down: 'bg-status-down',
  maintenance: 'bg-status-maintenance',
  paused: 'bg-status-paused',
  unknown: 'bg-status-unknown',
  info: 'bg-status-unknown',
};

/** Neutral pill carrying a colored status dot, in the style of the reference status pages. */
export function Badge({ variant, children, size = 'sm' }: BadgeProps) {
  const sizeClass = size === 'sm' ? 'gap-1.5 px-2 py-0.5 text-xs' : 'gap-2 px-2.5 py-1 text-sm';
  const dotSize = size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2';

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full font-medium',
        'bg-surface-2 text-ink',
        sizeClass,
      )}
    >
      <span className={cn('rounded-full', dotSize, badgeDot[variant])} />
      {children}
    </span>
  );
}

interface StatusGlyphProps {
  status: 'up' | 'down' | 'maintenance' | 'paused' | 'unknown';
  className?: string;
}

const glyphPaths: Record<StatusGlyphProps['status'], string> = {
  up: 'M9 12.5l2 2 4-4.5M12 21a9 9 0 100-18 9 9 0 000 18z',
  down: 'M15 9l-6 6m0-6l6 6M12 21a9 9 0 100-18 9 9 0 000 18z',
  maintenance: 'M12 8v4.5m0 3h.01M12 21a9 9 0 100-18 9 9 0 000 18z',
  paused: 'M10 9v6m4-6v6M12 21a9 9 0 100-18 9 9 0 000 18z',
  unknown: 'M12 16v.01M12 13a2.5 2.5 0 10-2.5-2.5M12 21a9 9 0 100-18 9 9 0 000 18z',
};

const glyphColors: Record<StatusGlyphProps['status'], string> = {
  up: 'text-status-up',
  down: 'text-status-down',
  maintenance: 'text-status-maintenance',
  paused: 'text-status-paused',
  unknown: 'text-status-unknown',
};

/** Status icon sized for a list row's leading slot. */
export function StatusGlyph({ status, className = 'h-[18px] w-[18px]' }: StatusGlyphProps) {
  return (
    <svg
      className={cn('shrink-0', className, glyphColors[status])}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={glyphPaths[status]} />
    </svg>
  );
}

interface StatusDotProps {
  status: 'up' | 'down' | 'maintenance' | 'paused' | 'unknown';
  pulse?: boolean;
  size?: 'sm' | 'md';
}

const dotColors = {
  up: 'bg-status-up',
  down: 'bg-status-down',
  maintenance: 'bg-status-maintenance',
  paused: 'bg-status-paused',
  unknown: 'bg-status-unknown',
};

export function StatusDot({ status, pulse = false, size = 'md' }: StatusDotProps) {
  const dotSize = size === 'sm' ? 'h-2 w-2' : 'h-2.5 w-2.5';

  return (
    <span className={cn('relative inline-flex', dotSize)}>
      {pulse && (
        <span
          className={cn(
            'absolute inline-flex h-full w-full animate-ping rounded-full opacity-75',
            dotColors[status],
          )}
        />
      )}
      <span
        className={cn(
          'relative inline-flex h-full w-full rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.6)] dark:shadow-none',
          dotColors[status],
        )}
      />
    </span>
  );
}

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
}

export function Card({ children, className = '', hover = false, onClick }: CardProps) {
  const clickProps = onClick
    ? {
        onClick,
        onKeyDown: (e: KeyboardEvent<HTMLDivElement>) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
            e.preventDefault();
            onClick();
          }
        },
        role: 'button',
        tabIndex: 0,
      }
    : {};

  return (
    <div
      className={cn(
        PANEL_BASE_CLASS,
        hover && PANEL_INTERACTIVE_CLASS,
        hover && onClick && 'cursor-pointer',
        'transition-base',
        className,
      )}
      {...clickProps}
    >
      {children}
    </div>
  );
}

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  type?: 'button' | 'submit' | 'reset';
}

const buttonVariants = {
  primary: 'ui-btn-primary shadow-[0_1px_2px_rgba(25,28,36,0.22)]',
  secondary: 'ui-btn-secondary',
  ghost: 'text-ink-2 hover:bg-surface-2 hover:text-ink',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-700 dark:bg-red-500 dark:hover:bg-red-600 shadow-[0_1px_2px_rgba(25,28,36,0.28)]',
};

const buttonSizes = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-9 px-3.5 text-sm',
  lg: 'h-10 px-3.5 text-sm',
};

/** Shimmer block for loading placeholders. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn('ui-skeleton rounded', className)} />;
}

/**
 * Loading placeholder shaped like the list it stands in for: rows reuse the page's own row grid, so
 * the layout is already in place when data arrives instead of the area sitting empty.
 */
export function SkeletonRows({
  rows = 4,
  rowClassName,
  cells,
  header,
  className,
}: {
  rows?: number;
  rowClassName: string;
  /** One entry per grid column, sized like the real column's content. */
  cells: string[];
  header?: ReactNode;
  className?: string;
}) {
  return (
    <div role="status" aria-busy className={className}>
      {header}
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className={rowClassName}>
          {cells.map((cell, column) => (
            <Skeleton key={column} className={cn('h-4', cell)} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-lg font-medium',
        'transition-colors duration-150 focus-visible:outline-none',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        buttonVariants[variant],
        buttonSizes[size],
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

export type ToastTone = 'success' | 'danger' | 'info';

const toastTones: Record<ToastTone, { badge: string; icon: ReactNode }> = {
  success: {
    badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />,
  },
  danger: {
    badge: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3.5h.01" />,
  },
  info: {
    badge: 'bg-surface-2 text-ink-2 dark:bg-surface-2 dark:text-ink',
    icon: <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v5m0 3.5h.01" />,
  },
};

interface ToastProps {
  tone?: ToastTone;
  title: ReactNode;
  children?: ReactNode;
  onClose: () => void;
  /** Auto-dismiss delay in milliseconds; omit to keep the toast until it is closed. */
  autoHideMs?: number;
  closeLabel?: string;
}

/** Transient feedback pinned to the viewport corner so it never shifts the page layout. */
export function Toast({
  tone = 'info',
  title,
  children,
  onClose,
  autoHideMs,
  closeLabel,
}: ToastProps) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    if (autoHideMs === undefined) return;
    const timer = window.setTimeout(() => onCloseRef.current(), autoHideMs);
    return () => window.clearTimeout(timer);
  }, [autoHideMs]);

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'animate-slide-up pointer-events-auto flex w-[min(23rem,calc(100vw-2rem))] items-start gap-3 rounded-xl',
        'border border-line bg-surface p-3.5 shadow-[0_16px_40px_-16px_rgba(25,28,36,0.28)]',
        'dark:border-line dark:bg-surface',
      )}
    >
      <span
        className={cn(
          'mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full',
          toastTones[tone].badge,
        )}
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          aria-hidden
        >
          {toastTones[tone].icon}
        </svg>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium leading-5 text-ink">{title}</div>
        {children}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={closeLabel}
        className="-mr-1 -mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink dark:hover:bg-surface-2 dark:hover:text-ink"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}

export function ToastStack({ children }: { children: ReactNode }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-end gap-2 p-4 sm:bottom-4 sm:left-auto sm:right-4 sm:p-0">
      {children}
    </div>
  );
}

export const PlusIcon = ({ className = 'h-4 w-4' }: { className?: string }) => (
  <svg
    className={className}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2.1}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden
  >
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const SunIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

const MoonIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
    />
  </svg>
);

const SystemIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { t } = useI18n();

  const cycleTheme = () => {
    if (theme === 'system') setTheme('light');
    else if (theme === 'light') setTheme('dark');
    else setTheme('system');
  };

  const themeLabel = t(`theme.${theme}`);
  const title = t('theme.title', { value: themeLabel });

  return (
    <button
      onClick={cycleTheme}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-lg',
        'text-ink-2 hover:bg-surface-2 hover:text-ink',
        'dark:text-ink-3 dark:hover:bg-surface dark:hover:text-ink',
        'transition-colors',
      )}
      title={title}
      aria-label={title}
    >
      {theme === 'light' && <SunIcon />}
      {theme === 'dark' && <MoonIcon />}
      {theme === 'system' && <SystemIcon />}
    </button>
  );
}

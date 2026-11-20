export type TimeZone = string;
export type Locale = string;

export function getBrowserTimeZone(): TimeZone | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone?.trim();
    return tz ? tz : undefined;
  } catch {
    return undefined;
  }
}

function resolveLocale(locale?: Locale): Locale | undefined {
  if (locale && locale.trim().length > 0) return locale;
  if (typeof document === 'undefined') return undefined;
  const docLocale = document.documentElement.lang?.trim();
  return docLocale ? docLocale : undefined;
}

function safeDate(tsSec: number): Date | null {
  if (!Number.isFinite(tsSec)) return null;
  const d = new Date(tsSec * 1000);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export function formatDateTime(tsSec: number, timeZone?: TimeZone, locale?: Locale): string {
  const d = safeDate(tsSec);
  if (!d) return '';
  const resolvedLocale = resolveLocale(locale);

  try {
    return d.toLocaleString(resolvedLocale, timeZone ? { timeZone } : undefined);
  } catch {
    // Invalid/unsupported timeZone in this runtime; fall back to local.
    return d.toLocaleString(resolvedLocale);
  }
}

export function formatDate(tsSec: number, timeZone?: TimeZone, locale?: Locale): string {
  const d = safeDate(tsSec);
  if (!d) return '';
  const resolvedLocale = resolveLocale(locale);

  try {
    return d.toLocaleDateString(resolvedLocale, timeZone ? { timeZone } : undefined);
  } catch {
    return d.toLocaleDateString(resolvedLocale);
  }
}

export function formatTime(
  tsSec: number,
  opts: { timeZone?: TimeZone; hour12?: boolean; locale?: Locale } = {},
): string {
  const d = safeDate(tsSec);
  if (!d) return '';
  const resolvedLocale = resolveLocale(opts.locale);

  try {
    return d.toLocaleTimeString(resolvedLocale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: opts.hour12,
      ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
    });
  } catch {
    return d.toLocaleTimeString(resolvedLocale, {
      hour: '2-digit',
      minute: '2-digit',
      hour12: opts.hour12,
    });
  }
}

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; seconds: number }> = [
  { unit: 'day', seconds: 86_400 },
  { unit: 'hour', seconds: 3_600 },
  { unit: 'minute', seconds: 60 },
  { unit: 'second', seconds: 1 },
];

export function formatRelativeTime(
  tsSec: number,
  locale?: Locale,
  nowSec = Date.now() / 1000,
): string {
  if (!Number.isFinite(tsSec)) return '';
  const deltaSec = Math.round(tsSec - nowSec);
  const absSec = Math.abs(deltaSec);

  const resolvedLocale = resolveLocale(locale);
  const formatter = (() => {
    try {
      return new Intl.RelativeTimeFormat(resolvedLocale, { numeric: 'auto' });
    } catch {
      return new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
    }
  })();

  if (absSec < 10) return formatter.format(0, 'second');

  for (const { unit, seconds } of RELATIVE_UNITS) {
    if (absSec >= seconds) return formatter.format(Math.round(deltaSec / seconds), unit);
  }
  return formatter.format(Math.round(deltaSec), 'second');
}

/** Compact elapsed time for incident and maintenance spans, e.g. `3h 12m`. */
export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '-';
  const total = Math.round(seconds);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 === 0 ? `${hours}h` : `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return hours % 24 === 0 ? `${days}d` : `${days}d ${hours % 24}h`;
}

/**
 * Spelled-out duration matching the reference monitor page:
 * `2 hours and 15 minutes` when `long`, `7 days 7 hours 10 mins` otherwise.
 */
export function formatProseDuration(seconds: number, locale: string, long = false): string {
  const total = Math.max(0, Math.floor(seconds));
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  const parts: string[] = [];

  if (locale.startsWith('zh')) {
    const zhTW = locale === 'zh-TW';
    if (days > 0) parts.push(`${days} 天`);
    if (hours > 0) parts.push(`${hours} ${zhTW ? '小時' : '小时'}`);
    if (minutes > 0 || parts.length === 0) parts.push(`${minutes} ${zhTW ? '分鐘' : '分钟'}`);
    return parts.join(' ');
  }

  if (days > 0) parts.push(`${days} ${days === 1 ? 'day' : 'days'}`);
  if (hours > 0) parts.push(`${hours} ${hours === 1 ? 'hour' : 'hours'}`);
  if (minutes > 0 || parts.length === 0) {
    parts.push(`${minutes} ${long ? 'minute' : 'min'}${minutes === 1 ? '' : 's'}`);
  }
  if (!long || parts.length < 2) return parts.join(' ');
  return parts.length === 2
    ? `${parts[0]} and ${parts[1]}`
    : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Fixed four-decimal percentage used by the reference availability table. */
export function formatPct4(value: number): string {
  return `${value.toFixed(4)}%`;
}

/** Reference incident header line, e.g. `Nov 9, 2026 at 9:46am GMT+8`. */
export function formatDateTimeHeading(tsSec: number, timeZone?: TimeZone, locale?: Locale): string {
  const d = safeDate(tsSec);
  if (!d) return '';
  const resolvedLocale = resolveLocale(locale);
  const zone = { ...(timeZone ? { timeZone } : {}) };
  try {
    const date = new Intl.DateTimeFormat(resolvedLocale, { ...zone, dateStyle: 'medium' }).format(
      d,
    );
    const time = new Intl.DateTimeFormat(resolvedLocale, {
      ...zone,
      timeStyle: 'short',
    }).format(d);
    const zoneName = new Intl.DateTimeFormat(resolvedLocale, { ...zone, timeZoneName: 'short' })
      .formatToParts(d)
      .find((part) => part.type === 'timeZoneName')?.value;
    const joiner = (resolvedLocale ?? '').startsWith('zh') ? ' ' : ' at ';
    return `${date}${joiner}${time}${zoneName ? ` ${zoneName}` : ''}`;
  } catch {
    return d.toLocaleString(resolvedLocale);
  }
}

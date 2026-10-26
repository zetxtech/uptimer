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

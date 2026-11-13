import { getBrowserTimeZone } from './datetime';

/** Curated fallback for runtimes without `Intl.supportedValuesOf('timeZone')`. */
const FALLBACK_TIMEZONES = [
  'UTC',
  'Asia/Shanghai',
  'Asia/Hong_Kong',
  'Asia/Taipei',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Asia/Seoul',
  'Asia/Bangkok',
  'Asia/Kolkata',
  'Australia/Sydney',
  'Australia/Perth',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Amsterdam',
  'Europe/Madrid',
  'Europe/Moscow',
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
  'America/Sao_Paulo',
];

let cachedTimezones: string[] | null = null;

/** IANA zone list for timezone pickers. */
export function listTimezones(): string[] {
  if (cachedTimezones) return cachedTimezones;

  const supported = (Intl as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf;
  if (typeof supported === 'function') {
    try {
      cachedTimezones = supported.call(Intl, 'timeZone');
      return cachedTimezones;
    } catch {
      // Fall through to the curated list.
    }
  }

  cachedTimezones = FALLBACK_TIMEZONES;
  return cachedTimezones;
}

export function isKnownTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** Zone to preselect when a monitor has no window yet. */
export function defaultTimezone(): string {
  return getBrowserTimeZone() ?? 'UTC';
}

/** "GMT+08:00" style offset label of a zone at `at`. */
export function formatGmtOffset(timeZone: string, at = Date.now()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'shortOffset',
    }).formatToParts(new Date(at));
    const value = parts.find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    const match = /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(value);
    if (!match) return value;
    const [, sign, hours, minutes] = match;
    return `GMT${sign}${hours?.padStart(2, '0')}:${minutes ?? '00'}`;
  } catch {
    return 'GMT';
  }
}

/** Wall clock time of a zone at `at`, as HH:MM. */
export function formatTimeInZone(timeZone: string, at = Date.now()): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(new Date(at));
  } catch {
    return '--:--';
  }
}

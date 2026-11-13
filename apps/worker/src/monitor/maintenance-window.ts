import { maintenanceWindowJsonSchema, type MaintenanceWindowJson } from '@uptimer/db';

/** en-US short weekday names are stable across ICU versions. */
const WEEKDAY_TO_ISO: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

/**
 * Local ISO weekday (1 = Monday … 7 = Sunday) and minute of day of `at` inside `timeZone`.
 * Returns null when the zone is unknown to the runtime.
 */
export function resolveZonedDayMinute(
  timeZone: string,
  at: number,
): { day: number; minute: number } | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(at * 1000));

    let day = 0;
    let hour = Number.NaN;
    let minute = Number.NaN;
    for (const part of parts) {
      if (part.type === 'weekday') {
        day = WEEKDAY_TO_ISO[part.value] ?? 0;
      } else if (part.type === 'hour') {
        hour = Number.parseInt(part.value, 10);
      } else if (part.type === 'minute') {
        minute = Number.parseInt(part.value, 10);
      }
    }

    if (!day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
    return { day, minute: hour * 60 + minute };
  } catch {
    return null;
  }
}

/**
 * Pure coverage test for a window and a zoned clock reading. `day` and `minute` describe the
 * monitor's timezone. A window whose end is not after its start wraps past midnight, and the
 * selected days then refer to the day the window starts.
 */
export function maintenanceWindowCovers(
  window: MaintenanceWindowJson,
  day: number,
  minute: number,
): boolean {
  const { start_minute: start, end_minute: end, days } = window;
  if (start === end) return false;
  if (start < end) {
    return days.includes(day) && minute >= start && minute < end;
  }

  const previousDay = day === 1 ? 7 : day - 1;
  return (days.includes(day) && minute >= start) || (days.includes(previousDay) && minute < end);
}

/**
 * Whether the stored recurring maintenance window of a monitor covers `at`. Unreadable JSON or
 * an unknown timezone never suppresses notifications.
 */
export function isMaintenanceWindowActive(windowJson: string, at: number): boolean {
  let parsed: unknown;
  try {
    parsed = JSON.parse(windowJson) as unknown;
  } catch {
    return false;
  }

  const result = maintenanceWindowJsonSchema.safeParse(parsed);
  if (!result.success) return false;

  const zoned = resolveZonedDayMinute(result.data.timezone, at);
  if (!zoned) return false;

  return maintenanceWindowCovers(result.data, zoned.day, zoned.minute);
}

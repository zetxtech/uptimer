import { describe, expect, it } from 'vitest';

import {
  isMaintenanceWindowActive,
  maintenanceWindowCovers,
  resolveZonedDayMinute,
} from '../src/monitor/maintenance-window';

// Wednesday 15 April 2026, 10:30 UTC (18:30 in Asia/Shanghai).
const AT = Math.floor(Date.UTC(2026, 3, 15, 10, 30) / 1000);

describe('resolveZonedDayMinute', () => {
  it('maps an instant onto the zone wall clock', () => {
    expect(resolveZonedDayMinute('UTC', AT)).toEqual({ day: 3, minute: 630 });
    expect(resolveZonedDayMinute('Asia/Shanghai', AT)).toEqual({ day: 3, minute: 1110 });
  });

  it('returns null for an unknown zone', () => {
    expect(resolveZonedDayMinute('Not/AZone', AT)).toBeNull();
  });
});

describe('maintenanceWindowCovers', () => {
  it('covers a same-day window only on the selected days', () => {
    const window = { start_minute: 540, end_minute: 1020, days: [3], timezone: 'UTC' };
    expect(maintenanceWindowCovers(window, 3, 540)).toBe(true);
    expect(maintenanceWindowCovers(window, 3, 1019)).toBe(true);
    expect(maintenanceWindowCovers(window, 3, 1020)).toBe(false);
    expect(maintenanceWindowCovers(window, 2, 600)).toBe(false);
  });

  it('wraps past midnight from the selected start day', () => {
    const window = { start_minute: 1380, end_minute: 120, days: [1], timezone: 'UTC' };
    // Monday 23:10 and Tuesday 01:30 belong to Monday's window.
    expect(maintenanceWindowCovers(window, 1, 1390)).toBe(true);
    expect(maintenanceWindowCovers(window, 2, 90)).toBe(true);
    // Tuesday 10:00 does not.
    expect(maintenanceWindowCovers(window, 2, 600)).toBe(false);
    // Tuesday's own early hours only count when Monday is selected.
    expect(maintenanceWindowCovers({ ...window, days: [2] }, 2, 90)).toBe(false);
  });

  it('never covers an empty window', () => {
    const window = { start_minute: 600, end_minute: 600, days: [1, 2, 3], timezone: 'UTC' };
    expect(maintenanceWindowCovers(window, 3, 600)).toBe(false);
  });
});

describe('isMaintenanceWindowActive', () => {
  it('evaluates the stored JSON against the window timezone', () => {
    const shanghai = JSON.stringify({
      start_minute: 1080,
      end_minute: 1140,
      days: [3],
      timezone: 'Asia/Shanghai',
    });
    expect(isMaintenanceWindowActive(shanghai, AT)).toBe(true);

    const utc = JSON.stringify({
      start_minute: 1080,
      end_minute: 1140,
      days: [3],
      timezone: 'UTC',
    });
    expect(isMaintenanceWindowActive(utc, AT)).toBe(false);
  });

  it('fails open for unreadable or invalid stored data', () => {
    expect(isMaintenanceWindowActive('{not json', AT)).toBe(false);
    expect(
      isMaintenanceWindowActive(
        JSON.stringify({ start_minute: 0, end_minute: 60, days: [], timezone: 'UTC' }),
        AT,
      ),
    ).toBe(false);
    expect(
      isMaintenanceWindowActive(
        JSON.stringify({ start_minute: 0, end_minute: 60, days: [1], timezone: 'Not/AZone' }),
        AT,
      ),
    ).toBe(false);
  });
});

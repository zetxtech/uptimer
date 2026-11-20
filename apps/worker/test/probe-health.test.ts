import { describe, expect, it } from 'vitest';

import { probeHealthStatus } from '../src/probes/health';

const base = {
  enabled: true,
  createdAt: 1000,
  healthStartedAt: null,
  lastSeenAt: null,
  offlineAfterSec: 900,
};

describe('probe health', () => {
  it('allows a new probe a grace period before declaring it offline', () => {
    expect(probeHealthStatus({ ...base, now: 1899 })).toBe('waiting');
    expect(probeHealthStatus({ ...base, now: 1900 })).toBe('offline');
  });

  it('detects a fresh heartbeat and its expiry', () => {
    expect(probeHealthStatus({ ...base, lastSeenAt: 1400, now: 2299 })).toBe('online');
    expect(probeHealthStatus({ ...base, lastSeenAt: 1400, now: 2300 })).toBe('offline');
    expect(probeHealthStatus({ ...base, lastSeenAt: 2300, now: 2300 })).toBe('online');
  });

  it('starts a new grace period when re-enabled', () => {
    expect(probeHealthStatus({ ...base, healthStartedAt: 3000, lastSeenAt: 1400, now: 3500 })).toBe(
      'waiting',
    );
    expect(probeHealthStatus({ ...base, healthStartedAt: 3000, lastSeenAt: 1400, now: 3900 })).toBe(
      'offline',
    );
  });

  it('does not report disabled probes as offline', () => {
    expect(probeHealthStatus({ ...base, enabled: false, now: 10000 })).toBe('disabled');
  });
});

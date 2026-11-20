export type ProbeHealthStatus = 'waiting' | 'online' | 'offline' | 'disabled';

export function probeHealthStatus(input: {
  enabled: boolean;
  createdAt: number;
  healthStartedAt: number | null;
  lastSeenAt: number | null;
  offlineAfterSec: number;
  now: number;
}): ProbeHealthStatus {
  if (!input.enabled) return 'disabled';

  const startedAt = input.healthStartedAt ?? input.createdAt;
  const hasHeartbeat = input.lastSeenAt !== null && input.lastSeenAt >= startedAt;
  const lastActivityAt = hasHeartbeat ? Math.max(startedAt, input.lastSeenAt!) : startedAt;

  if (input.now - lastActivityAt >= input.offlineAfterSec) return 'offline';
  return hasHeartbeat ? 'online' : 'waiting';
}

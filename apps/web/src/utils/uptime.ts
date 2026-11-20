import type { UptimeColorTier, UptimeRatingLevel } from '../api/types';

// ──────── Thresholds ────────

export const UPTIME_THRESHOLDS_BY_LEVEL: Record<
  UptimeRatingLevel,
  {
    emerald: number;
    green: number;
    lime: number;
    yellow: number;
    amber: number;
    orange: number;
    red: number;
  }
> = {
  1: { emerald: 99.0, green: 98.0, lime: 97.0, yellow: 96.0, amber: 95.0, orange: 90.0, red: 80.0 },
  2: { emerald: 99.9, green: 99.5, lime: 99.0, yellow: 98.5, amber: 98.0, orange: 97.0, red: 95.0 },
  3: {
    emerald: 99.99,
    green: 99.95,
    lime: 99.9,
    yellow: 99.5,
    amber: 99.0,
    orange: 98.0,
    red: 97.0,
  },
  4: {
    emerald: 99.999,
    green: 99.995,
    lime: 99.99,
    yellow: 99.95,
    amber: 99.9,
    orange: 99.5,
    red: 99.0,
  },
  5: {
    emerald: 100.0,
    green: 99.999,
    lime: 99.995,
    yellow: 99.99,
    amber: 99.95,
    orange: 99.9,
    red: 99.5,
  },
};

// ──────── Tier resolution ────────

export function getUptimeTier(uptimePct: number, level: UptimeRatingLevel): UptimeColorTier {
  if (!Number.isFinite(uptimePct)) return 'slate';

  const t = UPTIME_THRESHOLDS_BY_LEVEL[level] ?? UPTIME_THRESHOLDS_BY_LEVEL[3];

  if (uptimePct >= t.emerald) return 'emerald';
  if (uptimePct >= t.green) return 'green';
  if (uptimePct >= t.lime) return 'lime';
  if (uptimePct >= t.yellow) return 'yellow';
  if (uptimePct >= t.amber) return 'amber';
  if (uptimePct >= t.orange) return 'orange';
  if (uptimePct >= t.red) return 'red';
  return 'rose';
}

// ──────── Token class mappings ────────

/**
 * Uptime tiers collapse onto the reference ramp: two greens, one amber and one
 * red, plus a neutral for unknown days. See docs/reference/better-stack/design-tokens.md.
 */
function tierKey(tier: UptimeColorTier): 'up-strong' | 'up' | 'warn' | 'down' | 'muted' {
  switch (tier) {
    case 'emerald':
      return 'up-strong';
    case 'green':
    case 'lime':
      return 'up';
    case 'yellow':
    case 'amber':
      return 'warn';
    case 'orange':
    case 'red':
    case 'rose':
      return 'down';
    case 'slate':
    default:
      return 'muted';
  }
}

export function getUptimeBgClasses(tier: UptimeColorTier): string {
  return `ui-tier-bg-${tierKey(tier)}`;
}

export function getUptimeTextClasses(tier: UptimeColorTier): string {
  return `ui-tier-fg-${tierKey(tier)}`;
}

export function getUptimePillClasses(tier: UptimeColorTier): string {
  return `ui-tier-pill-${tierKey(tier)}`;
}

// ──────── Formatting ────────

export function formatPct(v: number): string {
  if (!Number.isFinite(v)) return '-';
  return `${v.toFixed(3)}%`;
}

export function formatLatency(v: number | null): string {
  return v === null ? '-' : `${v}ms`;
}

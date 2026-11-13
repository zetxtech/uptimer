import type { Env } from '../env';

const SSL_CHECK_TIMEOUT_MS = 10_000;
const RDAP_REGISTRY_TIMEOUT_MS = 12_000;
const RDAP_ROUTER_TIMEOUT_MS = 10_000;
const DEFAULT_SSL_CHECK_URL = 'https://api.domainee.dev/v1/tools/ssl-check';
const RDAP_BOOTSTRAP_URL = 'https://data.iana.org/rdap/dns.json';
const RDAP_ROUTER_URL = 'https://rdap.org/domain/';
const RDAP_BOOTSTRAP_TTL_SECONDS = 7 * 86400;
const RDAP_BOOTSTRAP_SETTING_KEY = 'rdap_bootstrap';
const RDAP_MAX_CANDIDATES = 4;

/** Days-before-expiry values that trigger one notification each, ascending (smallest crossed wins). */
export const EXPIRY_THRESHOLDS_DAYS = [1, 3, 7, 14, 30] as const;

export type ExpiryCheckOutcome = {
  sslExpiresAt: number | null;
  sslIssuer: string | null;
  domainExpiresAt: number | null;
  errors: string[];
};

type SslCheckResponse = {
  ok?: boolean;
  data?: {
    validTo?: unknown;
    daysUntilExpiry?: unknown;
    issuer?: { CN?: unknown; O?: unknown };
  };
};

type RdapEvent = { eventAction?: unknown; eventDate?: unknown };
type RdapDomainResponse = { events?: unknown };

function toUnixSeconds(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Host part of a monitor target; null for heartbeat or malformed targets. */
export function expiryHostFromTarget(type: string, target: string): string | null {
  const trimmed = target.trim();
  if (!trimmed) return null;

  if (type === 'http') {
    try {
      return new URL(trimmed).hostname || null;
    } catch {
      return null;
    }
  }

  if (type === 'tcp') {
    if (trimmed.startsWith('[')) {
      const end = trimmed.indexOf(']');
      return end > 1 ? trimmed.slice(1, end) : null;
    }
    const [host, port] = trimmed.split(':');
    if (host && port && /^\d+$/.test(port)) return host;
    return trimmed.includes(':') ? null : trimmed;
  }

  return null;
}

async function fetchJson(url: string, timeoutMs: number, accept: string): Promise<unknown> {
  const signal =
    typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs)
      : undefined;
  const res = await fetch(url, {
    headers: { accept, 'user-agent': 'Uptimer/0.1 (expiry check)' },
    cache: 'no-store',
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) {
    res.body?.cancel();
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as unknown;
}

async function checkSslExpiry(
  env: Env,
  host: string,
  now: number,
): Promise<{ expiresAt: number; issuer: string | null }> {
  const endpoint = env.UPTIMER_SSL_CHECK_URL?.trim() || DEFAULT_SSL_CHECK_URL;
  const separator = endpoint.includes('?') ? '&' : '?';
  const body = (await fetchJson(
    `${endpoint}${separator}host=${encodeURIComponent(host)}`,
    SSL_CHECK_TIMEOUT_MS,
    'application/json',
  )) as SslCheckResponse;

  const data = body?.data;
  const validTo = toUnixSeconds(data?.validTo);
  const days = typeof data?.daysUntilExpiry === 'number' ? data.daysUntilExpiry : null;
  const expiresAt = validTo ?? (days === null ? null : now + Math.round(days * 86400));
  if (expiresAt === null) throw new Error('no expiry date in response');

  const issuerCn = typeof data?.issuer?.CN === 'string' ? data.issuer.CN : null;
  const issuerOrg = typeof data?.issuer?.O === 'string' ? data.issuer.O : null;
  return { expiresAt, issuer: issuerCn ?? issuerOrg };
}

type RdapServices = Map<string, string>;

/**
 * IANA publishes one RDAP bootstrap document mapping TLDs to registry endpoints. It is cached
 * in D1 so the daily job does not download ~70KB per monitor.
 */
async function loadRdapServices(env: Env, now: number): Promise<RdapServices> {
  const cached = await env.DB.prepare('SELECT value FROM settings WHERE key = ?1')
    .bind(RDAP_BOOTSTRAP_SETTING_KEY)
    .first<{ value: string }>();

  if (cached?.value) {
    try {
      const parsed = JSON.parse(cached.value) as {
        fetched_at?: unknown;
        services?: unknown;
      };
      const fetchedAt = typeof parsed.fetched_at === 'number' ? parsed.fetched_at : 0;
      if (now - fetchedAt < RDAP_BOOTSTRAP_TTL_SECONDS && Array.isArray(parsed.services)) {
        const map = toServiceMap(parsed.services);
        if (map.size > 0) return map;
      }
    } catch {
      // Fall through and refresh.
    }
  }

  const body = (await fetchJson(
    RDAP_BOOTSTRAP_URL,
    RDAP_ROUTER_TIMEOUT_MS,
    'application/json',
  )) as {
    services?: unknown;
  };
  if (!Array.isArray(body?.services)) throw new Error('invalid RDAP bootstrap document');

  await env.DB.prepare(
    `INSERT INTO settings (key, value) VALUES (?1, ?2)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  )
    .bind(RDAP_BOOTSTRAP_SETTING_KEY, JSON.stringify({ fetched_at: now, services: body.services }))
    .run();

  return toServiceMap(body.services);
}

function toServiceMap(services: unknown[]): RdapServices {
  const map: RdapServices = new Map();
  for (const service of services) {
    if (!Array.isArray(service) || service.length < 2) continue;
    const tlds = service[0];
    const urls = service[1];
    if (!Array.isArray(tlds) || !Array.isArray(urls)) continue;

    const base = urls.find((url) => typeof url === 'string' && url.length > 0);
    if (typeof base !== 'string') continue;

    for (const tld of tlds) {
      if (typeof tld !== 'string') continue;
      map.set(tld.toLowerCase(), base.endsWith('/') ? base : `${base}/`);
    }
  }
  return map;
}

async function checkDomainExpiry(
  env: Env,
  host: string,
  now: number,
): Promise<{ expiresAt: number }> {
  const labels = host.split('.').filter(Boolean);
  if (labels.length < 2) throw new Error('target has no registrable domain');

  const services = await loadRdapServices(env, now);
  const candidates: string[] = [];
  const maxSkips = Math.min(RDAP_MAX_CANDIDATES - 1, labels.length - 2);
  for (let skip = 0; skip <= maxSkips; skip += 1) {
    candidates.push(labels.slice(skip).join('.'));
  }

  let lastError = 'RDAP lookup found no expiration date';
  for (const candidate of candidates) {
    const tld = candidate.slice(candidate.lastIndexOf('.') + 1).toLowerCase();
    const registryBase = services.get(tld);
    const encoded = encodeURIComponent(candidate);

    // Registry first, then the public router (some registries are slow or block cloud egress).
    const endpoints: Array<{ url: string; timeoutMs: number }> = [];
    if (registryBase) {
      endpoints.push({
        url: `${registryBase}domain/${encoded}`,
        timeoutMs: RDAP_REGISTRY_TIMEOUT_MS,
      });
    }
    endpoints.push({ url: `${RDAP_ROUTER_URL}${encoded}`, timeoutMs: RDAP_ROUTER_TIMEOUT_MS });

    for (const endpoint of endpoints) {
      try {
        const body = (await fetchJson(
          endpoint.url,
          endpoint.timeoutMs,
          'application/rdap+json, application/json',
        )) as RdapDomainResponse;
        const events = Array.isArray(body?.events) ? (body.events as RdapEvent[]) : [];
        const expiration = events.find((event) => event?.eventAction === 'expiration');
        const expiresAt = toUnixSeconds(expiration?.eventDate);
        if (expiresAt !== null) return { expiresAt };
        lastError = 'RDAP response has no expiration event';
      } catch (err) {
        lastError = errorMessage(err);
      }
    }
  }

  throw new Error(lastError);
}

/**
 * Smallest threshold the monitor has just crossed, or null when nothing should fire. The first
 * run has no previous value, so an already-expiring certificate still alerts once.
 */
/** Alert ladder for one monitor: its own value when set, otherwise the shared one. */
export function expiryThresholdsFor(customDays: number | null | undefined): readonly number[] {
  if (typeof customDays === 'number' && Number.isInteger(customDays) && customDays >= 1) {
    return [customDays];
  }
  return EXPIRY_THRESHOLDS_DAYS;
}

export function crossedExpiryThreshold(
  previousExpiresAt: number | null,
  nextExpiresAt: number,
  now: number,
  thresholds: readonly number[] = EXPIRY_THRESHOLDS_DAYS,
): number | null {
  const days = Math.floor((nextExpiresAt - now) / 86400);
  if (days < 0) return null;

  const previousDays =
    previousExpiresAt === null ? null : Math.floor((previousExpiresAt - now) / 86400);

  for (const threshold of thresholds) {
    if (days <= threshold) {
      return previousDays === null || previousDays > threshold ? threshold : null;
    }
  }
  return null;
}

export type ExpiryCheckMonitor = {
  id: number;
  name: string;
  type: string;
  target: string;
  display_url: string | null;
  ssl_expiry_enabled: number | boolean;
  domain_expiry_enabled: number | boolean;
  ssl_expires_at: number | null;
  domain_expires_at: number | null;
  ssl_expiry_alert_days: number | null;
  domain_expiry_alert_days: number | null;
  notification_channel_ids_json: string | null;
};

/** Runs the enabled checks and stores the results; failures keep the previous values. */
export async function checkAndStoreMonitorExpiry(
  env: Env,
  monitor: ExpiryCheckMonitor,
  now: number,
): Promise<ExpiryCheckOutcome> {
  const checkSsl = monitor.ssl_expiry_enabled === 1 || monitor.ssl_expiry_enabled === true;
  const checkDomain = monitor.domain_expiry_enabled === 1 || monitor.domain_expiry_enabled === true;
  const outcome: ExpiryCheckOutcome = {
    sslExpiresAt: null,
    sslIssuer: null,
    domainExpiresAt: null,
    errors: [],
  };
  if (!checkSsl && !checkDomain) return outcome;

  const host = expiryHostFromTarget(monitor.type, monitor.target);
  if (!host) {
    outcome.errors.push('target has no host');
    return outcome;
  }

  if (checkSsl) {
    try {
      const ssl = await checkSslExpiry(env, host, now);
      outcome.sslExpiresAt = ssl.expiresAt;
      outcome.sslIssuer = ssl.issuer;
    } catch (err) {
      outcome.errors.push(`ssl: ${errorMessage(err)}`);
    }
  }

  if (checkDomain) {
    try {
      const domain = await checkDomainExpiry(env, host, now);
      outcome.domainExpiresAt = domain.expiresAt;
    } catch (err) {
      outcome.errors.push(`domain: ${errorMessage(err)}`);
    }
  }

  await env.DB.prepare(
    `
      UPDATE monitors
      SET ssl_expires_at = COALESCE(?2, ssl_expires_at),
          ssl_issuer = COALESCE(?3, ssl_issuer),
          domain_expires_at = COALESCE(?4, domain_expires_at),
          expiry_checked_at = ?5
      WHERE id = ?1
    `,
  )
    .bind(monitor.id, outcome.sslExpiresAt, outcome.sslIssuer, outcome.domainExpiresAt, now)
    .run();

  return outcome;
}

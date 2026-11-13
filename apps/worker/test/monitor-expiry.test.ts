import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  checkAndStoreMonitorExpiry,
  crossedExpiryThreshold,
  expiryHostFromTarget,
  expiryThresholdsFor,
  EXPIRY_THRESHOLDS_DAYS,
  type ExpiryCheckMonitor,
} from '../src/monitor/expiry';
import { createFakeD1Database, type FakeD1QueryHandler } from './helpers/fake-d1';

// 2026-11-11T00:00:00Z
const NOW = Math.floor(Date.UTC(2026, 10, 11, 0, 0) / 1000);
const DAY = 86_400;

function buildMonitor(overrides: Partial<ExpiryCheckMonitor> = {}): ExpiryCheckMonitor {
  return {
    id: 7,
    name: 'Example',
    type: 'http',
    target: 'https://example.com/health',
    display_url: null,
    ssl_expiry_enabled: 1,
    domain_expiry_enabled: 0,
    ssl_expires_at: null,
    domain_expires_at: null,
    ssl_expiry_alert_days: null,
    domain_expiry_alert_days: null,
    notification_channel_ids_json: null,
    ...overrides,
  };
}

type Handler = FakeD1QueryHandler;
type StoredSetting = { value: string };

function createDb(handlers: Handler[] = [], settings: Map<string, StoredSetting> = new Map()) {
  const base: Handler[] = [
    {
      match: 'from settings where key =',
      first: (args) => settings.get(String(args[0])) ?? null,
    },
    {
      match: 'insert into settings',
      run: (args) => {
        settings.set(String(args[0]), { value: String(args[1]) });
        return { meta: { changes: 1 } };
      },
    },
    {
      match: 'update monitors',
      run: () => ({ meta: { changes: 1 } }),
    },
  ];
  return createFakeD1Database([...handlers, ...base]);
}

const RDAP_BOOTSTRAP = {
  services: [
    [['com'], ['https://rdap.verisign.com/com/v1/']],
    [['org'], ['https://rdap.publicinterestregistry.org/rdap/']],
  ],
};

describe('expiryHostFromTarget', () => {
  it('extracts hosts for http and tcp targets', () => {
    expect(expiryHostFromTarget('http', 'https://api.example.com:8443/health')).toBe(
      'api.example.com',
    );
    expect(expiryHostFromTarget('tcp', 'db.example.com:5432')).toBe('db.example.com');
    expect(expiryHostFromTarget('tcp', 'db.example.com')).toBe('db.example.com');
    expect(expiryHostFromTarget('tcp', '[2001:db8::1]:443')).toBe('2001:db8::1');
  });

  it('returns null for heartbeat and malformed targets', () => {
    expect(expiryHostFromTarget('heartbeat', '')).toBeNull();
    expect(expiryHostFromTarget('http', 'not a url')).toBeNull();
  });
});

describe('crossedExpiryThreshold', () => {
  it('reports the first threshold the monitor enters', () => {
    expect(crossedExpiryThreshold(null, NOW + 40 * DAY, NOW)).toBeNull();
    expect(crossedExpiryThreshold(null, NOW + 29 * DAY, NOW)).toBe(30);
    expect(crossedExpiryThreshold(NOW + 29 * DAY, NOW + 28 * DAY, NOW)).toBeNull();
    expect(crossedExpiryThreshold(NOW + 8 * DAY, NOW + 7 * DAY, NOW)).toBe(7);
    expect(crossedExpiryThreshold(NOW + 2 * DAY, NOW + 1 * DAY, NOW)).toBe(1);
  });

  it('stays quiet for already expired certificates', () => {
    expect(crossedExpiryThreshold(null, NOW - DAY, NOW)).toBeNull();
  });

  it('uses a monitor-specific alert day when one is set', () => {
    const thresholds = expiryThresholdsFor(45);
    // Only the monitor's own day fires; the shared ladder is ignored.
    expect(crossedExpiryThreshold(null, NOW + 60 * DAY, NOW, thresholds)).toBeNull();
    expect(crossedExpiryThreshold(null, NOW + 45 * DAY, NOW, thresholds)).toBe(45);
    // Moving deeper inside the same band stays quiet; crossing into it fires once.
    expect(crossedExpiryThreshold(NOW + 45 * DAY, NOW + 44 * DAY, NOW, thresholds)).toBeNull();
    expect(crossedExpiryThreshold(NOW + 46 * DAY, NOW + 45 * DAY, NOW, thresholds)).toBe(45);
  });

  it('falls back to the shared ladder for null or invalid overrides', () => {
    expect(expiryThresholdsFor(null)).toEqual(EXPIRY_THRESHOLDS_DAYS);
    expect(expiryThresholdsFor(undefined)).toEqual(EXPIRY_THRESHOLDS_DAYS);
    expect(expiryThresholdsFor(0)).toEqual(EXPIRY_THRESHOLDS_DAYS);
    expect(expiryThresholdsFor(-3)).toEqual(EXPIRY_THRESHOLDS_DAYS);
    expect(expiryThresholdsFor(2.5)).toEqual(EXPIRY_THRESHOLDS_DAYS);
  });
});

describe('checkAndStoreMonitorExpiry', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.clearAllMocks();
  });

  it('stores the certificate expiry and issuer from the SSL checker', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            validTo: '2026-12-25T22:56:35.000Z',
            daysUntilExpiry: 44,
            issuer: { CN: 'Cloudflare TLS Issuing ECC CA 3' },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }) as unknown as typeof fetch;

    const params: unknown[][] = [];
    const db = createDb([
      {
        match: 'update monitors',
        run: (args) => {
          params.push(args);
          return { meta: { changes: 1 } };
        },
      },
    ]);

    const outcome = await checkAndStoreMonitorExpiry({ DB: db } as never, buildMonitor(), NOW);

    expect(outcome.sslExpiresAt).toBe(Date.UTC(2026, 11, 25, 22, 56, 35) / 1000);
    expect(outcome.sslIssuer).toBe('Cloudflare TLS Issuing ECC CA 3');
    expect(outcome.errors).toEqual([]);
    expect(urls[0]).toBe('https://api.domainee.dev/v1/tools/ssl-check?host=example.com');
    expect(params[0]).toEqual([
      7,
      outcome.sslExpiresAt,
      'Cloudflare TLS Issuing ECC CA 3',
      null,
      NOW,
    ]);
  });

  it('resolves the domain expiry through the registry RDAP service', async () => {
    const bootstrapKey = new Map<string, StoredSetting>([
      [
        'rdap_bootstrap',
        { value: JSON.stringify({ fetched_at: NOW, services: RDAP_BOOTSTRAP.services }) },
      ],
    ]);
    const calledUrls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calledUrls.push(url);
      return new Response(
        JSON.stringify({
          objectClassName: 'domain',
          events: [
            { eventAction: 'registration', eventDate: '1995-08-14T04:00:00Z' },
            { eventAction: 'expiration', eventDate: '2027-08-13T04:00:00Z' },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const db = createDb([], bootstrapKey);
    const outcome = await checkAndStoreMonitorExpiry(
      { DB: db } as never,
      buildMonitor({ ssl_expiry_enabled: 0, domain_expiry_enabled: 1 }),
      NOW,
    );

    expect(outcome.domainExpiresAt).toBe(Date.UTC(2027, 7, 13, 4, 0, 0) / 1000);
    expect(calledUrls).toEqual(['https://rdap.verisign.com/com/v1/domain/example.com']);
    // The cached bootstrap is reused, so only the domain lookup went out.
    expect(bootstrapKey.get('rdap_bootstrap')?.value).toContain('rdap.verisign.com');
  });

  it('falls back to the parent domain when the host itself is not in RDAP', async () => {
    const bootstrapKey = new Map<string, StoredSetting>([
      [
        'rdap_bootstrap',
        { value: JSON.stringify({ fetched_at: NOW, services: RDAP_BOOTSTRAP.services }) },
      ],
    ]);
    const calledUrls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      calledUrls.push(url);
      if (url.includes('api.example.com')) {
        return new Response('not found', { status: 404 });
      }
      return new Response(
        JSON.stringify({
          events: [{ eventAction: 'expiration', eventDate: '2028-01-01T00:00:00Z' }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const db = createDb([], bootstrapKey);
    const outcome = await checkAndStoreMonitorExpiry(
      { DB: db } as never,
      buildMonitor({
        target: 'https://api.example.com/health',
        ssl_expiry_enabled: 0,
        domain_expiry_enabled: 1,
      }),
      NOW,
    );

    expect(outcome.domainExpiresAt).toBe(Date.UTC(2028, 0, 1) / 1000);
    expect(calledUrls).toEqual([
      'https://rdap.verisign.com/com/v1/domain/api.example.com',
      'https://rdap.org/domain/api.example.com',
      'https://rdap.verisign.com/com/v1/domain/example.com',
    ]);
  });

  it('downloads and caches the IANA bootstrap document when the cache is cold', async () => {
    const bootstrapKey = new Map<string, StoredSetting>();
    globalThis.fetch = vi.fn(async (url: string) => {
      if (url === 'https://data.iana.org/rdap/dns.json') {
        return new Response(JSON.stringify(RDAP_BOOTSTRAP), { status: 200 });
      }
      return new Response(
        JSON.stringify({
          events: [{ eventAction: 'expiration', eventDate: '2029-02-03T00:00:00Z' }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const db = createDb([], bootstrapKey);
    const outcome = await checkAndStoreMonitorExpiry(
      { DB: db } as never,
      buildMonitor({ ssl_expiry_enabled: 0, domain_expiry_enabled: 1 }),
      NOW,
    );

    expect(outcome.domainExpiresAt).toBe(Date.UTC(2029, 1, 3) / 1000);
    expect(bootstrapKey.get('rdap_bootstrap')?.value).toContain('"fetched_at"');
  });

  it('reports failures without wiping previously stored values', async () => {
    globalThis.fetch = vi.fn(
      async () => new Response('nope', { status: 500 }),
    ) as unknown as typeof fetch;

    const params: unknown[][] = [];
    const db = createDb([
      {
        match: 'update monitors',
        run: (args) => {
          params.push(args);
          return { meta: { changes: 1 } };
        },
      },
    ]);

    const outcome = await checkAndStoreMonitorExpiry({ DB: db } as never, buildMonitor(), NOW);

    expect(outcome.sslExpiresAt).toBeNull();
    expect(outcome.errors[0]).toMatch(/ssl: HTTP 500/);
    // COALESCE keeps the old value in SQL, so nulls are bound and never overwrite it.
    expect(params[0]?.[1]).toBeNull();
  });

  it('honours a custom checker endpoint', async () => {
    const urls: string[] = [];
    globalThis.fetch = vi.fn(async (url: string) => {
      urls.push(url);
      return new Response(JSON.stringify({ data: { validTo: '2027-01-01T00:00:00Z' } }), {
        status: 200,
      });
    }) as unknown as typeof fetch;

    const db = createDb();
    await checkAndStoreMonitorExpiry(
      { DB: db, UPTIMER_SSL_CHECK_URL: 'https://certs.internal/check' } as never,
      buildMonitor(),
      NOW,
    );

    expect(urls[0]).toBe('https://certs.internal/check?host=example.com');
  });
});

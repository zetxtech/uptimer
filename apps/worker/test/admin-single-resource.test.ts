import { readdirSync, readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/monitor/tcp', () => ({ runTcpCheck: vi.fn() }));
vi.mock('../src/snapshots', () => ({
  refreshPublicHomepageSnapshotIfNeeded: vi.fn().mockResolvedValue(false),
}));

import type { Env } from '../src/env';
import { adminRoutes } from '../src/routes/admin';
import { DatabaseSync, sqliteD1 } from './helpers/sqlite-d1';

const migrationsDir = new URL('../migrations/', import.meta.url);

function createApp() {
  const database = new DatabaseSync(':memory:');
  for (const file of readdirSync(migrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    database.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
  }

  const db = sqliteD1(database);
  const preparedQueries: Array<{ sql: string; bindings: number }> = [];
  const prepare = db.prepare.bind(db);
  db.prepare = (sql) => {
    const highestParameter = Math.max(
      0,
      ...Array.from(sql.matchAll(/\?(\d+)/g), (match) => Number(match[1])),
    );
    if (highestParameter > 100) {
      throw new Error('D1_ERROR: variable number must be between ?1 and ?100');
    }
    const statement = prepare(sql);
    const bind = statement.bind.bind(statement);
    statement.bind = (...values: unknown[]) => {
      if (values.length > 100) throw new Error('D1_ERROR: too many bound parameters');
      preparedQueries.push({ sql, bindings: values.length });
      return bind(...values);
    };
    return statement;
  };

  const env = { DB: db, ADMIN_TOKEN: 'test-admin' } as unknown as Env;
  const request = (path: string, authenticated = true) =>
    adminRoutes.fetch(
      new Request(`https://status.example.com${path}`, {
        headers: authenticated ? { Authorization: 'Bearer test-admin' } : {},
      }),
      env,
      { waitUntil: vi.fn() } as unknown as ExecutionContext,
    );

  return { database, request, preparedQueries };
}

function seedMonitors(database: InstanceType<typeof DatabaseSync>, count: number) {
  const insert = database.prepare(`
    INSERT INTO monitors (id, name, type, target, created_at, updated_at)
    VALUES (?, ?, 'http', 'https://example.com/health', 1700000000, 1700000100)
  `);
  for (let id = 1; id <= count; id += 1) {
    insert.run(id, `Monitor ${id}`);
  }
}

function seedIncidents(database: InstanceType<typeof DatabaseSync>, count: number) {
  const insert = database.prepare(`
    INSERT INTO incidents (id, title, status, impact, message, started_at, resolved_at)
    VALUES (?, ?, 'resolved', 'minor', NULL, ?, ?)
  `);
  for (let id = 1; id <= count; id += 1) {
    insert.run(id, `Incident ${id}`, 1700000000 + id, 1700000100 + id);
  }
}

describe('admin single-resource reads', () => {
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    app = createApp();
  });

  afterEach(() => {
    app.database.close();
  });

  it('reads a monitor outside the largest list with its state and parsed configuration', async () => {
    seedMonitors(app.database, 201);
    app.database
      .prepare(
        `
        UPDATE monitors
        SET display_url = 'https://example.com', interval_sec = 120, timeout_ms = 5000,
            http_method = 'POST', http_headers_json = ?, http_body = ?, follow_redirects = 0,
            expected_status_json = ?, forbidden_status_json = ?,
            response_keyword = 'ok', response_keyword_mode = 'contains',
            response_forbidden_keyword = 'fatal', response_forbidden_keyword_mode = 'regex',
            group_name = '  Payments  ', group_sort_order = 10, sort_order = 7,
            show_on_status_page = 0, is_active = 0, probe_mode = 'multi_region',
            failures_to_down_from_up = 3, successes_to_up_from_down = 4
        WHERE id = 201
      `,
      )
      .run(
        JSON.stringify({ 'X-Health-Check': 'enabled' }),
        '{"probe":true}',
        JSON.stringify([200, { from: 201, to: 299 }]),
        JSON.stringify([500, { from: 502, to: 504 }]),
      );
    app.database.exec(`
      INSERT INTO monitor_state (
        monitor_id, status, last_checked_at, last_changed_at, last_latency_ms, last_error
      ) VALUES
        (1, 'up', 1700000200, 1700000100, 20, NULL),
        (201, 'down', 1700000500, 1700000400, 305, 'Service unavailable')
    `);

    const list = await app.request('/monitors?limit=200');
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { monitors: Array<{ id: number }> };
    expect(listBody.monitors).toHaveLength(200);
    expect(listBody.monitors.some((monitor) => monitor.id === 201)).toBe(false);

    const detail = await app.request('/monitors/201');
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual({
      monitor: {
        id: 201,
        name: 'Monitor 201',
        type: 'http',
        target: 'https://example.com/health',
        display_url: 'https://example.com',
        interval_sec: 120,
        timeout_ms: 5000,
        http_method: 'POST',
        http_headers_json: { 'X-Health-Check': 'enabled' },
        http_body: '{"probe":true}',
        follow_redirects: false,
        expected_status_json: [200, { from: 201, to: 299 }],
        forbidden_status_json: [500, { from: 502, to: 504 }],
        response_keyword: 'ok',
        response_keyword_mode: 'contains',
        response_forbidden_keyword: 'fatal',
        response_forbidden_keyword_mode: 'regex',
        group_name: 'Payments',
        group_sort_order: 10,
        sort_order: 7,
        show_on_status_page: false,
        is_active: false,
        probe_mode: 'multi_region',
        notification_channel_ids: null,
        maintenance_window: null,
        metadata: [],
        ssl_expiry_enabled: false,
        domain_expiry_enabled: false,
        ssl_expiry_alert_days: null,
        domain_expiry_alert_days: null,
        ssl_expires_at: null,
        ssl_issuer: null,
        domain_expires_at: null,
        expiry_checked_at: null,
        keep_cookies: false,
        heartbeat_token: null,
        last_heartbeat_at: null,
        heartbeat_grace_sec: null,
        failures_to_down_from_up: 3,
        successes_to_up_from_down: 4,
        confirmation_period_sec: null,
        recovery_period_sec: null,
        created_at: 1700000000,
        updated_at: 1700000100,
        status: 'down',
        last_checked_at: 1700000500,
        last_status_change_at: 1700000400,
        last_latency_ms: 305,
        last_error: 'Service unavailable',
      },
    });
  });

  it('reads a heartbeat monitor without state using the existing nullable defaults', async () => {
    seedMonitors(app.database, 1);
    app.database.exec(`
      UPDATE monitors
      SET type = 'heartbeat', target = '', heartbeat_token = '0123456789abcdef0123456789abcdef'
      WHERE id = 1
    `);

    const detail = await app.request('/monitors/1');
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      monitor: {
        id: 1,
        type: 'heartbeat',
        target: '',
        heartbeat_token: '0123456789abcdef0123456789abcdef',
        heartbeat_grace_sec: null,
        http_headers_json: null,
        expected_status_json: null,
        forbidden_status_json: null,
        failures_to_down_from_up: null,
        successes_to_up_from_down: null,
        is_active: true,
        show_on_status_page: true,
        status: 'unknown',
        last_checked_at: null,
        last_status_change_at: null,
        last_latency_ms: null,
        last_error: null,
      },
    });
  });

  it('reads an incident outside the largest list with sorted associations and updates', async () => {
    seedMonitors(app.database, 2);
    seedIncidents(app.database, 201);
    app.database.exec(`
      UPDATE incidents SET impact = 'major', message = 'Recovered' WHERE id = 1;
      INSERT INTO incident_monitors (incident_id, monitor_id) VALUES (1, 2), (1, 1), (2, 2);
      INSERT INTO incident_updates (id, incident_id, status, message, created_at) VALUES
        (30, 1, 'resolved', 'Recovered', 1700000050),
        (20, 1, NULL, 'More information', 1700000020),
        (10, 1, 'identified', 'Cause identified', 1700000020),
        (40, 2, 'monitoring', 'Unrelated update', 1700000010)
    `);

    const list = await app.request('/incidents?limit=200');
    expect(list.status).toBe(200);
    const listBody = (await list.json()) as { incidents: Array<{ id: number }> };
    expect(listBody.incidents).toHaveLength(200);
    expect(listBody.incidents.some((incident) => incident.id === 1)).toBe(false);

    const detail = await app.request('/incidents/1');
    expect(detail.status).toBe(200);
    expect(await detail.json()).toEqual({
      incident: {
        id: 1,
        title: 'Incident 1',
        status: 'resolved',
        impact: 'major',
        message: 'Recovered',
        started_at: 1700000001,
        resolved_at: 1700000101,
        acknowledged_at: null,
        similar_group_id: null,
        outage_id: null,
        monitor_ids: [1, 2],
        updates: [
          {
            id: 10,
            incident_id: 1,
            status: 'identified',
            message: 'Cause identified',
            created_at: 1700000020,
            attachments: [],
          },
          {
            id: 20,
            incident_id: 1,
            status: null,
            message: 'More information',
            created_at: 1700000020,
            attachments: [],
          },
          {
            id: 30,
            incident_id: 1,
            status: 'resolved',
            message: 'Recovered',
            created_at: 1700000050,
            attachments: [],
          },
        ],
      },
      monitors: [
        { id: 1, name: 'Monitor 1' },
        { id: 2, name: 'Monitor 2' },
      ],
    });
  });

  it('reads incidents with no associations or updates', async () => {
    seedIncidents(app.database, 1);

    const detail = await app.request('/incidents/1');
    expect(detail.status).toBe(200);
    expect(await detail.json()).toMatchObject({
      incident: { id: 1, message: null, monitor_ids: [], updates: [] },
      monitors: [],
    });
  });

  it('returns all 201 monitor name summaries in one joined query without configuration fields', async () => {
    seedMonitors(app.database, 201);
    seedIncidents(app.database, 1);
    app.database.exec(`
      INSERT INTO incident_monitors (incident_id, monitor_id)
        SELECT 1, id FROM monitors ORDER BY id DESC
    `);

    const response = await app.request('/incidents/1');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      incident: { monitor_ids: number[] };
      monitors: Array<{ id: number; name: string }>;
    };
    expect(body.incident.monitor_ids).toEqual(Array.from({ length: 201 }, (_, index) => index + 1));
    expect(body.monitors).toEqual(
      Array.from({ length: 201 }, (_, index) => ({ id: index + 1, name: `Monitor ${index + 1}` })),
    );
    const joinedQueries = app.preparedQueries.filter((query) =>
      /inner join "monitors"/i.test(query.sql),
    );
    expect(joinedQueries).toHaveLength(1);
    expect(joinedQueries[0]?.bindings).toBe(1);
  });

  it('loads 200 incidents in D1-safe batches without losing association or update ordering', async () => {
    seedMonitors(app.database, 2);
    seedIncidents(app.database, 201);
    app.database.exec(`
      INSERT INTO incident_monitors (incident_id, monitor_id)
        SELECT id, 2 FROM incidents;
      INSERT INTO incident_monitors (incident_id, monitor_id)
        SELECT id, 1 FROM incidents;
      INSERT INTO incident_updates (id, incident_id, status, message, created_at)
        SELECT id * 10 + 3, id, 'resolved', 'Recovered', 30 FROM incidents;
      INSERT INTO incident_updates (id, incident_id, status, message, created_at)
        SELECT id * 10 + 2, id, NULL, 'More information', 20 FROM incidents;
      INSERT INTO incident_updates (id, incident_id, status, message, created_at)
        SELECT id * 10 + 1, id, 'identified', 'Cause identified', 20 FROM incidents
    `);

    const response = await app.request('/incidents?limit=200');
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      incidents: Array<{
        id: number;
        monitor_ids: number[];
        updates: Array<{ id: number; incident_id: number; created_at: number }>;
      }>;
    };
    expect(body.incidents.map((incident) => incident.id)).toEqual(
      Array.from({ length: 200 }, (_, index) => 201 - index),
    );
    for (const incident of body.incidents) {
      expect(incident.monitor_ids).toEqual([1, 2]);
      expect(
        incident.updates.map((update) => [update.id, update.incident_id, update.created_at]),
      ).toEqual([
        [incident.id * 10 + 1, incident.id, 20],
        [incident.id * 10 + 2, incident.id, 20],
        [incident.id * 10 + 3, incident.id, 30],
      ]);
    }
    for (const table of ['incident_monitors', 'incident_updates']) {
      const queries = app.preparedQueries.filter((query) => query.sql.includes(`FROM ${table}`));
      expect(queries.map((query) => query.bindings)).toEqual([100, 100]);
    }
  });

  it('filters incidents before limiting and keeps unresolved, time, and ID ordering', async () => {
    seedMonitors(app.database, 2);
    seedIncidents(app.database, 205);
    app.database.exec(`
      UPDATE incidents SET status = 'investigating', resolved_at = NULL WHERE id >= 6;
      UPDATE incidents SET status = 'monitoring', started_at = 10, resolved_at = NULL WHERE id IN (1, 2);
      UPDATE incidents SET status = 'identified', started_at = 9, resolved_at = NULL WHERE id = 3;
      UPDATE incidents SET started_at = 2000000000 WHERE id = 4;
      UPDATE incidents SET started_at = 1 WHERE id = 5;
      INSERT INTO incident_monitors (incident_id, monitor_id) VALUES
        (1, 1), (2, 1), (2, 2), (3, 1), (4, 1), (5, 1);
      INSERT INTO incident_monitors (incident_id, monitor_id)
        SELECT id, 2 FROM incidents WHERE id >= 6;
      INSERT INTO incident_updates (id, incident_id, status, message, created_at)
        VALUES (1, 2, 'monitoring', 'Watching recovery', 11)
    `);

    const globalList = await app.request('/incidents?limit=200');
    expect(globalList.status).toBe(200);
    const globalBody = (await globalList.json()) as { incidents: Array<{ id: number }> };
    expect(globalBody.incidents).toHaveLength(200);
    expect(globalBody.incidents.every((incident) => incident.id >= 6)).toBe(true);

    const limited = await app.request('/incidents?monitor_id=1&limit=1');
    expect(limited.status).toBe(200);
    expect(await limited.json()).toMatchObject({
      incidents: [
        {
          id: 2,
          monitor_ids: [1, 2],
          updates: [
            {
              id: 1,
              incident_id: 2,
              status: 'monitoring',
              message: 'Watching recovery',
              created_at: 11,
            },
          ],
        },
      ],
    });

    const filtered = await app.request('/incidents?monitor_id=1');
    expect(filtered.status).toBe(200);
    const filteredBody = (await filtered.json()) as { incidents: Array<{ id: number }> };
    expect(filteredBody.incidents.map((incident) => incident.id)).toEqual([2, 1, 3, 4, 5]);

    const empty = await app.request('/incidents?monitor_id=999&limit=1');
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ incidents: [], next_offset: null, total_count: 0 });
  });

  it.each([
    ['/monitors/999', 'Monitor not found'],
    ['/incidents/999', 'Incident not found'],
  ])('returns a structured 404 for missing resource %s', async (path, message) => {
    const response = await app.request(path);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: { code: 'NOT_FOUND', message } });
  });

  it.each(
    ['monitors', 'incidents'].flatMap((resource) =>
      ['0', '-1', '1.5', 'invalid'].map((id) => `/${resource}/${id}`),
    ),
  )('rejects invalid resource IDs at %s', async (path) => {
    const response = await app.request(path);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
  });

  it.each(['0', '-1', '1.5', 'invalid', ''])(
    'rejects invalid monitor_id query value %s',
    async (monitorId) => {
      const response = await app.request(`/incidents?monitor_id=${monitorId}`);
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: { code: 'INVALID_ARGUMENT' } });
    },
  );

  it.each(['/monitors/1', '/incidents/1', '/incidents?monitor_id=1'])(
    'requires an admin token for %s',
    async (path) => {
      const response = await app.request(path, false);
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({
        error: { code: 'UNAUTHORIZED', message: 'Unauthorized' },
      });
    },
  );
});

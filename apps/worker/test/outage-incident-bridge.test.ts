import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DatabaseSync } from './helpers/sqlite-d1';

type TestDatabase = InstanceType<typeof DatabaseSync>;

const migrationsDir = new URL('../migrations/', import.meta.url);
const migrations = readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort();

function createDatabase(includeBridge: boolean): TestDatabase {
  const database = new DatabaseSync(':memory:');
  for (const name of migrations) {
    if (!includeBridge && name === '0035_outage_incident_bridge.sql') continue;
    database.exec(readFileSync(new URL(name, migrationsDir), 'utf8'));
  }
  return database;
}

function readIncident(database: TestDatabase, outageId: number) {
  return database
    .prepare('SELECT id, status, started_at, resolved_at, outage_id FROM incidents WHERE outage_id = ?')
    .get(outageId) as
    | { id: number; status: string; started_at: number; resolved_at: number | null; outage_id: number }
    | undefined;
}

describe('outage to incident lifecycle', () => {
  it('renames linked incidents and removes their dependent records when an outage is deleted', () => {
    const db = createDatabase(true);
    try {
      db.prepare("INSERT INTO monitors (name, type, target) VALUES ('App', 'http', 'https://example.com')").run();
      const outageId = Number(db.prepare(
        "INSERT INTO outages (monitor_id, started_at, initial_error) VALUES (1, 1700000000, 'HTTP 500')",
      ).run().lastInsertRowid);
      const incident = readIncident(db, outageId);
      expect(incident).toBeDefined();
      db.prepare("UPDATE outages SET title = 'Planned incident title' WHERE id = ?").run(outageId);
      expect(db.prepare('SELECT title FROM incidents WHERE outage_id = ?').get(outageId)).toMatchObject({
        title: 'Planned incident title',
      });
      db.prepare(
        "INSERT INTO incident_updates (incident_id, status, message) VALUES (?, NULL, 'Investigating')",
      ).run(incident?.id);
      db.prepare('DELETE FROM outages WHERE id = ?').run(outageId);
      expect(readIncident(db, outageId)).toBeUndefined();
      expect(db.prepare('SELECT COUNT(*) AS count FROM incident_updates WHERE incident_id = ?')
        .get(incident?.id)).toMatchObject({count:0});
      expect(db.prepare('SELECT COUNT(*) AS count FROM incident_monitors WHERE incident_id = ?')
        .get(incident?.id)).toMatchObject({count:0});
    } finally {
      db.close();
    }
  });

  it('creates one linked incident and resolves it when the outage closes', () => {
    const db = createDatabase(true);
    try {
      db.prepare("INSERT INTO monitors (name, type, target) VALUES ('App', 'http', 'https://example.com')").run();
      const outage = db.prepare(
        "INSERT INTO outages (monitor_id, started_at, initial_error) VALUES (1, 1700000000, 'HTTP 500')",
      ).run();
      const outageId = Number(outage.lastInsertRowid);
      const incident = readIncident(db, outageId);
      expect(incident).toMatchObject({ status: 'investigating', outage_id: outageId });
      expect(db.prepare('SELECT monitor_id FROM incident_monitors WHERE incident_id = ?')
        .get(incident?.id)).toMatchObject({ monitor_id: 1 });

      db.prepare('UPDATE outages SET ended_at = ? WHERE id = ?').run(1700000060, outageId);
      expect(readIncident(db, outageId)).toMatchObject({
        status: 'resolved',
        resolved_at: 1700000060,
      });
      db.prepare('UPDATE outages SET last_error = ? WHERE id = ?').run('last error', outageId);
      const count = db.prepare('SELECT COUNT(*) AS count FROM incidents WHERE outage_id = ?')
        .get(outageId) as { count: number };
      expect(count.count).toBe(1);
    } finally {
      db.close();
    }
  });

  it('backfills historical outages and leaves manually reported incidents separate', () => {
    const db = createDatabase(false);
    try {
      db.prepare("INSERT INTO monitors (name, type, target) VALUES ('App', 'http', 'https://example.com')").run();
      db.prepare("INSERT INTO incidents (title, status, impact, started_at) VALUES ('Manual', 'investigating', 'major', 1700000000)").run();
      db.prepare("INSERT INTO outages (monitor_id, started_at, ended_at) VALUES (1, 1700000100, 1700000150)").run();
      db.exec(readFileSync(new URL('0035_outage_incident_bridge.sql', migrationsDir), 'utf8'));

      expect(readIncident(db, 1)).toMatchObject({
        status: 'resolved',
        started_at: 1700000100,
        resolved_at: 1700000150,
      });
      const manual = db.prepare("SELECT outage_id FROM incidents WHERE title = 'Manual'").get() as {
        outage_id: number | null;
      };
      expect(manual.outage_id).toBeNull();
    } finally {
      db.close();
    }
  });
});

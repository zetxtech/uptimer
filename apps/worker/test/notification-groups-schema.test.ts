import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { DatabaseSync } from './helpers/sqlite-d1';

describe('notification group migration', () => {
  it('creates group memberships and persistent queues with unique event keys', () => {
    const database = new DatabaseSync(':memory:');
    try {
      database.exec(
        readFileSync(
          new URL('../migrations/0018_notification_groups.sql', import.meta.url),
          'utf8',
        ),
      );
      database.exec(
        "INSERT INTO notification_groups(creation_token, name, created_at, updated_at) VALUES ('group', 'Operations', 1, 1)",
      );
      database.exec(
        "INSERT INTO notification_group_pending_events(group_id, monitor_id, event_key, event_type, payload_json, insert_token, created_at) VALUES (1, 1, 'event', 'monitor.down', '{}', 'first', 1)",
      );
      expect(() =>
        database.exec(
          "INSERT INTO notification_group_pending_events(group_id, monitor_id, event_key, event_type, payload_json, insert_token, created_at) VALUES (1, 1, 'event', 'monitor.down', '{}', 'second', 2)",
        ),
      ).toThrow();
      expect(
        database.prepare('SELECT COUNT(*) AS count FROM notification_group_pending_events').get(),
      ).toMatchObject({ count: 1 });
    } finally {
      database.close();
    }
  });
});

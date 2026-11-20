import { describe, expect, it } from 'vitest';

import { claimNotificationDelivery, finalizeNotificationDelivery } from '../src/notify/dedupe';
import { createFakeD1Database } from './helpers/fake-d1';

describe('notify/dedupe', () => {
  it('claims a notification slot when insert changes a row', async () => {
    const db = createFakeD1Database([
      {
        match: 'insert or ignore into notification_deliveries',
        run: () => ({ meta: { changes: 1 } }),
      },
    ]);

    await expect(claimNotificationDelivery(db, 'monitor:1:down:100', 7, 100)).resolves.toBe(true);
  });

  it('does not claim when the event+channel has already been inserted', async () => {
    const db = createFakeD1Database([
      {
        match: 'insert or ignore into notification_deliveries',
        run: () => ({ meta: { changes: 0 } }),
      },
    ]);

    await expect(claimNotificationDelivery(db, 'monitor:1:down:100', 7, 100)).resolves.toBe(false);
  });

  it('reclaims an old failed delivery when retries are enabled', async () => {
    let retryArgs: unknown[] = [];
    const db = createFakeD1Database([
      { match: 'insert or ignore into notification_deliveries', run: () => 0 },
      {
        match: 'update notification_deliveries',
        run: (args) => {
          retryArgs = args;
          return 1;
        },
      },
    ]);

    await expect(claimNotificationDelivery(db, 'probe:cn:offline:1', 7, 500, true)).resolves.toBe(
      true,
    );
    expect(retryArgs).toEqual(['probe:cn:offline:1', 7, 500, null, null, 0]);
  });

  it('stores the event type and payload so a failed delivery can be retried later', async () => {
    let insertArgs: unknown[] = [];
    const db = createFakeD1Database([
      {
        match: 'insert or ignore into notification_deliveries',
        run: (args) => {
          insertArgs = args;
          return 1;
        },
      },
    ]);

    await claimNotificationDelivery(db, 'monitor:1:down:100', 7, 100, false, {
      eventType: 'monitor.down',
      payload: { event: 'monitor.down', monitor: { id: 1 } },
    });

    expect(insertArgs).toEqual([
      'monitor:1:down:100',
      7,
      100,
      'monitor.down',
      JSON.stringify({ event: 'monitor.down', monitor: { id: 1 } }),
    ]);
  });

  it('bypasses the retry throttle when the retry is manual', async () => {
    let retryArgs: unknown[] = [];
    const db = createFakeD1Database([
      { match: 'insert or ignore into notification_deliveries', run: () => 0 },
      {
        match: 'update notification_deliveries',
        run: (args) => {
          retryArgs = args;
          return 1;
        },
      },
    ]);

    await expect(
      claimNotificationDelivery(db, 'monitor:1:down:100', 7, 500, true, { force: true }),
    ).resolves.toBe(true);
    expect(retryArgs).toEqual(['monitor:1:down:100', 7, 500, null, null, 1]);
  });

  it('falls back to unclaimed when insert metadata is missing', async () => {
    const db = createFakeD1Database([
      {
        match: 'insert or ignore into notification_deliveries',
        run: () => ({ success: true }),
      },
    ]);

    await expect(claimNotificationDelivery(db, 'monitor:2:down:101', 9, 101)).resolves.toBe(false);
  });

  it('finalizes a claimed notification with the delivery outcome', async () => {
    let args: unknown[] | null = null;
    const db = createFakeD1Database([
      {
        match: 'update notification_deliveries',
        run: (boundArgs) => {
          args = boundArgs;
          return { meta: { changes: 1 } };
        },
      },
    ]);

    await finalizeNotificationDelivery(
      db,
      'monitor:1:up:200',
      3,
      {
        status: 'failed',
        httpStatus: 502,
        error: 'bad gateway',
      },
      1000,
    );

    expect(args).toEqual(['failed', 502, 'bad gateway', 'monitor:1:up:200', 3, 1000]);
  });
});

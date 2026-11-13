import type { Env } from '../env';

const GROUP_LEASE_SECONDS = 120;
const GROUP_LEASE_NAME = 'notification_groups';

// Runs the notification-group side of the minute cron:
// 1. flush quiet-period (debounce) batches whose timer expired
// 2. send daily/weekly digests that are due and have failing monitors
//
// A short lease keeps overlapping cron invocations from doing the same work twice; even if the
// lease is lost the queue claiming plus the (event_key, channel_id) delivery log prevent
// duplicate messages.
export async function runNotificationGroupSchedules(
  env: Env,
  ctx: ExecutionContext,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const { acquireLease, releaseLease } = await import('./lock');
  if (!(await acquireLease(env.DB, GROUP_LEASE_NAME, now, GROUP_LEASE_SECONDS))) {
    return;
  }

  try {
    const { flushDueNotificationGroups, runDueNotificationGroupDigests } =
      await import('../notify/groups');

    await flushDueNotificationGroups(env, now);
    await runDueNotificationGroupDigests(env, now);
  } finally {
    await releaseLease(env.DB, GROUP_LEASE_NAME, now + GROUP_LEASE_SECONDS);
  }
}

import { afterEach, describe, expect, it, vi } from 'vitest';

const runDailyRollup = vi.fn();
const runRetention = vi.fn();
const runScheduledTick = vi.fn();
const runProbeHealthChecks = vi.fn();
const runNotificationGroupSchedules = vi.fn();
const runNotificationRetries = vi.fn();
const runExpiryChecks = vi.fn();

vi.mock('../src/scheduler/daily-rollup', () => ({
  runDailyRollup,
}));

vi.mock('../src/scheduler/retention', () => ({
  runRetention,
}));

vi.mock('../src/scheduler/scheduled', () => ({
  runScheduledTick,
}));

vi.mock('../src/scheduler/probe-health', () => ({
  runProbeHealthChecks,
}));

vi.mock('../src/scheduler/notification-groups', () => ({
  runNotificationGroupSchedules,
}));

vi.mock('../src/scheduler/notification-retries', () => ({
  runNotificationRetries,
}));

vi.mock('../src/scheduler/expiry-checks', () => ({
  runExpiryChecks,
}));

import worker from '../src/index';
import type { Env } from '../src/env';

function createExecutionContext(): {
  ctx: ExecutionContext;
  waitUntil: ReturnType<typeof vi.fn>;
  waitUntilPromises: Promise<unknown>[];
} {
  const waitUntilPromises: Promise<unknown>[] = [];
  const waitUntil = vi.fn((promise: Promise<unknown>) => {
    waitUntilPromises.push(promise);
  });
  return {
    ctx: { waitUntil } as unknown as ExecutionContext,
    waitUntil,
    waitUntilPromises,
  };
}

describe('worker scheduled dispatch', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('runs only the minute scheduler for ordinary consolidated cron ticks', async () => {
    const controller = {
      cron: '* * * * *',
      scheduledTime: Date.UTC(2026, 1, 18, 0, 1, 0),
    } as ScheduledController;
    const env = {} as Env;
    const { ctx, waitUntil, waitUntilPromises } = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(runScheduledTick).toHaveBeenCalledWith(env, ctx);
    expect(runDailyRollup).not.toHaveBeenCalled();
    expect(runRetention).not.toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalledTimes(3);
    expect(runExpiryChecks).not.toHaveBeenCalled();
    expect(runProbeHealthChecks).toHaveBeenCalledWith(env, ctx);
    expect(runNotificationGroupSchedules).toHaveBeenCalledWith(env, ctx);
    expect(runNotificationRetries).toHaveBeenCalledWith(env);
  });

  it('queues daily rollup at UTC midnight on the consolidated minute cron', async () => {
    const controller = {
      cron: '* * * * *',
      scheduledTime: Date.UTC(2026, 1, 18, 0, 0, 0),
    } as ScheduledController;
    const env = {} as Env;
    const { ctx, waitUntil, waitUntilPromises } = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(runScheduledTick).toHaveBeenCalledWith(env, ctx);
    expect(waitUntil).toHaveBeenCalledTimes(5);
    expect(runDailyRollup).toHaveBeenCalledWith(env, controller, ctx);
    expect(runExpiryChecks).toHaveBeenCalledWith(env, ctx);
    expect(runRetention).not.toHaveBeenCalled();
    expect(runNotificationGroupSchedules).toHaveBeenCalledWith(env, ctx);
    expect(runNotificationRetries).toHaveBeenCalledWith(env);
  });

  it('queues retention at UTC 00:30 on the consolidated minute cron', async () => {
    const controller = {
      cron: '* * * * *',
      scheduledTime: Date.UTC(2026, 1, 18, 0, 30, 0),
    } as ScheduledController;
    const env = {} as Env;
    const { ctx, waitUntil, waitUntilPromises } = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(runScheduledTick).toHaveBeenCalledWith(env, ctx);
    expect(waitUntil).toHaveBeenCalledTimes(5);
    expect(runRetention).toHaveBeenCalledWith(env, controller);
    expect(runExpiryChecks).toHaveBeenCalledWith(env, ctx);
    expect(runDailyRollup).not.toHaveBeenCalled();
    expect(runNotificationGroupSchedules).toHaveBeenCalledWith(env, ctx);
    expect(runNotificationRetries).toHaveBeenCalledWith(env);
  });

  it('runs the expiry sweep every quarter hour without the daily jobs', async () => {
    const controller = {
      cron: '* * * * *',
      scheduledTime: Date.UTC(2026, 1, 18, 0, 45, 0),
    } as ScheduledController;
    const env = {} as Env;
    const { ctx, waitUntil, waitUntilPromises } = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(runExpiryChecks).toHaveBeenCalledWith(env, ctx);
    expect(runDailyRollup).not.toHaveBeenCalled();
    expect(runRetention).not.toHaveBeenCalled();
    expect(waitUntil).toHaveBeenCalledTimes(4);
  });

  it('keeps the legacy daily rollup cron compatible during trigger propagation', async () => {
    const controller = {
      cron: '0 0 * * *',
      scheduledTime: Date.UTC(2026, 1, 18, 0, 0, 0),
    } as ScheduledController;
    const env = {} as Env;
    const { ctx, waitUntil, waitUntilPromises } = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(runDailyRollup).toHaveBeenCalledWith(env, controller, ctx);
    expect(runRetention).not.toHaveBeenCalled();
    expect(runScheduledTick).not.toHaveBeenCalled();
  });

  it('keeps the legacy retention cron compatible during trigger propagation', async () => {
    const controller = {
      cron: '30 0 * * *',
      scheduledTime: Date.UTC(2026, 1, 18, 0, 30, 0),
    } as ScheduledController;
    const env = {} as Env;
    const { ctx, waitUntil, waitUntilPromises } = createExecutionContext();

    await worker.scheduled(controller, env, ctx);
    await Promise.all(waitUntilPromises);

    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(runRetention).toHaveBeenCalledWith(env, controller);
    expect(runDailyRollup).not.toHaveBeenCalled();
    expect(runScheduledTick).not.toHaveBeenCalled();
  });
});

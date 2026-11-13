import { describe, expect, it, vi } from 'vitest';

import { buildPostmortemPrompt, generatePostmortem } from '../src/monitor/postmortem';
import type { Env } from '../src/env';

const event = {
  monitorName: 'Homepage',
  monitorType: 'http',
  monitorTarget: 'https://example.com/healthz',
  startedAt: 1_760_000_000,
  endedAt: 1_760_000_900,
  initialError: 'Unexpected HTTP status: 404',
  lastError: 'Unexpected HTTP status: 404',
};

const checks = [
  {
    checked_at: 1_760_000_060,
    status: 'down',
    latency_ms: 641,
    http_status: 404,
    error: 'Unexpected HTTP status: 404',
    location: 'Europe',
  },
  {
    checked_at: 1_760_000_120,
    status: 'up',
    latency_ms: 210,
    http_status: 200,
    error: null,
    location: 'Europe',
  },
];

describe('event post-mortem', () => {
  it('builds a prompt that carries the monitor, window, and failed checks', () => {
    const prompt = buildPostmortemPrompt(event, checks);

    expect(prompt).toContain('Monitor: Homepage (http) — https://example.com/healthz');
    expect(prompt).toContain('Checks in window: 2 (1 failed)');
    expect(prompt).toContain('First error: Unexpected HTTP status: 404');
    expect(prompt).toContain(
      '- 2025-10-09 08:54:20 UTC · from Europe · HTTP 404 · Unexpected HTTP status: 404',
    );
    expect(prompt).toContain('one short paragraph');
  });

  it('omits the failure list when every check passed', () => {
    const prompt = buildPostmortemPrompt(event, [checks[1]!]);
    expect(prompt).toContain('Checks in window: 1 (0 failed)');
    expect(prompt).not.toContain('Failed checks:');
  });

  it('returns null without the Workers AI binding', async () => {
    const summary = await generatePostmortem({} as Env, event, checks);
    expect(summary).toBeNull();
  });

  it('generates and trims the summary through the binding', async () => {
    const run = vi
      .fn()
      .mockResolvedValue({ response: '  The site returned 404s for 15 minutes.  ' });
    const summary = await generatePostmortem({ AI: { run } } as unknown as Env, event, checks);

    expect(summary).toBe('The site returned 404s for 15 minutes.');
    expect(run).toHaveBeenCalledWith(
      '@cf/meta/llama-3.1-8b-instruct',
      expect.objectContaining({ prompt: expect.stringContaining('Monitor: Homepage') }),
    );
  });

  it('swallows binding failures so the incident page never breaks', async () => {
    const run = vi.fn().mockRejectedValue(new Error('AI unavailable'));
    const summary = await generatePostmortem({ AI: { run } } as unknown as Env, event, checks);
    expect(summary).toBeNull();
  });
});

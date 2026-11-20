import type { Env } from '../env';

export type PostmortemEvent = {
  monitorName: string;
  monitorType: string;
  monitorTarget: string;
  startedAt: number;
  endedAt: number | null;
  initialError: string | null;
  lastError: string | null;
};

export type PostmortemCheck = {
  checked_at: number;
  status: string;
  latency_ms: number | null;
  http_status: number | null;
  error: string | null;
  location: string | null;
};

/**
 * Workers AI is optional: the binding is absent in local development and on
 * accounts without Workers AI enabled, so callers treat `null` as "no summary".
 */
const MODEL = '@cf/meta/llama-3.1-8b-instruct';
const MAX_CHECKS_IN_PROMPT = 40;

function formatSeconds(seconds: number): string {
  return new Date(seconds * 1000).toISOString().replace('T', ' ').replace('.000Z', ' UTC');
}

export function buildPostmortemPrompt(event: PostmortemEvent, checks: PostmortemCheck[]): string {
  const problems = checks
    .filter((check) => check.status === 'down')
    .slice(0, MAX_CHECKS_IN_PROMPT)
    .map((check) => {
      const parts = [formatSeconds(check.checked_at)];
      if (check.location) parts.push(`from ${check.location}`);
      if (check.http_status !== null) parts.push(`HTTP ${check.http_status}`);
      if (check.error) parts.push(check.error.split('\n')[0] ?? check.error);
      return `- ${parts.join(' · ')}`;
    });

  const failureCount = checks.filter((check) => check.status === 'down').length;
  const window = `${formatSeconds(event.startedAt)} → ${
    event.endedAt === null ? 'ongoing' : formatSeconds(event.endedAt)
  }`;

  return [
    'You write concise incident post-mortems for an uptime monitoring tool.',
    'Summarise what happened in one short paragraph (2-3 sentences, plain prose, no headings, no bullet points).',
    'State the likely cause, how widespread it was, and whether it recovered.',
    '',
    `Monitor: ${event.monitorName} (${event.monitorType}) — ${event.monitorTarget}`,
    `Window: ${window}`,
    `Checks in window: ${checks.length} (${failureCount} failed)`,
    `First error: ${event.initialError ?? 'none recorded'}`,
    `Last error: ${event.lastError ?? 'none recorded'}`,
  ]
    .concat(problems.length > 0 ? ['', 'Failed checks:', ...problems] : [])
    .join('\n');
}

type AiBinding = {
  run: (model: string, input: { prompt: string; max_tokens?: number }) => Promise<unknown>;
};

function extractText(result: unknown): string | null {
  if (typeof result === 'string') return result.trim() || null;
  if (result && typeof result === 'object') {
    const record = result as Record<string, unknown>;
    for (const key of ['response', 'result', 'text', 'summary']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

/** Returns the generated summary, or null when Workers AI is unavailable. */
export async function generatePostmortem(
  env: Env,
  event: PostmortemEvent,
  checks: PostmortemCheck[],
): Promise<string | null> {
  const ai = (env as { AI?: AiBinding }).AI;
  if (!ai) return null;

  try {
    const result = await ai.run(MODEL, {
      prompt: buildPostmortemPrompt(event, checks),
      max_tokens: 320,
    });
    return extractText(result);
  } catch {
    return null;
  }
}

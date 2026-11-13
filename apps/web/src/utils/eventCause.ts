import type { EventCheckResult, MonitorEvent } from '../api/types';
import type { MessageKey } from '../i18n/messages';

type TFunction = (key: MessageKey, values?: Record<string, string | number>) => string;

type EventCauseSource = Pick<MonitorEvent, 'monitor_type' | 'initial_error' | 'last_error'>;

const STATUS_TEXT = /(?:status(?:\s+code)?[:\s]+|^http\s+)(\d{3})\b/i;

/**
 * Short cause shown in event rows and the detail card. The reference incident page
 * names the reason in a few words ("Status 525") instead of dumping the probe error,
 * so structured signals win over free text and free text is reduced to one line.
 */
export function eventCauseLabel(
  event: EventCauseSource,
  checks: EventCheckResult[],
  t: TFunction,
): string {
  const raw = (event.initial_error ?? event.last_error ?? '').trim();

  const failingCheck = checks.find((check) => check.status === 'down' && check.http_status != null);
  const statusFromCheck = failingCheck?.http_status ?? null;
  const statusFromText = STATUS_TEXT.exec(raw)?.[1];
  const statusCode =
    statusFromCheck ??
    (event.monitor_type === 'http' && statusFromText ? Number(statusFromText) : null);
  if (statusCode != null) return t('events.cause_status', { code: statusCode });

  if (!raw) return t('monitor_detail.unknown_error');
  if (/no heartbeat received/i.test(raw)) return t('events.cause_heartbeat');
  if (/timeout|timed out/i.test(raw)) return t('events.cause_timeout');
  if (/cannot connect|connection refused|proxy request failed|unable to connect/i.test(raw)) {
    return t('events.cause_connection');
  }
  if (/dns|name resolution|enotfound|getaddrinfo/i.test(raw)) return t('events.cause_dns');
  if (/\btls\b|\bssl\b|certificate/i.test(raw)) return t('events.cause_tls');

  const firstLine = raw.split('\n')[0]?.trim() ?? raw;
  const firstSentence = firstLine.split(/[.;]/)[0]?.trim() || firstLine;
  return firstSentence.length <= 60 ? firstSentence : `${firstSentence.slice(0, 59).trimEnd()}…`;
}

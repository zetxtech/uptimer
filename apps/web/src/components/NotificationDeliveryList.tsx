import { useMemo } from 'react';

import type { NotificationDelivery } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { formatDateTime, formatRelativeTime } from '../utils/datetime';
import { EmptyState } from './AdminSection';
import { Badge, Button } from './ui';

function eventLabel(delivery: NotificationDelivery): string {
  if (delivery.event_type) return delivery.event_type;
  const prefix = delivery.event_key.split(':')[0];
  return prefix ? prefix : delivery.event_key;
}

export function NotificationDeliveryList({
  deliveries,
  search,
  timeZone,
  onRetry,
  retryingId,
}: {
  deliveries: NotificationDelivery[];
  search: string;
  timeZone: string;
  onRetry: (delivery: NotificationDelivery) => void;
  retryingId: number | null;
}) {
  const { locale, t } = useI18n();

  const matches = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase();
    if (!needle) return deliveries;
    return deliveries.filter((delivery) =>
      [delivery.channel_name, eventLabel(delivery), delivery.status, delivery.error]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle),
    );
  }, [deliveries, search]);

  if (matches.length === 0) {
    return (
      <div className="ui-panel">
        <EmptyState
          icon="inbox"
          title={t('notification_delivery.empty_title')}
          description={t('notification_delivery.empty_help')}
        />
      </div>
    );
  }

  return (
    <div className="ui-panel overflow-hidden">
      <div className="hidden grid-cols-[11rem_10rem_9rem_6rem_1fr_5.5rem] gap-3 border-b border-line px-4 py-2.5 text-[13px] text-ink-2 md:grid">
        <span>{t('notification_delivery.col_time')}</span>
        <span>{t('notification_delivery.col_channel')}</span>
        <span>{t('notification_delivery.col_event')}</span>
        <span>{t('notification_delivery.col_status')}</span>
        <span>{t('notification_delivery.col_detail')}</span>
        <span />
      </div>
      <div className="divide-y divide-line-soft">
        {matches.map((delivery) => (
          <div
            key={delivery.id}
            className="grid gap-2 px-4 py-3 text-[13px] md:grid-cols-[11rem_10rem_9rem_6rem_1fr_5.5rem] md:items-center md:gap-3"
          >
            <span
              className="text-ink-2"
              title={formatDateTime(delivery.created_at, timeZone, locale)}
            >
              {formatRelativeTime(delivery.created_at, locale)}
            </span>
            <span className="truncate text-ink" title={delivery.channel_name ?? undefined}>
              {delivery.channel_name ?? `#${delivery.channel_id}`}
            </span>
            <span className="truncate text-ink-2" title={delivery.event_type ?? delivery.event_key}>
              {eventLabel(delivery)}
            </span>
            <span>
              <Badge variant={delivery.status === 'success' ? 'up' : 'down'}>
                {delivery.status === 'success'
                  ? t('notification_delivery.status_success')
                  : t('notification_delivery.status_failed')}
              </Badge>
            </span>
            <span className="min-w-0 truncate text-ink-2" title={delivery.error ?? undefined}>
              {delivery.error ?? '-'}
              {delivery.status === 'failed' && delivery.attempts > 0 ? (
                <span className="ml-2 text-ink-3">
                  {t('notification_delivery.attempts', { count: delivery.attempts })}
                </span>
              ) : null}
            </span>
            <span className="flex md:justify-end">
              {delivery.can_retry ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={retryingId === delivery.id}
                  aria-busy={retryingId === delivery.id}
                  onClick={() => onRetry(delivery)}
                >
                  {retryingId === delivery.id
                    ? t('notification_delivery.retrying')
                    : t('notification_delivery.retry')}
                </Button>
              ) : null}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

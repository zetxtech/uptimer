import { useEffect, useState } from 'react';

import type { MaintenanceWindow, NotificationChannel, NotificationGroup } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { formatDateTime } from '../utils/datetime';
import { EmptyState } from './AdminSection';
import { MenuItem, RowMenu } from './MonitorList';
import { Badge, INPUT_CLASS, cn } from './ui';

const EDIT_ICON =
  'm16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10';
const DELETE_ICON =
  'm14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0';

function ResourceIcon({ path }: { path: string }) {
  return (
    <svg
      className="h-5 w-5 shrink-0 text-ink-2"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={path} />
    </svg>
  );
}

export function AdminSearchField({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <div className="relative w-full sm:w-[265px]">
      <svg
        className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
        />
      </svg>
      <input
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={label}
        aria-label={label}
        className={cn(INPUT_CLASS, 'ui-compact ui-search')}
      />
    </div>
  );
}

function channelDestination(channel: NotificationChannel): string {
  const config = channel.config_json;
  if (config.preset === 'telegram') return config.chat_id;
  if (config.preset === 'bark') return config.server_url;
  if (config.preset === 'smtp' || config.preset === 'resend') return config.to.join(', ');
  return config.url;
}

export function NotificationChannelList({
  channels,
  search,
  onEdit,
  onDelete,
  onTest,
  testingId,
  testPending,
  deletePending,
}: {
  channels: NotificationChannel[];
  search: string;
  onEdit: (channel: NotificationChannel) => void;
  onDelete: (channel: NotificationChannel) => void;
  onTest: (channel: NotificationChannel) => void;
  testingId: number | null;
  testPending: boolean;
  deletePending: boolean;
}) {
  const { t } = useI18n();
  const matches = channels.filter((channel) => {
    const state = t(channel.is_active ? 'notification_form.enabled' : 'common.inactive');
    return [
      channel.name,
      channel.config_json.preset,
      channel.type,
      channelDestination(channel),
      state,
    ]
      .join(' ')
      .toLocaleLowerCase()
      .includes(search.trim().toLocaleLowerCase());
  });

  return (
    <div className="ui-resource-list">
      <div className="ui-resource-grid ui-resource-head" aria-hidden>
        <span>{t('common.name')}</span>
        <span className="hidden lg:block">{t('common.target')}</span>
        <span className="hidden sm:block">{t('common.state')}</span>
        <span />
      </div>
      <div className="divide-y divide-line">
        {matches.map((channel) => (
          <div key={channel.id} className="ui-resource-grid ui-resource-row">
            <button
              type="button"
              onClick={() => onEdit(channel)}
              className="flex min-w-0 items-center gap-3 text-left"
            >
              <ResourceIcon path="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{channel.name}</span>
                <span className="mt-0.5 block truncate text-xs text-ink-2">
                  {channel.config_json.preset === 'custom' || !channel.config_json.preset
                    ? 'Webhook'
                    : channel.config_json.preset === 'telegram'
                      ? t('notification_form.preset_telegram')
                      : channel.config_json.preset.toUpperCase()}
                  <span className="lg:hidden"> · {channelDestination(channel)}</span>
                </span>
                <span className="mt-1 block text-xs text-ink-2 sm:hidden">
                  {t(channel.is_active ? 'notification_form.enabled' : 'common.inactive')}
                </span>
              </span>
            </button>
            <span
              className="hidden truncate text-ink-2 lg:block"
              title={channelDestination(channel)}
            >
              {channelDestination(channel)}
            </span>
            <div className="hidden sm:block">
              <Badge variant={channel.is_active ? 'up' : 'unknown'}>
                {t(channel.is_active ? 'notification_form.enabled' : 'common.inactive')}
              </Badge>
            </div>
            <RowMenu label={`${t('common.actions')}: ${channel.name}`}>
              {(close) => (
                <>
                  <MenuItem
                    icon="m3 14.25 9.75-12-1.5 7.5H21l-9.75 12 1.5-7.5H3Z"
                    disabled={testPending}
                    onClick={() => {
                      close();
                      onTest(channel);
                    }}
                  >
                    {testingId === channel.id ? t('common.testing') : t('common.test')}
                  </MenuItem>
                  <MenuItem
                    icon={EDIT_ICON}
                    onClick={() => {
                      close();
                      onEdit(channel);
                    }}
                  >
                    {t('common.edit')}
                  </MenuItem>
                  <div className="my-1 border-t border-line-soft" />
                  <MenuItem
                    icon={DELETE_ICON}
                    tone="danger"
                    disabled={deletePending}
                    onClick={() => {
                      close();
                      onDelete(channel);
                    }}
                  >
                    {t('common.delete')}
                  </MenuItem>
                </>
              )}
            </RowMenu>
          </div>
        ))}
      </div>
      {matches.length === 0 && (
        <EmptyState
          className="border-0"
          icon="bell"
          title={t(
            channels.length
              ? 'admin_dashboard.no_search_results'
              : 'admin_dashboard.no_channels_yet',
          )}
        />
      )}
    </div>
  );
}

export function NotificationGroupList({
  groups,
  search,
  onEdit,
  onDelete,
  deletePending,
}: {
  groups: NotificationGroup[];
  search: string;
  onEdit: (group: NotificationGroup) => void;
  onDelete: (group: NotificationGroup) => void;
  deletePending: boolean;
}) {
  const { t } = useI18n();
  const matches = groups.filter((group) =>
    group.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
  );
  return (
    <div className="ui-resource-list">
      <div className="ui-resource-grid ui-resource-head" aria-hidden>
        <span>{t('common.name')}</span>
        <span className="hidden lg:block">{t('admin_dashboard.group_scope_column')}</span>
        <span className="hidden sm:block">{t('admin_dashboard.group_mode_column')}</span>
        <span />
      </div>
      <div className="divide-y divide-line">
        {matches.map((group) => {
          const scope = t('admin_dashboard.group_scope_summary', {
            monitors: group.monitor_ids.length,
            channels: group.channel_ids.length,
          });
          const mode =
            group.debounce_seconds > 0
              ? t('admin_dashboard.group_mode_debounce', { seconds: group.debounce_seconds })
              : t(
                  group.immediate_enabled
                    ? 'admin_dashboard.group_mode_immediate'
                    : 'admin_dashboard.group_mode_events_off',
                );
          return (
            <div key={group.id} className="ui-resource-grid ui-resource-row">
              <button
                type="button"
                onClick={() => onEdit(group)}
                className="flex min-w-0 items-center gap-3 text-left"
              >
                <ResourceIcon path="m3 7.5 9-5.25 9 5.25-9 5.25L3 7.5Zm0 4.5 9 5.25L21 12M3 16.5l9 5.25 9-5.25" />
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{group.name}</span>
                  <span
                    className={cn(
                      'mt-0.5 block text-xs text-ink-2',
                      group.is_active && 'lg:hidden',
                    )}
                  >
                    {group.is_active ? scope : t('common.inactive')}
                  </span>
                  <span className="mt-1 block text-xs text-ink-2 sm:hidden">{mode}</span>
                </span>
              </button>
              <span className="hidden text-ink-2 lg:block">{scope}</span>
              <div className="hidden space-y-1 text-xs text-ink-2 sm:block">
                <div>{mode}</div>
                {group.digest_interval !== 'none' && (
                  <div>
                    {t(
                      group.digest_interval === 'daily'
                        ? 'notification_group.digest_daily'
                        : 'notification_group.digest_weekly',
                    )}
                  </div>
                )}
              </div>
              <RowMenu label={`${t('common.actions')}: ${group.name}`}>
                {(close) => (
                  <>
                    <MenuItem
                      icon={EDIT_ICON}
                      onClick={() => {
                        close();
                        onEdit(group);
                      }}
                    >
                      {t('common.edit')}
                    </MenuItem>
                    <div className="my-1 border-t border-line-soft" />
                    <MenuItem
                      icon={DELETE_ICON}
                      tone="danger"
                      disabled={deletePending}
                      onClick={() => {
                        close();
                        onDelete(group);
                      }}
                    >
                      {t('common.delete')}
                    </MenuItem>
                  </>
                )}
              </RowMenu>
            </div>
          );
        })}
      </div>
      {matches.length === 0 && (
        <EmptyState
          className="border-0"
          icon="inbox"
          title={t(
            groups.length ? 'admin_dashboard.no_search_results' : 'admin_dashboard.no_groups_yet',
          )}
          description={groups.length ? undefined : t('admin_dashboard.no_groups_help')}
        />
      )}
    </div>
  );
}

export function MaintenanceList({
  windows,
  monitorNames,
  search,
  timeZone,
  onEdit,
  onDelete,
  deletePending,
}: {
  windows: MaintenanceWindow[];
  monitorNames: Map<number, string>;
  search: string;
  timeZone: string;
  onEdit: (window: MaintenanceWindow) => void;
  onDelete: (window: MaintenanceWindow) => void;
  deletePending: boolean;
}) {
  const { locale, t } = useI18n();
  const [filter, setFilter] = useState<'all' | 'active' | 'upcoming' | 'ended'>('all');
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const nextBoundary = Math.min(
      ...windows
        .flatMap((window) => [window.starts_at, window.ends_at])
        .filter((time) => time > now),
    );
    if (!Number.isFinite(nextBoundary)) return;
    const timer = window.setTimeout(
      () => setNow(Math.floor(Date.now() / 1000)),
      Math.min(nextBoundary * 1000 - Date.now(), 2147483647),
    );
    return () => window.clearTimeout(timer);
  }, [now, windows]);
  const stateFor = (window: MaintenanceWindow) =>
    window.starts_at > now ? 'upcoming' : window.ends_at > now ? 'active' : 'ended';
  const namesFor = (window: MaintenanceWindow) =>
    window.monitor_ids.map((id) => monitorNames.get(id) ?? `#${id}`).join(', ');
  const matches = windows.filter(
    (window) =>
      (filter === 'all' || stateFor(window) === filter) &&
      [window.title, window.message, namesFor(window), t(`common.${stateFor(window)}`)]
        .join(' ')
        .toLocaleLowerCase()
        .includes(search.trim().toLocaleLowerCase()),
  );
  const monthFormatter = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    timeZone,
  });
  const months = new Map<string, MaintenanceWindow[]>();
  for (const window of [...matches].sort((a, b) => b.starts_at - a.starts_at)) {
    const month = monthFormatter.format(new Date(window.starts_at * 1000));
    const entries = months.get(month);
    if (entries) entries.push(window);
    else months.set(month, [window]);
  }
  return (
    <>
      <div className="flex flex-wrap gap-x-6 border-b border-line">
        {(['all', 'active', 'upcoming', 'ended'] as const).map((value) => (
          <button
            key={value}
            type="button"
            className="ui-tab"
            data-active={filter === value}
            aria-current={filter === value ? 'page' : undefined}
            onClick={() => setFilter(value)}
          >
            {t(value === 'all' ? 'admin_dashboard.all_maintenance' : `common.${value}`)}
          </button>
        ))}
      </div>
      <div className="space-y-6">
        {[...months].map(([month, entries]) => (
          <section key={month} aria-label={month}>
            <h2 className="mb-3 text-[13px] font-medium text-ink-2">{month}</h2>
            <div className="ui-resource-list">
              <div className="ui-resource-grid ui-resource-head" aria-hidden>
                <span>{t('common.title_label')}</span>
                <span className="hidden lg:block">{t('common.monitors')}</span>
                <span className="hidden sm:block">{t('common.state')}</span>
                <span />
              </div>
              <div className="divide-y divide-line">
                {entries.map((window) => (
                  <div key={window.id} className="ui-resource-grid ui-resource-row">
                    <button
                      type="button"
                      className="min-w-0 text-left"
                      onClick={() => onEdit(window)}
                    >
                      <span className="block truncate font-semibold text-ink">{window.title}</span>
                      <span className="mt-1 block text-xs text-ink-2 tabular-nums">
                        {formatDateTime(window.starts_at, timeZone, locale)} –{' '}
                        {formatDateTime(window.ends_at, timeZone, locale)}
                      </span>
                      <span className="mt-1 block truncate text-xs text-ink-2 lg:hidden">
                        {namesFor(window)}
                      </span>
                      <span className="mt-1 block text-xs text-ink-2 sm:hidden">
                        {t(`common.${stateFor(window)}`)}
                      </span>
                    </button>
                    <span className="hidden truncate text-ink-2 lg:block" title={namesFor(window)}>
                      {namesFor(window)}
                    </span>
                    <div className="hidden sm:block">
                      <Badge
                        variant={
                          stateFor(window) === 'active'
                            ? 'maintenance'
                            : stateFor(window) === 'upcoming'
                              ? 'paused'
                              : 'unknown'
                        }
                      >
                        {t(`common.${stateFor(window)}`)}
                      </Badge>
                    </div>
                    <RowMenu label={`${t('common.actions')}: ${window.title}`}>
                      {(close) => (
                        <>
                          <MenuItem
                            icon={EDIT_ICON}
                            onClick={() => {
                              close();
                              onEdit(window);
                            }}
                          >
                            {t('common.edit')}
                          </MenuItem>
                          <div className="my-1 border-t border-line-soft" />
                          <MenuItem
                            icon={DELETE_ICON}
                            tone="danger"
                            disabled={deletePending}
                            onClick={() => {
                              close();
                              onDelete(window);
                            }}
                          >
                            {t('common.delete')}
                          </MenuItem>
                        </>
                      )}
                    </RowMenu>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ))}
        {matches.length === 0 && (
          <EmptyState
            className="border-0"
            icon="wrench"
            title={t(
              windows.length
                ? 'admin_dashboard.no_search_results'
                : 'admin_dashboard.no_maintenance_yet',
            )}
            description={windows.length ? undefined : t('admin_dashboard.no_maintenance_help')}
          />
        )}
      </div>
    </>
  );
}

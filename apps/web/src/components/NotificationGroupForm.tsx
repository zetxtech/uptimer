import { useState } from 'react';
import type {
  AdminMonitor,
  NotificationChannel,
  NotificationDigestInterval,
  NotificationGroup,
  NotificationGroupInput,
} from '../api/types';
import { useI18n } from '../app/I18nContext';
import { Select } from './Select';
import { CheckboxRow, FormPageShell, FormRow } from './formPage';
import { Button, FIELD_HELP_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS, SELECT_CLASS, cn } from './ui';

interface NotificationGroupFormProps {
  group?: NotificationGroup | undefined;
  monitors: AdminMonitor[];
  channels: NotificationChannel[];
  onSubmit: (data: NotificationGroupInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | undefined;
}

function toDigestInterval(value: string): NotificationDigestInterval {
  return value === 'daily' || value === 'weekly' ? value : 'none';
}

function toggleId(ids: number[], id: number): number[] {
  return ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id];
}

export function NotificationGroupForm({
  group,
  monitors,
  channels,
  onSubmit,
  onCancel,
  isLoading,
  error,
}: NotificationGroupFormProps) {
  const { t } = useI18n();
  const [name, setName] = useState(group?.name ?? '');
  const [isActive, setIsActive] = useState(group?.is_active ?? true);
  const [immediateEnabled, setImmediateEnabled] = useState(group?.immediate_enabled ?? true);
  const [debounceSeconds, setDebounceSeconds] = useState(String(group?.debounce_seconds ?? 0));
  const [digestInterval, setDigestInterval] = useState<NotificationDigestInterval>(
    group?.digest_interval ?? 'none',
  );
  const [monitorIds, setMonitorIds] = useState<number[]>(group?.monitor_ids ?? []);
  const [channelIds, setChannelIds] = useState<number[]>(group?.channel_ids ?? []);

  const parsedDebounce = Number(debounceSeconds);
  const debounceValid =
    Number.isInteger(parsedDebounce) && parsedDebounce >= 0 && parsedDebounce <= 86400;
  const [attempted, setAttempted] = useState(false);

  const issues: string[] = [];
  if (name.trim().length === 0) issues.push(t('notification_group.issue_name'));
  if (channelIds.length === 0) issues.push(t('notification_group.issue_channels'));
  if (monitors.length === 0) issues.push(t('notification_group.issue_monitors'));
  if (!debounceValid) issues.push(t('notification_group.issue_debounce'));

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setAttempted(true);
    if (issues.length > 0) return;

    onSubmit({
      name: name.trim(),
      is_active: isActive,
      immediate_enabled: immediateEnabled,
      debounce_seconds: parsedDebounce,
      digest_interval: digestInterval,
      monitor_ids: monitorIds,
      channel_ids: channelIds,
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate aria-labelledby="admin-modal-title">
      <FormPageShell
        backLabel={t('admin_dashboard.tab.notifications')}
        onBack={onCancel}
        backDisabled={isLoading}
        title={group ? t('admin_dashboard.edit_group') : t('admin_dashboard.create_group')}
        error={error}
        errorTitle={group ? t('form.error_save') : t('form.error_create')}
        issues={attempted ? issues : []}
        primaryAction={
          <Button type="submit" disabled={isLoading} className="min-w-40">
            {isLoading ? t('common.saving') : group ? t('common.update') : t('common.create')}
          </Button>
        }
      >
        <FormRow
          label={t('notification_group.section_group')}
          description={t('notification_group.section_group_hint')}
        >
          <div>
            <label className={FIELD_LABEL_CLASS}>{t('notification_group.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <CheckboxRow
            id="notification-group-active"
            label={t('notification_group.is_active')}
            help={t('notification_group.is_active_help')}
            checked={isActive}
            onChange={setIsActive}
          />
        </FormRow>

        <FormRow
          label={t('notification_group.mode_legend')}
          description={t('notification_group.section_mode_hint')}
        >
          <CheckboxRow
            id="notification-group-immediate"
            label={t('notification_group.immediate')}
            help={t('notification_group.immediate_help')}
            checked={immediateEnabled}
            onChange={setImmediateEnabled}
          />

          <div>
            <label className={FIELD_LABEL_CLASS}>{t('notification_group.debounce_seconds')}</label>
            <div className="max-w-[7rem]">
              <input
                type="number"
                min={0}
                max={86400}
                value={debounceSeconds}
                onChange={(event) => setDebounceSeconds(event.target.value)}
                className={cn(INPUT_CLASS, 'font-mono tabular-nums')}
              />
            </div>
            {!debounceValid && (
              <div className="mt-1 text-xs text-red-600 dark:text-red-400">
                {t('notification_group.debounce_invalid')}
              </div>
            )}
            <div className={FIELD_HELP_CLASS}>{t('notification_group.debounce_help')}</div>
          </div>

          <div>
            <label className={FIELD_LABEL_CLASS}>{t('notification_group.digest_interval')}</label>
            <Select
              value={digestInterval}
              onChange={(next) => setDigestInterval(toDigestInterval(next))}
              className={cn(SELECT_CLASS, 'max-w-[12rem]')}
            >
              <option value="none">{t('notification_group.digest_none')}</option>
              <option value="daily">{t('notification_group.digest_daily')}</option>
              <option value="weekly">{t('notification_group.digest_weekly')}</option>
            </Select>
            <div className={FIELD_HELP_CLASS}>{t('notification_group.digest_help')}</div>
          </div>
        </FormRow>

        <FormRow
          label={t('notification_group.monitors')}
          description={t('notification_group.section_monitors_hint')}
        >
          {monitors.length === 0 ? (
            <div className={FIELD_HELP_CLASS}>{t('notification_group.no_monitors')}</div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {monitors.map((monitor) => (
                <CheckboxRow
                  key={monitor.id}
                  id={`notification-group-monitor-${monitor.id}`}
                  label={
                    monitor.group_name ? `${monitor.name} · ${monitor.group_name}` : monitor.name
                  }
                  checked={monitorIds.includes(monitor.id)}
                  onChange={() => setMonitorIds((previous) => toggleId(previous, monitor.id))}
                />
              ))}
            </div>
          )}
          <div className={FIELD_HELP_CLASS}>
            {t('notification_group.monitors_help', { count: monitorIds.length })}
          </div>
        </FormRow>

        <FormRow
          label={t('notification_group.channels')}
          description={t('notification_group.section_channels_hint')}
        >
          {channels.length === 0 ? (
            <div className={FIELD_HELP_CLASS}>{t('notification_group.no_channels')}</div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {channels.map((channel) => (
                <CheckboxRow
                  key={channel.id}
                  id={`notification-group-channel-${channel.id}`}
                  label={channel.name}
                  checked={channelIds.includes(channel.id)}
                  onChange={() => setChannelIds((previous) => toggleId(previous, channel.id))}
                />
              ))}
            </div>
          )}
          <div className={FIELD_HELP_CLASS}>
            {t('notification_group.channels_help', { count: channelIds.length })}
          </div>
        </FormRow>
      </FormPageShell>
    </form>
  );
}

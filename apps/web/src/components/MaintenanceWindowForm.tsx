import { useMemo, useState } from 'react';
import type {
  CreateMaintenanceWindowInput,
  MaintenanceWindow,
  PatchMaintenanceWindowInput,
} from '../api/types';
import { useI18n } from '../app/I18nContext';
import { Markdown } from './Markdown';
import { CheckboxRow, FormPageShell, FormRow } from './formPage';
import { Button, FIELD_HELP_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS, TEXTAREA_CLASS } from './ui';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDatetimeLocal(unixSeconds: number): string {
  const d = new Date(unixSeconds * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function fromDatetimeLocal(value: string): number | null {
  if (!value) return null;
  const d = new Date(value);
  const ms = d.getTime();
  if (!Number.isFinite(ms)) return null;
  return Math.floor(ms / 1000);
}

const inputClass = INPUT_CLASS;
const textareaClass = TEXTAREA_CLASS;
const labelClass = FIELD_LABEL_CLASS;

type CommonProps = {
  onCancel: () => void;
  isLoading?: boolean;
  error?: string | undefined;
  monitors: Array<{ id: number; name: string }>;
};
type CreateProps = CommonProps & {
  window?: undefined;
  onSubmit: (input: CreateMaintenanceWindowInput) => void;
};
type EditProps = CommonProps & {
  window: MaintenanceWindow;
  onSubmit: (input: PatchMaintenanceWindowInput) => void;
};

export function MaintenanceWindowForm(props: CreateProps | EditProps) {
  const { window, onCancel, isLoading, error, monitors } = props;
  const { t } = useI18n();

  const [title, setTitle] = useState(window?.title ?? '');
  const [message, setMessage] = useState(window?.message ?? '');
  const [startsAt, setStartsAt] = useState(window ? toDatetimeLocal(window.starts_at) : '');
  const [endsAt, setEndsAt] = useState(window ? toDatetimeLocal(window.ends_at) : '');
  const [selectedMonitorIds, setSelectedMonitorIds] = useState<number[]>(window?.monitor_ids ?? []);

  const [attempted, setAttempted] = useState(false);
  const normalized = useMemo(() => message.trim(), [message]);
  const parsed = useMemo(
    () => ({ starts_at: fromDatetimeLocal(startsAt), ends_at: fromDatetimeLocal(endsAt) }),
    [startsAt, endsAt],
  );

  const timeError =
    parsed.starts_at === null || parsed.ends_at === null
      ? t('maintenance_form.time_required')
      : parsed.starts_at >= parsed.ends_at
        ? t('maintenance_form.start_before_end')
        : null;
  const monitorsError =
    monitors.length === 0
      ? t('maintenance_form.no_monitors')
      : selectedMonitorIds.length === 0
        ? t('maintenance_form.select_at_least_one')
        : null;

  const issues: string[] = [];
  if (title.trim().length === 0) issues.push(t('maintenance_form.issue_title'));
  if (timeError) issues.push(timeError);
  if (monitorsError) issues.push(monitorsError);

  return (
    <form
      noValidate
      aria-labelledby="admin-modal-title"
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        if (
          timeError ||
          parsed.starts_at === null ||
          parsed.ends_at === null ||
          selectedMonitorIds.length === 0
        )
          return;
        const base = {
          title: title.trim(),
          starts_at: parsed.starts_at,
          ends_at: parsed.ends_at,
          monitor_ids: selectedMonitorIds,
        };
        if (props.window) props.onSubmit({ ...base, message: normalized || null });
        else props.onSubmit(normalized ? { ...base, message: normalized } : base);
      }}
    >
      <FormPageShell
        backLabel={t('admin_dashboard.tab.maintenance')}
        onBack={onCancel}
        backDisabled={isLoading}
        title={
          window ? t('admin_dashboard.edit_maintenance') : t('admin_dashboard.create_maintenance')
        }
        error={error}
        errorTitle={window ? t('form.error_save') : t('form.error_create')}
        issues={attempted ? issues : []}
        primaryAction={
          <Button type="submit" disabled={isLoading} className="min-w-40">
            {isLoading ? t('common.saving') : window ? t('common.save') : t('common.create')}
          </Button>
        }
      >
        <FormRow
          label={t('maintenance_form.section_window')}
          description={t('maintenance_form.section_window_hint')}
        >
          <div>
            <label className={labelClass}>{t('maintenance_form.title')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
              placeholder={t('maintenance_form.title_placeholder')}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>{t('maintenance_form.starts_at')}</label>
              <input
                type="datetime-local"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>{t('maintenance_form.ends_at')}</label>
              <input
                type="datetime-local"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                className={inputClass}
              />
            </div>
          </div>
          {timeError && (
            <div className="text-[12px] text-red-500 dark:text-red-400">{timeError}</div>
          )}

          <div>
            <label className={labelClass}>{t('maintenance_form.message')}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className={textareaClass}
              placeholder={t('maintenance_form.message_placeholder')}
            />
            {normalized && (
              <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
                <Markdown text={normalized} />
              </div>
            )}
          </div>
        </FormRow>

        <FormRow
          label={t('maintenance_form.affected_monitors')}
          description={t('maintenance_form.section_monitors_hint')}
        >
          {monitors.length === 0 ? (
            <div className="text-[13px] text-ink-2 dark:text-ink-3">
              {t('maintenance_form.no_monitors')}
            </div>
          ) : (
            <div className="max-h-56 space-y-2 overflow-y-auto">
              {monitors.map((m) => (
                <CheckboxRow
                  key={m.id}
                  id={`maintenance-monitor-${m.id}`}
                  label={m.name}
                  checked={selectedMonitorIds.includes(m.id)}
                  onChange={(next) =>
                    setSelectedMonitorIds(
                      next
                        ? [...selectedMonitorIds, m.id]
                        : selectedMonitorIds.filter((id) => id !== m.id),
                    )
                  }
                />
              ))}
            </div>
          )}
          {monitorsError && (
            <div className="text-[12px] text-red-500 dark:text-red-400">{monitorsError}</div>
          )}
          <div className={FIELD_HELP_CLASS}>
            {t('maintenance_form.monitors_help', { count: selectedMonitorIds.length })}
          </div>
        </FormRow>
      </FormPageShell>
    </form>
  );
}

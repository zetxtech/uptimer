import { useId, useMemo, useState } from 'react';
import type { CreateIncidentInput, IncidentImpact, IncidentStatus } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { incidentImpactLabel, incidentStatusLabel } from '../i18n/labels';
import { Markdown } from './Markdown';
import { CheckboxRow, FormPageShell, FormRow } from './formPage';
import { Button, FIELD_LABEL_CLASS, INPUT_CLASS, SELECT_CLASS, TEXTAREA_CLASS } from './ui';
import { Select } from './Select';

const impactOptions: IncidentImpact[] = ['none', 'minor', 'major', 'critical'];
const statusOptions: Array<Exclude<IncidentStatus, 'resolved'>> = [
  'investigating',
  'identified',
  'monitoring',
];

const inputClass = INPUT_CLASS;
const selectClass = SELECT_CLASS;
const textareaClass = TEXTAREA_CLASS;
const labelClass = FIELD_LABEL_CLASS;

export function IncidentForm({
  monitors,
  onSubmit,
  onCancel,
  isLoading,
  variant = 'modal',
  error,
}: {
  monitors: Array<{ id: number; name: string }>;
  onSubmit: (input: CreateIncidentInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: 'modal' | 'page';
  error?: string | undefined;
}) {
  const formId = useId();
  const isPage = variant === 'page';
  const [title, setTitle] = useState('');
  const [impact, setImpact] = useState<IncidentImpact>('minor');
  const [status, setStatus] = useState<Exclude<IncidentStatus, 'resolved'>>('investigating');
  const [message, setMessage] = useState('');
  const [selectedMonitorIds, setSelectedMonitorIds] = useState<number[]>([]);
  const { t } = useI18n();

  const [attempted, setAttempted] = useState(false);
  const normalized = useMemo(() => message.trim(), [message]);

  const issues: string[] = [];
  if (title.trim().length === 0) issues.push(t('incident_form.issue_title'));
  if (selectedMonitorIds.length === 0) issues.push(t('incident_form.issue_monitors'));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (issues.length > 0) return;
    const base: CreateIncidentInput = {
      title: title.trim(),
      impact,
      status,
      monitor_ids: selectedMonitorIds,
    };
    onSubmit(normalized.length > 0 ? { ...base, message: normalized } : base);
  };

  const fields = (
    <fieldset disabled={isLoading} className="min-w-0 space-y-4">
      <div>
        <label htmlFor={`${formId}-title`} className={labelClass}>
          {t('common.title_label')}
        </label>
        <input
          id={`${formId}-title`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className={inputClass}
          placeholder={t('incident_form.title_placeholder')}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${formId}-impact`} className={labelClass}>
            {t('common.impact')}
          </label>
          <Select
            id={`${formId}-impact`}
            disabled={!!isLoading}
            value={impact}
            onChange={(next) => setImpact(next as IncidentImpact)}
            className={selectClass}
          >
            {impactOptions.map((it) => (
              <option key={it} value={it}>
                {incidentImpactLabel(it, t)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${formId}-status`} className={labelClass}>
            {t('incident_update.status')}
          </label>
          <Select
            id={`${formId}-status`}
            disabled={!!isLoading}
            value={status}
            onChange={(next) => setStatus(next as Exclude<IncidentStatus, 'resolved'>)}
            className={selectClass}
          >
            {statusOptions.map((it) => (
              <option key={it} value={it}>
                {incidentStatusLabel(it, t)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div>
        <label htmlFor={`${formId}-message`} className={labelClass}>
          {t('incident_form.message_markdown')}
        </label>
        <textarea
          id={`${formId}-message`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className={textareaClass}
          placeholder={t('incident_form.message_placeholder')}
        />
        {normalized.length > 0 && (
          <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
            <Markdown text={normalized} />
          </div>
        )}
      </div>
    </fieldset>
  );

  const monitorPicker = (
    <>
      {monitors.length === 0 ? (
        <div className="text-[13px] text-ink-2 dark:text-ink-3">
          {t('incident_form.no_monitors_available')}
        </div>
      ) : (
        <div className="max-h-56 space-y-2 overflow-y-auto">
          {monitors.map((m) => (
            <CheckboxRow
              key={m.id}
              id={`${formId}-monitor-${m.id}`}
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
      {monitors.length > 0 && selectedMonitorIds.length === 0 && (
        <div id={`${formId}-monitors-help`} className="text-[12px] text-red-500 dark:text-red-400">
          {t('incident_form.select_at_least_one')}
        </div>
      )}
    </>
  );

  if (isPage) {
    return (
      <form
        noValidate
        aria-describedby={error ? `${formId}-error` : undefined}
        aria-busy={!!isLoading}
        onSubmit={handleSubmit}
      >
        <FormPageShell
          backLabel={t('admin_dashboard.tab.incidents')}
          onBack={onCancel}
          backDisabled={isLoading}
          title={t('admin_dashboard.create_incident')}
          error={error}
          errorTitle={t('form.error_create')}
          issues={attempted ? issues : []}
          errorId={`${formId}-error`}
          primaryAction={
            <Button type="submit" disabled={isLoading} className="min-w-40">
              {isLoading ? t('common.saving') : error ? t('common.retry') : t('common.create')}
            </Button>
          }
        >
          <FormRow
            label={t('incident_form.affected_monitors')}
            description={t('incident_form.section_monitors_hint')}
          >
            {monitorPicker}
          </FormRow>

          <FormRow
            label={t('incident_form.section_incident')}
            description={t('incident_form.section_incident_hint')}
          >
            {fields}
          </FormRow>
        </FormPageShell>
      </form>
    );
  }

  return (
    <form
      className="space-y-5"
      aria-describedby={error ? `${formId}-error` : undefined}
      aria-busy={!!isLoading}
      onSubmit={handleSubmit}
    >
      {error && (
        <div
          id={`${formId}-error`}
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300"
        >
          {error}
        </div>
      )}

      <div role="group" aria-labelledby={`${formId}-monitors-label`}>
        <div id={`${formId}-monitors-label`} className={labelClass}>
          {t('incident_form.affected_monitors')}
        </div>
        {monitorPicker}
      </div>

      {fields}

      <div className="flex gap-3 pt-2">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={isLoading}
          className="flex-1"
        >
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={isLoading} className="flex-1">
          {isLoading ? t('common.saving') : error ? t('common.retry') : t('common.create')}
        </Button>
      </div>
    </form>
  );
}

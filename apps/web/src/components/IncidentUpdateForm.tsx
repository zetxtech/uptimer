import { useId, useMemo, useState } from 'react';
import type { CreateIncidentUpdateInput, IncidentStatus } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { incidentStatusLabel } from '../i18n/labels';
import { Markdown } from './Markdown';
import { FormPageShell, FormRow } from './formPage';
import { Button, FIELD_LABEL_CLASS, SELECT_CLASS, TEXTAREA_CLASS } from './ui';
import { Select } from './Select';
import {
  ATTACHMENT_MAX_FILES,
  attachmentSelectionError,
  fileToAttachment,
} from '../utils/attachments';

const statusOptions: Array<Exclude<IncidentStatus, 'resolved'>> = [
  'investigating',
  'identified',
  'monitoring',
];

const selectClass = SELECT_CLASS;
const textareaClass = TEXTAREA_CLASS;
const labelClass = FIELD_LABEL_CLASS;

export function IncidentUpdateForm({
  onSubmit,
  onCancel,
  isLoading,
  variant = 'modal',
  error,
  initialStatus,
}: {
  onSubmit: (input: CreateIncidentUpdateInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: 'modal' | 'page';
  error?: string | undefined;
  initialStatus?: IncidentStatus;
}) {
  const { t } = useI18n();
  const formId = useId();
  const isPage = variant === 'page';
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<Exclude<IncidentStatus, 'resolved'> | ''>(
    initialStatus === 'resolved' ? '' : (initialStatus ?? ''),
  );
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState(false);
  const normalized = useMemo(() => message.trim(), [message]);
  const [attempted, setAttempted] = useState(false);
  const issues = normalized ? [] : [t('incident_update.issue_message')];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setAttempted(true);
    if (!normalized) return;
    void Promise.all(files.map(fileToAttachment)).then((attachments) => {
      onSubmit({
        message: normalized,
        ...(status === '' ? {} : { status }),
        ...(attachments.length > 0 ? { attachments } : {}),
      });
    });
  };

  const fields = (
    <fieldset disabled={isLoading} className="min-w-0 space-y-4">
      <div>
        <label htmlFor={`${formId}-status`} className={labelClass}>
          {t('incident_update.status')}
        </label>
        <Select
          id={`${formId}-status`}
          disabled={!!isLoading}
          value={status}
          onChange={(next) => setStatus(next as Exclude<IncidentStatus, 'resolved'> | '')}
          className={selectClass}
        >
          <option value="">{t('incident_update.status_placeholder')}</option>
          {statusOptions.map((it) => (
            <option key={it} value={it}>
              {incidentStatusLabel(it, t)}
            </option>
          ))}
        </Select>
      </div>

      <div>
        <label htmlFor={`${formId}-message`} className={labelClass}>
          {t('incident_update.message')}
        </label>
        <textarea
          id={`${formId}-message`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className={textareaClass}
          placeholder={t('incident_update.message_placeholder')}
        />
        {normalized && (
          <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
            <Markdown text={normalized} />
          </div>
        )}
      </div>

      <div>
        <label htmlFor={`${formId}-files`} className={labelClass}>
          {t('incident_update.attachments')}
        </label>
        <input
          id={`${formId}-files`}
          type="file"
          multiple
          className="ui-input h-auto py-2 text-[13px]"
          onChange={(event) => {
            const picked = [...files, ...Array.from(event.target.files ?? [])];
            if (attachmentSelectionError(picked)) {
              setFileError(true);
            } else {
              setFiles(picked);
              setFileError(false);
            }
            event.target.value = '';
          }}
        />
        <p className="mt-1 text-[12px] text-ink-3">
          {t('incident_update.attachments_help', { count: ATTACHMENT_MAX_FILES })}
        </p>
        {files.length ? (
          <ul className="mt-2 space-y-1 text-[12px] text-ink-2">
            {files.map((file, index) => (
              <li key={`${file.name}-${index}`} className="flex items-center gap-2">
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFiles((list) => list.filter((_, i) => i !== index))}
                  aria-label={`${t('incident_update.attachment_remove')}: ${file.name}`}
                  className="text-ink-3 hover:text-ink"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {fileError ? (
          <p role="alert" className="mt-1 text-[12px] text-status-down">
            {t('incident_update.attachment_error')}
          </p>
        ) : null}
      </div>
    </fieldset>
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
          title={t('admin_dashboard.post_update')}
          error={error}
          errorId={`${formId}-error`}
          errorTitle={t('form.error_save')}
          issues={attempted ? issues : []}
          primaryAction={
            <Button type="submit" disabled={isLoading} className="min-w-40">
              {isLoading
                ? t('common.saving')
                : error
                  ? t('common.retry')
                  : t('incident_update.post_update')}
            </Button>
          }
        >
          <FormRow
            label={t('incident_update.section_update')}
            description={t('incident_update.section_update_hint')}
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
          {isLoading
            ? t('common.saving')
            : error
              ? t('common.retry')
              : t('incident_update.post_update')}
        </Button>
      </div>
    </form>
  );
}

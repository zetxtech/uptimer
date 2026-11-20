import { useId, useMemo, useState } from 'react';
import type { ResolveIncidentInput } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { Markdown } from './Markdown';
import { FormPageShell, FormRow } from './formPage';
import { Button, FIELD_LABEL_CLASS, TEXTAREA_CLASS, cn } from './ui';

const textareaClass = TEXTAREA_CLASS;
const labelClass = FIELD_LABEL_CLASS;

export function ResolveIncidentForm({
  onSubmit,
  onCancel,
  isLoading,
  variant = 'modal',
  error,
}: {
  onSubmit: (input: ResolveIncidentInput) => void;
  onCancel: () => void;
  isLoading?: boolean;
  variant?: 'modal' | 'page';
  error?: string | undefined;
}) {
  const { t } = useI18n();
  const formId = useId();
  const isPage = variant === 'page';
  const [message, setMessage] = useState('');
  const normalized = useMemo(() => message.trim(), [message]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoading) return;
    onSubmit(normalized ? { message: normalized } : {});
  };

  const fields = (
    <fieldset disabled={isLoading} className="min-w-0 space-y-4">
      <div>
        <label htmlFor={`${formId}-message`} className={labelClass}>
          {t('resolve_incident.message')}
        </label>
        <textarea
          id={`${formId}-message`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className={textareaClass}
          placeholder={t('resolve_incident.message_placeholder')}
        />
        {normalized && (
          <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
            <Markdown text={normalized} />
          </div>
        )}
      </div>
    </fieldset>
  );

  const resolveButton = (
    <Button
      type="submit"
      disabled={isLoading}
      className={cn(
        !isPage && 'flex-1',
        '!bg-emerald-600 hover:!bg-emerald-700',
        isPage && 'min-w-40',
      )}
    >
      {isLoading
        ? t('resolve_incident.resolving')
        : error
          ? t('common.retry')
          : t('resolve_incident.resolve')}
    </Button>
  );

  if (isPage) {
    return (
      <form
        aria-describedby={error ? `${formId}-error` : undefined}
        aria-busy={!!isLoading}
        onSubmit={handleSubmit}
      >
        <FormPageShell
          backLabel={t('admin_dashboard.tab.incidents')}
          onBack={onCancel}
          backDisabled={isLoading}
          title={t('admin_dashboard.resolve_incident')}
          error={error}
          errorId={`${formId}-error`}
          primaryAction={resolveButton}
        >
          <FormRow
            label={t('resolve_incident.section_resolve')}
            description={t('resolve_incident.section_resolve_hint')}
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
        {resolveButton}
      </div>
    </form>
  );
}

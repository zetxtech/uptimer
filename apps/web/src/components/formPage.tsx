import { Children, type ReactNode } from 'react';

import { FIELD_HELP_CLASS, FIELD_LABEL_CLASS, INPUT_CLASS, cn } from './ui';

/**
 * Shared layout primitives for the admin page editors. They reproduce the reference
 * editor shape: a description rail on the left and one panel column on the right,
 * stacking the heading above the panel below the lg breakpoint.
 */
export function FormGroup({
  label,
  description,
  first = true,
  last = true,
  children,
}: {
  label: string;
  description?: string | undefined;
  /** Consecutive groups share one panel: every group draws the top rule, only the last closes it. */
  first?: boolean;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="grid gap-3 min-[900px]:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)] min-[900px]:gap-x-12 xl:gap-x-16">
      <div className="min-w-0 min-[900px]:pt-5">
        <h3 className="text-[16px] leading-6 font-semibold text-ink">{label}</h3>
        {description && (
          <p className="mt-3 text-[14px] leading-[21.7px] text-ink-2">{description}</p>
        )}
      </div>
      <div
        className={cn(
          'min-w-0 overflow-hidden border border-line bg-surface',
          'rounded-[12px] min-[900px]:rounded-none min-[900px]:border-x',
          first && 'min-[900px]:rounded-t-[12px]',
          last && 'min-[900px]:rounded-b-[12px] min-[900px]:border-b',
        )}
      >
        <div className="divide-y divide-line-soft">
          {Children.toArray(children).map((child, index) => (
            <div key={index} className="px-6 py-6">
              {child}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Standalone group: the rail heading sits above its own card. */
export function FormRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string | undefined;
  children: ReactNode;
}) {
  return (
    <FormGroup label={label} description={description}>
      {children}
    </FormGroup>
  );
}

/** One labeled control. Errors replace the help text. */
export function FormField({
  htmlFor,
  label,
  help,
  error,
  className,
  children,
}: {
  htmlFor?: string;
  label: string;
  help?: string | undefined;
  error?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={htmlFor} className={FIELD_LABEL_CLASS}>
        {label}
      </label>
      <div className="mt-1.5">{children}</div>
      {error ? (
        <div className="ui-error">{error}</div>
      ) : help ? (
        <div className={FIELD_HELP_CLASS}>{help}</div>
      ) : null}
    </div>
  );
}

export type KeyValueRow = { id: number; name: string; value: string };

let keyValueRowSequence = 0;

/** Row factory for the repeatable name/value editors; ids keep inputs stable on removal. */
export function createKeyValueRow(name = '', value = ''): KeyValueRow {
  keyValueRowSequence += 1;
  return { id: keyValueRowSequence, name, value };
}

/**
 * Repeatable name/value rows shared by request headers and monitor metadata: column labels on
 * top, one compact line per row, and an add action underneath.
 */
export function KeyValueRows({
  rows,
  onChange,
  nameLabel,
  valueLabel,
  namePlaceholder,
  valuePlaceholder,
  addLabel,
  removeLabel,
  mono = false,
  disabled = false,
}: {
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  nameLabel: string;
  valueLabel: string;
  namePlaceholder?: string | undefined;
  valuePlaceholder?: string | undefined;
  addLabel: string;
  removeLabel: string;
  mono?: boolean | undefined;
  disabled?: boolean | undefined;
}) {
  const updateRow = (id: number, patch: Partial<Pick<KeyValueRow, 'name' | 'value'>>) => {
    onChange(rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  return (
    <div>
      {rows.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 text-[12px] font-medium text-ink-2">{nameLabel}</span>
          <span className="min-w-0 flex-1 text-[12px] font-medium text-ink-2">{valueLabel}</span>
          <span className="w-8 shrink-0" aria-hidden />
        </div>
      )}

      <div className="mt-1.5 space-y-2">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center gap-2">
            <input
              type="text"
              value={row.name}
              onChange={(event) => updateRow(row.id, { name: event.target.value })}
              placeholder={namePlaceholder}
              aria-label={nameLabel}
              disabled={disabled}
              className={cn(INPUT_CLASS, 'min-w-0 flex-1')}
            />
            <input
              type="text"
              value={row.value}
              onChange={(event) => updateRow(row.id, { value: event.target.value })}
              placeholder={valuePlaceholder}
              aria-label={valueLabel}
              disabled={disabled}
              className={cn(INPUT_CLASS, 'min-w-0 flex-1', mono && 'font-mono')}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((candidate) => candidate.id !== row.id))}
              aria-label={removeLabel}
              title={removeLabel}
              disabled={disabled}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                aria-hidden
              >
                <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => onChange([...rows, createKeyValueRow()])}
        disabled={disabled}
        className="mt-3 inline-flex items-center gap-1 text-[13px] font-medium text-accent transition-colors hover:text-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden
        >
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </svg>
        {addLabel}
      </button>
    </div>
  );
}

/** Boolean setting rendered as the reference-style checkbox line, with its explanation underneath. */
export function CheckboxRow({
  id,
  label,
  help,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  help?: string | undefined;
  checked: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="ui-checkbox mt-[0.2rem]"
      />
      <span className="min-w-0">
        <span className="block text-[13px] font-medium leading-5 text-ink">{label}</span>
        {help && (
          <span className="mt-0.5 block text-[12px] leading-4 text-ink-3 dark:text-ink-2">
            {help}
          </span>
        )}
      </span>
    </label>
  );
}

/** Collapsed group of rarely used settings; invalid contents keep reporting through an inline alert. */
export function FormCollapse({
  id,
  title,
  open,
  onToggle,
  error,
  children,
}: {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  error?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="mt-16 border-b border-line-soft pb-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
        className="flex w-full items-center text-left focus-visible:outline-none"
      >
        <svg
          className={cn('ui-chevron h-3.5 w-3.5 shrink-0 text-ink-3')}
          data-open={open}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5714}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
        </svg>
        <span className="ml-2 text-[14px] text-ink-2">{title}</span>
        {!open && error && (
          <span className="ml-3 text-[12px] text-red-600 dark:text-red-400">{error}</span>
        )}
      </button>
      <div id={id} className="ui-expand" data-open={open}>
        <div>
          <div className="mt-10 space-y-8 pb-2">{children}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * Submit failure banner. The reference reports problems after the button is pressed instead of
 * disabling it up front, so this renders both server errors and client-side field issues.
 */
export function FormErrorBanner({
  title,
  description,
  id,
}: {
  title: string;
  description: string;
  id?: string | undefined;
}) {
  return (
    <div id={id} role="alert" className="ui-form-banner">
      <span className="ui-form-banner-icon" aria-hidden>
        <svg
          className="h-3 w-3"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" d="M12 5v9" />
          <path strokeLinecap="round" d="M12 19h.01" />
        </svg>
      </span>
      <div className="min-w-0">
        <p className="ui-form-banner-title">{title}</p>
        <p className="ui-form-banner-body">{description}</p>
      </div>
    </div>
  );
}

/**
 * Page shell of every admin editor: back link, page title, optional status line, the
 * rail/card sections and a centered primary action instead of sticky chrome.
 */
export function FormPageShell({
  backLabel,
  onBack,
  backDisabled = false,
  title,
  subtitle,
  error,
  errorTitle,
  issues = [],
  errorId,
  children,
  primaryAction,
}: {
  backLabel: string;
  onBack: () => void;
  backDisabled?: boolean | undefined;
  title: string;
  subtitle?: ReactNode;
  error?: string | undefined;
  errorTitle?: string | undefined;
  /** Client-side problems found on the last submit attempt. */
  issues?: string[];
  errorId?: string | undefined;
  children: ReactNode;
  primaryAction: ReactNode;
}) {
  const failure = error ?? (issues.length > 0 ? issues.join(' · ') : undefined);

  return (
    <div className="ui-form-page mx-auto w-full max-w-[52rem] px-5 pb-20 pt-4 sm:px-7">
      <button
        type="button"
        onClick={onBack}
        disabled={backDisabled}
        className="flex h-5 w-fit items-center gap-1.5 text-[13px] text-ink-2 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          aria-hidden
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
        </svg>
        {backLabel}
      </button>

      <h1 className="ui-page-title mt-3">{title}</h1>
      {subtitle}

      {failure ? (
        <FormErrorBanner id={errorId} title={errorTitle ?? ''} description={failure} />
      ) : null}

      <div className="mt-8 space-y-8">{children}</div>

      <div className="mt-14 grid gap-3 min-[900px]:grid-cols-[minmax(0,13.5rem)_minmax(0,1fr)] min-[900px]:gap-x-12 xl:gap-x-16">
        <div className="hidden lg:block" />
        <div className="min-w-0">{primaryAction}</div>
      </div>
    </div>
  );
}

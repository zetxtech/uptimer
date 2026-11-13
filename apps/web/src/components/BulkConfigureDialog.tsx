import { useState } from 'react';

import type { PatchMonitorInput } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { Button } from './ui';

export type BulkConfigProperty =
  | 'frequency'
  | 'confirmation'
  | 'recovery'
  | 'request'
  | 'headers'
  | 'http-auth';

/**
 * One dialog per bulk property, mirroring the reference's selection-mode menu: every entry opens
 * its own small form whose first option is "leave unchanged" and which patches only the fields the
 * operator fills in.
 */
export function BulkConfigureDialog({
  property,
  count,
  busy,
  onCancel,
  onSave,
}: {
  property: BulkConfigProperty;
  count: number;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: PatchMonitorInput) => void;
}) {
  const { t } = useI18n();
  const [interval, setInterval] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [recovery, setRecovery] = useState('');
  const [method, setMethod] = useState('');
  const [timeout, setTimeoutValue] = useState('');
  const [body, setBody] = useState('');
  const [followRedirects, setFollowRedirects] = useState(false);
  const [keepCookies, setKeepCookies] = useState(false);
  const [headerName, setHeaderName] = useState('');
  const [headerValue, setHeaderValue] = useState('');
  const [authUser, setAuthUser] = useState('');
  const [authPassword, setAuthPassword] = useState('');

  const build = (): PatchMonitorInput => {
    switch (property) {
      case 'frequency':
        return interval ? { interval_sec: Number(interval) } : {};
      case 'confirmation':
        return confirmation ? { failures_to_down_from_up: Number(confirmation) } : {};
      case 'recovery':
        return recovery ? { successes_to_up_from_down: Number(recovery) } : {};
      case 'request': {
        const patch: PatchMonitorInput = {};
        if (method) patch.http_method = method;
        if (timeout) patch.timeout_ms = Number(timeout);
        if (body.trim()) patch.http_body = body;
        if (followRedirects) patch.follow_redirects = true;
        if (keepCookies) patch.keep_cookies = true;
        return patch;
      }
      case 'headers':
        return headerName.trim() ? { http_headers_json: { [headerName.trim()]: headerValue } } : {};
      case 'http-auth': {
        if (!authUser.trim()) return {};
        const token = btoa(`${authUser.trim()}:${authPassword}`);
        return { http_headers_json: { Authorization: `Basic ${token}` } };
      }
      default:
        return {};
    }
  };

  const title = {
    frequency: t('admin_dashboard.bulk_frequency'),
    confirmation: t('admin_dashboard.bulk_confirmation'),
    recovery: t('admin_dashboard.bulk_recovery'),
    request: t('admin_dashboard.bulk_request'),
    headers: t('admin_dashboard.bulk_headers'),
    'http-auth': t('admin_dashboard.bulk_http_auth'),
  }[property];

  const select = (
    value: string,
    onChange: (next: string) => void,
    options: Array<[string, string]>,
    label: string,
  ) => (
    <label className="block text-[12px] font-medium text-ink-2">
      {label}
      <select className="ui-select mt-1.5" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('admin_dashboard.bulk_keep')}</option>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (busy) return;
        onSave(build());
      }}
    >
      <h2 id="admin-modal-title" className="ui-dialog-title">
        {title}
      </h2>
      <p className="mb-4 text-[13px] text-ink-2">
        {t('admin_dashboard.bulk_applies_to', { count })}
      </p>

      <div className="space-y-4">
        {property === 'frequency'
          ? select(
              interval,
              setInterval,
              [
                ['60', t('admin_dashboard.bulk_1_minute')],
                ['300', t('admin_dashboard.bulk_5_minutes')],
                ['600', t('admin_dashboard.bulk_10_minutes')],
                ['900', t('admin_dashboard.bulk_15_minutes')],
                ['1800', t('admin_dashboard.bulk_30_minutes')],
              ],
              t('admin_dashboard.bulk_frequency'),
            )
          : null}
        {property === 'confirmation'
          ? select(
              confirmation,
              setConfirmation,
              [
                ['1', '1'],
                ['2', '2'],
                ['3', '3'],
                ['5', '5'],
              ],
              t('admin_dashboard.bulk_confirmation'),
            )
          : null}
        {property === 'recovery'
          ? select(
              recovery,
              setRecovery,
              [
                ['1', '1'],
                ['2', '2'],
                ['3', '3'],
                ['5', '5'],
              ],
              t('admin_dashboard.bulk_recovery'),
            )
          : null}
        {property === 'request' ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              {select(
                method,
                setMethod,
                [
                  ['GET', 'GET'],
                  ['HEAD', 'HEAD'],
                  ['POST', 'POST'],
                  ['PATCH', 'PATCH'],
                  ['PUT', 'PUT'],
                  ['OPTIONS', 'OPTIONS'],
                ],
                t('monitor_form.method'),
              )}
              {select(
                timeout,
                setTimeoutValue,
                [
                  ['1000', '1s'],
                  ['2000', '2s'],
                  ['3000', '3s'],
                  ['5000', '5s'],
                  ['10000', '10s'],
                  ['15000', '15s'],
                  ['30000', '30s'],
                  ['60000', '1m'],
                ],
                t('monitor_form.timeout_ms'),
              )}
            </div>
            <label className="block text-[12px] font-medium text-ink-2">
              {t('monitor_form.body_optional')}
              <textarea
                className="ui-textarea mt-1.5 min-h-20"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={followRedirects}
                onChange={(e) => setFollowRedirects(e.target.checked)}
              />
              {t('monitor_form.follow_redirects')}
            </label>
            <label className="flex items-center gap-2 text-[13px] text-ink-2">
              <input
                type="checkbox"
                className="ui-checkbox"
                checked={keepCookies}
                onChange={(e) => setKeepCookies(e.target.checked)}
              />
              {t('monitor_form.keep_cookies')}
            </label>
          </>
        ) : null}
        {property === 'headers' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[12px] font-medium text-ink-2">
              {t('monitor_form.header_name')}
              <input
                className="ui-input mt-1.5"
                value={headerName}
                onChange={(e) => setHeaderName(e.target.value)}
              />
            </label>
            <label className="block text-[12px] font-medium text-ink-2">
              {t('monitor_form.header_value')}
              <input
                className="ui-input mt-1.5"
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
              />
            </label>
          </div>
        ) : null}
        {property === 'http-auth' ? (
          <>
            <label className="block text-[12px] font-medium text-ink-2">
              {t('monitor_form.basic_auth_username')}
              <input
                className="ui-input mt-1.5"
                value={authUser}
                onChange={(e) => setAuthUser(e.target.value)}
              />
            </label>
            <label className="block text-[12px] font-medium text-ink-2">
              {t('monitor_form.basic_auth_password')}
              <input
                type="password"
                className="ui-input mt-1.5"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
              />
            </label>
          </>
        ) : null}
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          {t('common.cancel')}
        </Button>
        <Button type="submit" disabled={busy}>
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}

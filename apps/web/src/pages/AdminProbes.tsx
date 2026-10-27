import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ADMIN_PATH } from '../app/adminPaths';
import { useI18n } from '../app/I18nContext';
import {
  bumpAdminProbeConfig,
  createAdminProbe,
  deleteAdminProbe,
  fetchAdminMonitors,
  fetchAdminProbes,
  patchAdminProbe,
  rotateAdminProbeToken,
  updateMonitor,
} from '../api/client';
import type {
  AdminMonitor,
  AdminProbe,
  CreateAdminProbeInput,
  MonitorProbeMode,
  ProbeKind,
  ProbeScope,
} from '../api/types';
import { Button, Card, INPUT_CLASS, SELECT_CLASS, ThemeToggle, cn } from '../components/ui';

const PROBE_KINDS: ProbeKind[] = ['edgeone', 'durable_object', 'worker', 'server'];
const PROBE_SCOPES: ProbeScope[] = ['domestic', 'overseas'];
const PROBE_MODES: MonitorProbeMode[] = ['worker', 'multi_region'];

type ProbeFormState = {
  id: string;
  name: string;
  kind: ProbeKind;
  scope: ProbeScope;
  region: string;
  is_required: boolean;
};

const PROBES_QUERY_KEY = ['admin-probes'] as const;
const MONITORS_QUERY_KEY = ['admin-monitors', 'for-probes'] as const;

function formatAge(ts: number | null): string {
  if (!ts) return '—';
  const diff = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (diff < 60) return `${diff}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

function errorMessage(err: unknown): string | null {
  if (!err) return null;
  return err instanceof Error ? err.message : String(err);
}

export function AdminProbes() {
  const { t } = useI18n();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ProbeFormState>({
    id: '',
    name: '',
    kind: 'edgeone',
    scope: 'domestic',
    region: '',
    is_required: true,
  });
  const [issued, setIssued] = useState<{ probeId: string; token: string } | null>(null);

  const probesQuery = useQuery({
    queryKey: PROBES_QUERY_KEY,
    queryFn: fetchAdminProbes,
  });

  const monitorsQuery = useQuery({
    queryKey: MONITORS_QUERY_KEY,
    queryFn: () => fetchAdminMonitors(200),
  });

  const invalidateProbes = () => {
    void queryClient.invalidateQueries({ queryKey: PROBES_QUERY_KEY });
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateAdminProbeInput) => createAdminProbe(input),
    onSuccess: (result) => {
      setIssued({ probeId: result.probe?.id ?? form.id, token: result.token });
      setForm((prev) => ({ ...prev, id: '', name: '', region: '' }));
      invalidateProbes();
    },
  });

  const patchMutation = useMutation({
    mutationFn: (input: { id: string; patch: { is_enabled?: boolean; is_required?: boolean } }) =>
      patchAdminProbe(input.id, input.patch),
    onSuccess: invalidateProbes,
  });

  const rotateMutation = useMutation({
    mutationFn: (id: string) => rotateAdminProbeToken(id),
    onSuccess: (result) => {
      setIssued({ probeId: result.probe_id, token: result.token });
      invalidateProbes();
    },
  });

  const bumpMutation = useMutation({
    mutationFn: (id: string) => bumpAdminProbeConfig(id),
    onSuccess: invalidateProbes,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminProbe(id),
    onSuccess: invalidateProbes,
  });

  const monitorModeMutation = useMutation({
    mutationFn: (input: { id: number; probe_mode: MonitorProbeMode }) =>
      updateMonitor(input.id, { probe_mode: input.probe_mode }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MONITORS_QUERY_KEY });
    },
  });

  const probes = probesQuery.data?.probes ?? [];
  const monitors: AdminMonitor[] = monitorsQuery.data?.monitors ?? [];
  const multiRegionMonitors = monitors.filter((m) => m.probe_mode === 'multi_region');
  const actionError =
    errorMessage(createMutation.error) ??
    errorMessage(patchMutation.error) ??
    errorMessage(rotateMutation.error) ??
    errorMessage(bumpMutation.error) ??
    errorMessage(deleteMutation.error) ??
    errorMessage(monitorModeMutation.error);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header className="border-b border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800">
        <div className="mx-auto flex max-w-[92rem] items-center justify-between px-4 py-3 sm:px-6 sm:py-4 lg:px-8">
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl dark:text-slate-100">
              {t('probes.title')}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              {t('probes.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link
              to={ADMIN_PATH}
              className="rounded-lg px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-100"
            >
              {t('common.dashboard')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[92rem] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        {issued ? (
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {t('probes.token_once')}
              </div>
              <code className="block overflow-x-auto rounded-md bg-white/70 p-2 text-xs text-slate-800 dark:bg-slate-900/60 dark:text-slate-100">
                {issued.token}
              </code>
              <div className="text-xs text-amber-900/80 dark:text-amber-200/80">
                {issued.probeId}
              </div>
              <Button variant="secondary" size="sm" onClick={() => setIssued(null)}>
                {t('common.close')}
              </Button>
            </div>
          </Card>
        ) : null}

        {actionError ? (
          <Card className="border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20">
            <p className="text-sm text-red-700 dark:text-red-300">{actionError}</p>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('common.create')}
          </h2>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              createMutation.mutate({
                id: form.id.trim(),
                name: form.name.trim(),
                kind: form.kind,
                scope: form.scope,
                region: form.region.trim(),
                is_required: form.is_required,
              });
            }}
          >
            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">id</span>
              <input
                className={INPUT_CLASS}
                value={form.id}
                onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
                placeholder="edgeone-cn-gz"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('common.name')}
              </span>
              <input
                className={INPUT_CLASS}
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="EdgeOne 广州"
                required
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t('common.type')}
              </span>
              <select
                className={SELECT_CLASS}
                value={form.kind}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, kind: event.target.value as ProbeKind }))
                }
              >
                {PROBE_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">scope</span>
              <select
                className={SELECT_CLASS}
                value={form.scope}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, scope: event.target.value as ProbeScope }))
                }
              >
                {PROBE_SCOPES.map((scope) => (
                  <option key={scope} value={scope}>
                    {scope}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">region</span>
              <input
                className={INPUT_CLASS}
                value={form.region}
                onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
                placeholder="cn-gz"
                required
              />
            </label>

            <label className="flex items-center gap-2 pt-5 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={form.is_required}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, is_required: event.target.checked }))
                }
              />
              {t('probes.required')}
            </label>

            <div className="sm:col-span-2 lg:col-span-3">
              <Button type="submit" size="sm" disabled={createMutation.isPending}>
                {t('common.create')}
              </Button>
            </div>
          </form>
        </Card>

        <Card>
          {probesQuery.isLoading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('common.loading')}</p>
          ) : probes.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t('probes.empty')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="px-2 py-2">id</th>
                    <th className="px-2 py-2">{t('common.name')}</th>
                    <th className="px-2 py-2">{t('common.type')}</th>
                    <th className="px-2 py-2">scope / region</th>
                    <th className="px-2 py-2">{t('probes.required')}</th>
                    <th className="px-2 py-2">{t('probes.enabled')}</th>
                    <th className="px-2 py-2">{t('probes.last_result')}</th>
                    <th className="px-2 py-2">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {probes.map((probe: AdminProbe) => (
                    <tr
                      key={probe.id}
                      className="border-t border-slate-100 dark:border-slate-700/70"
                    >
                      <td className="px-2 py-2 font-mono text-xs">{probe.id}</td>
                      <td className="px-2 py-2">{probe.name}</td>
                      <td className="px-2 py-2">{probe.kind}</td>
                      <td className="px-2 py-2">
                        {probe.scope} / {probe.region}
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={probe.is_required}
                          onChange={(event) =>
                            patchMutation.mutate({
                              id: probe.id,
                              patch: { is_required: event.target.checked },
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          type="checkbox"
                          checked={probe.is_enabled}
                          onChange={(event) =>
                            patchMutation.mutate({
                              id: probe.id,
                              patch: { is_enabled: event.target.checked },
                            })
                          }
                        />
                      </td>
                      <td className="px-2 py-2 tabular-nums">
                        {probe.last_result_at ? formatAge(probe.last_result_at) : t('probes.never')}
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex flex-wrap gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => rotateMutation.mutate(probe.id)}
                          >
                            {t('probes.rotate')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => bumpMutation.mutate(probe.id)}
                          >
                            config++
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn('text-red-600 dark:text-red-400')}
                            onClick={() => deleteMutation.mutate(probe.id)}
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {t('probes.region_mode')}
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t('probes.mode_multi_region')}: {multiRegionMonitors.length} / {monitors.length}
          </p>
          <div className="mt-4 space-y-2">
            {monitors.map((monitor) => (
              <div
                key={monitor.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-700/70"
              >
                <span className="text-sm text-slate-800 dark:text-slate-100">
                  {monitor.name}{' '}
                  <span className="text-xs text-slate-500 dark:text-slate-400">{monitor.type}</span>
                </span>
                <select
                  className={cn(SELECT_CLASS, 'w-auto min-w-[12rem]')}
                  value={monitor.probe_mode ?? 'worker'}
                  onChange={(event) =>
                    monitorModeMutation.mutate({
                      id: monitor.id,
                      probe_mode: event.target.value as MonitorProbeMode,
                    })
                  }
                >
                  {PROBE_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode === 'worker' ? t('probes.mode_worker') : t('probes.mode_multi_region')}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </Card>
      </main>
    </div>
  );
}

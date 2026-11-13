import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useI18n } from '../app/I18nContext';
import {
  bumpAdminProbeConfig,
  createAdminProbe,
  deleteAdminProbe,
  fetchAllAdminMonitors,
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
import { AdminShell } from '../components/AdminShell';
import { EmptyState, SectionHeader } from '../components/AdminSection';
import { KpiCell, KpiStrip } from '../components/KpiCell';
import { Select } from '../components/Select';
import {
  Badge,
  Button,
  Card,
  FIELD_LABEL_CLASS,
  INPUT_CLASS,
  SELECT_CLASS,
  Skeleton,
  cn,
} from '../components/ui';
import { formatDateTime, formatRelativeTime } from '../utils/datetime';

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
  offline_after_sec: number;
};

const PROBES_QUERY_KEY = ['admin-probes'] as const;
const MONITORS_QUERY_KEY = ['admin-monitors', 'for-probes'] as const;

function errorMessage(err: unknown): string | null {
  if (!err) return null;
  return err instanceof Error ? err.message : String(err);
}

function ProbeThresholdEditor({
  probe,
  pending,
  onSave,
}: {
  probe: AdminProbe;
  pending: boolean;
  onSave: (seconds: number) => void;
}) {
  const { t } = useI18n();
  const [value, setValue] = useState(String(probe.offline_after_sec));
  const seconds = Number(value);
  const valid = Number.isInteger(seconds) && seconds >= 60 && seconds <= 86400;

  return (
    <form
      className="flex items-center gap-1"
      onSubmit={(event) => {
        event.preventDefault();
        if (valid && seconds !== probe.offline_after_sec) onSave(seconds);
      }}
    >
      <input
        type="number"
        className={cn(INPUT_CLASS, 'w-24')}
        aria-label={`${t('probes.offline_after')}: ${probe.name}`}
        value={value}
        min={60}
        max={86400}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button
        type="submit"
        variant="secondary"
        size="sm"
        disabled={!valid || pending || seconds === probe.offline_after_sec}
      >
        {t('common.save')}
      </Button>
    </form>
  );
}

export function AdminProbes() {
  const { locale, t } = useI18n();
  const queryClient = useQueryClient();

  const [form, setForm] = useState<ProbeFormState>({
    id: '',
    name: '',
    kind: 'edgeone',
    scope: 'domestic',
    region: '',
    is_required: true,
    offline_after_sec: 900,
  });
  const [issued, setIssued] = useState<{ probeId: string; token: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const probesQuery = useQuery({
    queryKey: PROBES_QUERY_KEY,
    queryFn: fetchAdminProbes,
    refetchInterval: 60000,
  });

  const monitorsQuery = useQuery({
    queryKey: MONITORS_QUERY_KEY,
    queryFn: () => fetchAllAdminMonitors(),
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
    mutationFn: (input: {
      id: string;
      patch: { is_enabled?: boolean; is_required?: boolean; offline_after_sec?: number };
    }) => patchAdminProbe(input.id, input.patch),
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
  const healthCounts = probes.reduce<Record<AdminProbe['health_status'], number>>(
    (counts, probe) => {
      counts[probe.health_status] += 1;
      return counts;
    },
    { online: 0, offline: 0, waiting: 0, disabled: 0 },
  );
  const actionError =
    errorMessage(createMutation.error) ??
    errorMessage(patchMutation.error) ??
    errorMessage(rotateMutation.error) ??
    errorMessage(bumpMutation.error) ??
    errorMessage(deleteMutation.error) ??
    errorMessage(monitorModeMutation.error);

  return (
    <AdminShell active="probes" layout="sidebar">
      <main className="mx-auto w-full max-w-[1040px] space-y-10 px-5 pb-12 pt-2.5">
        <SectionHeader size="page" title={t('probes.title')} description={t('probes.subtitle')} />
        {issued ? (
          <Card className="border-amber-300 bg-amber-50 dark:border-amber-600 dark:bg-amber-900/20">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {t('probes.token_once')}
              </div>
              <code className="block overflow-x-auto rounded-md bg-surface p-2 text-xs text-ink dark:bg-surface/60 dark:text-ink">
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

        <KpiStrip className="grid-cols-2 sm:grid-cols-4">
          <KpiCell
            label={t('probes.summary_total')}
            value={String(probes.length)}
            icon="M12 3v2m0 14v2M5.6 5.6l1.4 1.4m10 10l1.4 1.4M3 12h2m14 0h2M5.6 18.4L7 17m10-10l1.4-1.4M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
          <KpiCell
            label={t('probes.summary_online')}
            value={String(healthCounts.online)}
            tone="success"
            icon="M5 13l4 4L19 7"
          />
          <KpiCell
            label={t('probes.summary_offline')}
            value={String(healthCounts.offline)}
            tone={healthCounts.offline > 0 ? 'danger' : undefined}
            icon="M6 7l12 12M18 7L6 19"
          />
          <KpiCell
            label={t('probes.summary_waiting')}
            value={String(healthCounts.waiting)}
            tone={healthCounts.waiting > 0 ? 'warning' : undefined}
            icon="M12 8v4l2.5 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </KpiStrip>

        <Card className="overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <SectionHeader
              title={t('probes.list_title')}
              description={t('probes.list_hint')}
              actions={
                <Button
                  size="sm"
                  variant="secondary"
                  aria-expanded={showCreate}
                  onClick={() => setShowCreate((previous) => !previous)}
                >
                  {t('probes.create_title')}
                </Button>
              }
            />
          </div>

          {showCreate ? (
            <form
              className="grid gap-3 border-t border-line-soft px-5 py-4 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 dark:border-line"
              onSubmit={(event) => {
                event.preventDefault();
                createMutation.mutate({
                  id: form.id.trim(),
                  name: form.name.trim(),
                  kind: form.kind,
                  scope: form.scope,
                  region: form.region.trim(),
                  is_required: form.is_required,
                  offline_after_sec: form.offline_after_sec,
                });
              }}
            >
              <label className="space-y-1">
                <span className={FIELD_LABEL_CLASS}>ID</span>
                <input
                  className={INPUT_CLASS}
                  value={form.id}
                  onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
                  placeholder="edgeone-cn-gz"
                  required
                />
              </label>

              <label className="space-y-1">
                <span className={FIELD_LABEL_CLASS}>{t('common.name')}</span>
                <input
                  className={INPUT_CLASS}
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="EdgeOne 广州"
                  required
                />
              </label>

              <label className="space-y-1">
                <span className={FIELD_LABEL_CLASS}>{t('common.type')}</span>
                <Select
                  className={SELECT_CLASS}
                  value={form.kind}
                  onChange={(next) => setForm((prev) => ({ ...prev, kind: next as ProbeKind }))}
                >
                  {PROBE_KINDS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-1">
                <span className={FIELD_LABEL_CLASS}>{t('probes.scope')}</span>
                <Select
                  className={SELECT_CLASS}
                  value={form.scope}
                  onChange={(next) => setForm((prev) => ({ ...prev, scope: next as ProbeScope }))}
                >
                  {PROBE_SCOPES.map((scope) => (
                    <option key={scope} value={scope}>
                      {scope}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="space-y-1">
                <span className={FIELD_LABEL_CLASS}>{t('probes.region')}</span>
                <input
                  className={INPUT_CLASS}
                  value={form.region}
                  onChange={(event) => setForm((prev) => ({ ...prev, region: event.target.value }))}
                  placeholder="cn-gz"
                  required
                />
              </label>

              <label className="space-y-1">
                <span className={FIELD_LABEL_CLASS}>{t('probes.offline_after')}</span>
                <input
                  className={INPUT_CLASS}
                  type="number"
                  min={60}
                  max={86400}
                  step={60}
                  value={form.offline_after_sec}
                  onChange={(event) =>
                    setForm((previous) => ({
                      ...previous,
                      offline_after_sec: Number(event.target.value),
                    }))
                  }
                  required
                />
              </label>

              <label className="flex items-center gap-2 pt-5 text-sm text-ink">
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
                  {t('probes.create_title')}
                </Button>
              </div>
            </form>
          ) : null}

          {probesQuery.isError ? (
            <div
              role="alert"
              className="border-t border-line-soft px-5 py-4 text-sm text-red-600 sm:px-6 dark:border-line dark:text-red-400"
            >
              <p>{errorMessage(probesQuery.error)}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                disabled={probesQuery.isFetching}
                onClick={() => void probesQuery.refetch()}
              >
                {probesQuery.isFetching ? t('common.loading') : t('common.retry')}
              </Button>
            </div>
          ) : null}
          {probesQuery.isLoading ? (
            <div
              role="status"
              aria-busy
              className="divide-y divide-line-soft border-t border-line-soft dark:divide-line/70 dark:border-line"
            >
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-4 px-5 py-3 sm:px-6">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="hidden h-4 w-24 sm:block" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="ml-auto h-4 w-24" />
                </div>
              ))}
            </div>
          ) : !probesQuery.data ? null : probes.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState
                icon="pulse"
                title={t('probes.empty')}
                description={t('probes.empty_help')}
              />
            </div>
          ) : (
            <div className="overflow-x-auto border-t border-line-soft dark:border-line">
              <table className="ui-table min-w-[860px]">
                <thead>
                  <tr>
                    <th className="px-4 py-2.5">{t('probes.column_probe')}</th>
                    <th className="px-3 py-2.5">{t('probes.column_scope')}</th>
                    <th className="px-3 py-2.5">{t('probes.health')}</th>
                    <th className="px-3 py-2.5">{t('probes.last_seen')}</th>
                    <th className="px-3 py-2.5">{t('probes.last_result')}</th>
                    <th className="px-3 py-2.5">{t('probes.offline_after')}</th>
                    <th className="px-3 py-2.5">{t('probes.flags')}</th>
                    <th className="px-4 py-2.5 text-right">{t('common.actions')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft dark:divide-line/70">
                  {probes.map((probe: AdminProbe) => (
                    <tr key={probe.id} className="hover:bg-surface-2 dark:hover:bg-surface-2">
                      <td className="px-4 py-3">
                        <div className="font-medium text-ink">{probe.name}</div>
                        <div className="mt-0.5 font-mono text-xs text-ink-2 dark:text-ink-3">
                          {probe.id} · {probe.kind} · v{probe.config_version}
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-xs text-ink-2">
                        {probe.scope} / {probe.region}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <Badge
                          variant={
                            probe.health_status === 'online'
                              ? 'up'
                              : probe.health_status === 'offline'
                                ? 'down'
                                : 'unknown'
                          }
                        >
                          {t(`probes.health_${probe.health_status}`)}
                        </Badge>
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-xs text-ink-2"
                        title={
                          probe.last_seen_at
                            ? formatDateTime(probe.last_seen_at, undefined, locale)
                            : undefined
                        }
                      >
                        {probe.last_seen_at
                          ? formatRelativeTime(probe.last_seen_at, locale)
                          : t('probes.never')}
                      </td>
                      <td
                        className="whitespace-nowrap px-3 py-3 text-xs text-ink-2"
                        title={
                          probe.last_result_at
                            ? formatDateTime(probe.last_result_at, undefined, locale)
                            : undefined
                        }
                      >
                        {probe.last_result_at
                          ? formatRelativeTime(probe.last_result_at, locale)
                          : t('probes.never')}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3">
                        <ProbeThresholdEditor
                          key={`${probe.id}:${probe.offline_after_sec}`}
                          probe={probe}
                          pending={patchMutation.isPending}
                          onSave={(seconds) =>
                            patchMutation.mutate({
                              id: probe.id,
                              patch: { offline_after_sec: seconds },
                            })
                          }
                        />
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1 text-xs text-ink-2">
                          <label className="flex items-center gap-1.5">
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
                            {t('probes.enabled')}
                          </label>
                          <label className="flex items-center gap-1.5">
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
                            {t('probes.required')}
                          </label>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
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
                            title={t('probes.bump_config_hint')}
                            onClick={() => bumpMutation.mutate(probe.id)}
                          >
                            {t('probes.bump_config')}
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

        <Card className="overflow-hidden">
          <div className="px-4 pt-4 pb-3">
            <SectionHeader
              title={t('probes.region_mode')}
              description={t('probes.monitor_mode_hint')}
              actions={
                monitorsQuery.data ? (
                  <span className="text-[12px] tabular-nums text-ink-2 dark:text-ink-3">
                    {t('probes.mode_multi_region')}: {multiRegionMonitors.length} /{' '}
                    {monitors.length}
                  </span>
                ) : undefined
              }
            />
          </div>
          {monitorsQuery.isError ? (
            <div
              role="alert"
              className="border-t border-line-soft px-5 py-4 text-sm text-red-600 sm:px-6 dark:border-line dark:text-red-400"
            >
              <p>{errorMessage(monitorsQuery.error)}</p>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-2"
                disabled={monitorsQuery.isFetching}
                onClick={() => void monitorsQuery.refetch()}
              >
                {monitorsQuery.isFetching ? t('common.loading') : t('common.retry')}
              </Button>
            </div>
          ) : null}
          {monitorsQuery.isLoading ? (
            <div
              role="status"
              aria-busy
              className="divide-y divide-line-soft border-t border-line-soft dark:divide-line/70 dark:border-line"
            >
              {[0, 1, 2].map((row) => (
                <div key={row} className="flex items-center gap-4 px-5 py-3 sm:px-6">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="hidden h-4 w-24 sm:block" />
                  <Skeleton className="ml-auto h-4 w-20" />
                </div>
              ))}
            </div>
          ) : !monitorsQuery.data ? null : monitors.length === 0 ? (
            <div className="px-4 pb-4">
              <EmptyState
                icon="pulse"
                title={t('admin_dashboard.no_monitors_yet')}
                description={t('probes.list_hint')}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ui-table min-w-[520px]">
                <thead>
                  <tr>
                    <th className="px-4 text-left">{t('common.name')}</th>
                    <th className="px-4 text-left">{t('common.type')}</th>
                    <th className="px-4 text-right">{t('probes.region_mode')}</th>
                  </tr>
                </thead>
                <tbody>
                  {monitors.map((monitor) => (
                    <tr key={monitor.id}>
                      <td className="px-4 py-2 text-[13px] font-medium text-ink">{monitor.name}</td>
                      <td className="px-4 py-2 text-[12px] uppercase text-ink-2 dark:text-ink-3">
                        {monitor.type}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Select
                          className={cn(SELECT_CLASS, 'ui-compact ml-auto w-[13rem]')}
                          value={monitor.probe_mode ?? 'worker'}
                          onChange={(next) =>
                            monitorModeMutation.mutate({
                              id: monitor.id,
                              probe_mode: next as MonitorProbeMode,
                            })
                          }
                        >
                          {PROBE_MODES.map((mode) => (
                            <option key={mode} value={mode}>
                              {mode === 'worker'
                                ? t('probes.mode_worker')
                                : t('probes.mode_multi_region')}
                            </option>
                          ))}
                        </Select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </AdminShell>
  );
}

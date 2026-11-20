import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { ADMIN_PATH, adminIncidentDetailPath } from '../app/adminPaths';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { useI18n } from '../app/I18nContext';
import {
  acknowledgeIncidents,
  deleteIncident,
  fetchAdminIncidents,
  fetchAdminSettings,
  fetchAllAdminMonitors,
  resolveIncident,
} from '../api/client';
import type { Incident } from '../api/types';
import { AdminIncidentList } from '../components/AdminIncidentList';
import { AdminSearchField } from '../components/AdminResourceLists';
import { AdminShell } from '../components/AdminShell';
import { EmptyState } from '../components/AdminSection';
import { Button, SkeletonRows } from '../components/ui';
import { formatDateTimeHeading } from '../utils/datetime';
import { useDebouncedValue } from '../utils/useDebouncedValue';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function fetchSimilarGroupIncidents(groupId: number): Promise<Incident[]> {
  const incidents: Incident[] = [];
  let offset = 0;
  while (true) {
    const page = await fetchAdminIncidents({ limit: 200, offset, similarGroupId: groupId });
    incidents.push(...page.incidents);
    if (page.next_offset === null || page.incidents.length === 0) return incidents;
    offset = page.next_offset;
  }
}

export function AdminSimilarIncidents() {
  const { id } = useParams();
  const groupId = Number(id);
  const { locale, t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const searchTerm = useDebouncedValue(search.trim().toLocaleLowerCase(), 250);

  const groupQuery = useQuery({
    queryKey: ['admin-incidents', 'similar-group', groupId],
    queryFn: () => fetchSimilarGroupIncidents(groupId),
    enabled: Number.isSafeInteger(groupId) && groupId > 0,
  });
  const monitorsQuery = useQuery({
    queryKey: ['admin-monitors', 'all'],
    queryFn: () => fetchAllAdminMonitors(),
  });
  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
  });
  useApplyServerLocaleSetting(settingsQuery.data?.settings.site_locale);

  const groupIncidents = useMemo(() => groupQuery.data ?? [], [groupQuery.data]);
  const monitorNameById = useMemo(
    () =>
      new Map((monitorsQuery.data?.monitors ?? []).map((monitor) => [monitor.id, monitor.name])),
    [monitorsQuery.data?.monitors],
  );
  const incidents = useMemo(() => {
    if (!searchTerm) return groupIncidents;
    return groupIncidents.filter((incident) => {
      const monitorNames = incident.monitor_ids
        .map((monitorId) => monitorNameById.get(monitorId) ?? '')
        .join(' ');
      return `${incident.title} ${incident.message ?? ''} ${monitorNames}`
        .toLocaleLowerCase()
        .includes(searchTerm);
    });
  }, [groupIncidents, monitorNameById, searchTerm]);

  const acknowledgeAllMut = useMutation({
    mutationFn: (incidentIds: number[]) => acknowledgeIncidents({ incident_ids: incidentIds }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
    },
  });

  const firstStartedAt = groupIncidents.length
    ? Math.min(...groupIncidents.map((incident) => incident.started_at))
    : null;
  const timeZone = settingsQuery.data?.settings.site_timezone ?? 'UTC';
  const canAcknowledgeAll = groupIncidents.some(
    (incident) => incident.status !== 'resolved' && !incident.acknowledged_at,
  );
  const errorMessage = groupQuery.error ? getErrorMessage(groupQuery.error) : undefined;
  const groupCount = groupIncidents.length;

  return (
    <AdminShell active="dashboard" layout="sidebar" dashboardTab="incidents">
      <main className="ui-monitor-page mx-auto max-w-[1040px] px-5 pb-8 pt-2.5">
        <div className="ui-incidents-page space-y-10">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="ui-page-title truncate">
                {t('admin_dashboard.incident_similar_count', { count: groupCount })}
              </h1>
              <div className="mt-1 flex items-center gap-2 text-[14px] text-ink-2">
                {firstStartedAt !== null
                  ? formatDateTimeHeading(firstStartedAt, timeZone, locale)
                  : null}
                <Link
                  to={`${ADMIN_PATH}?tab=incidents`}
                  aria-label={t('admin_dashboard.incident_back_to_list')}
                  className="ui-incident-breadcrumb"
                >
                  /
                </Link>
              </div>
            </div>
            <div className="ui-monitor-page-actions">
              <div className="ui-monitor-page-search">
                <AdminSearchField
                  value={search}
                  onChange={setSearch}
                  label={t('admin_dashboard.search_incidents')}
                />
              </div>
              <Button
                disabled={!canAcknowledgeAll || acknowledgeAllMut.isPending}
                aria-busy={acknowledgeAllMut.isPending}
                onClick={() =>
                  acknowledgeAllMut.mutate(groupIncidents.map((incident) => incident.id))
                }
              >
                {t('admin_dashboard.incident_acknowledge_all')}
              </Button>
            </div>
          </div>

          {acknowledgeAllMut.isError ? (
            <div role="alert" className="ui-panel p-3 text-[13px] text-status-down">
              {getErrorMessage(acknowledgeAllMut.error)}
            </div>
          ) : null}

          {groupQuery.isLoading ? (
            <SkeletonRows
              className="ui-incident-list overflow-hidden"
              rows={3}
              rowClassName="ui-incident-row ui-incident-grid ui-incident-grid-no-selection"
              cells={[
                'w-56',
                'hidden w-32 lg:block',
                'w-16',
                'hidden w-24 sm:block',
                'ml-auto h-5 w-5',
              ]}
            />
          ) : groupQuery.isError ? (
            <div role="alert" className="ui-panel p-4 text-status-down">
              {errorMessage ?? t('common.loading_failed')}
            </div>
          ) : groupIncidents.length === 0 ? (
            <div className="ui-panel">
              <EmptyState
                icon="alert"
                title={t('admin_dashboard.similar_group_not_found')}
                description={t('admin_dashboard.incident_no_match_help')}
              />
            </div>
          ) : incidents.length === 0 ? (
            <div className="ui-panel">
              <EmptyState
                icon="alert"
                title={t('admin_dashboard.incident_no_match')}
                description={t('admin_dashboard.incident_no_match_help')}
              />
            </div>
          ) : (
            <AdminIncidentList
              incidents={incidents}
              monitorNameById={monitorNameById}
              locale={locale}
              sort="default"
              sortDirection="desc"
              selectionKey={`${groupId}|${searchTerm}`}
              groupSimilarRows={false}
              selectable={false}
              showHeaderControls={false}
              onSortChange={() => {}}
              onSortDirectionChange={() => {}}
              onOpen={(incidentId) => navigate(adminIncidentDetailPath(incidentId))}
              onUpdate={(incident: Incident) => navigate(adminIncidentDetailPath(incident.id))}
              onResolve={(incident: Incident) => navigate(adminIncidentDetailPath(incident.id))}
              onDelete={async (incidentId) => {
                await deleteIncident(incidentId);
                await queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
              }}
              onAcknowledge={async (incidentIds) => {
                await acknowledgeIncidents({ incident_ids: incidentIds });
              }}
              onResolveSelected={async (incidentIds) => {
                for (const incidentId of incidentIds) await resolveIncident(incidentId, {});
              }}
              onGroupSimilar={async () => {}}
              onUngroup={async () => {}}
              onRemoveGroup={async () => {}}
              onCopyLinks={async (incidentIds) => {
                const links = incidentIds
                  .map(
                    (incidentId) =>
                      new URL(adminIncidentDetailPath(incidentId), window.location.origin).href,
                  )
                  .join('\n');
                await navigator.clipboard.writeText(links);
              }}
            />
          )}
        </div>
      </main>
    </AdminShell>
  );
}

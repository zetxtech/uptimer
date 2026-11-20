import { useEffect, useMemo, useRef, useState } from 'react';

import { useI18n } from '../app/I18nContext';
import type { Incident } from '../api/types';
import {
  IncidentSortControl,
  type IncidentSortDirection,
  type IncidentSortMode,
} from './IncidentSortControl';
import { MenuItem, MenuSeparator, RowMenu } from './MonitorList';
import { cn } from './ui';
import { incidentImpactLabel, incidentStatusLabel } from '../i18n/labels';
import { formatDuration, formatRelativeTime } from '../utils/datetime';

type IncidentDisplayRow = {
  id: number;
  groupId: number | null;
  incidents: Incident[];
  incident: Incident;
  isSimilar: boolean;
};

export function AdminIncidentList({
  incidents,
  monitorNameById,
  locale,
  sort,
  sortDirection,
  selectionKey,
  groupSimilarRows = true,
  selectable = true,
  showHeaderControls = true,
  onSortChange,
  onSortDirectionChange,
  onOpen,
  onOpenGroup,
  onUpdate,
  onResolve,
  onDelete,
  onAcknowledge,
  onResolveSelected,
  onGroupSimilar,
  onUngroup,
  onRemoveGroup,
  onCopyLinks,
}: {
  incidents: Incident[];
  monitorNameById: ReadonlyMap<number, string>;
  locale: string;
  sort: IncidentSortMode;
  sortDirection: IncidentSortDirection;
  selectionKey: string;
  groupSimilarRows?: boolean;
  selectable?: boolean;
  showHeaderControls?: boolean;
  onSortChange: (sort: IncidentSortMode) => void;
  onSortDirectionChange: (direction: IncidentSortDirection) => void;
  onOpen: (incidentId: number) => void;
  onOpenGroup?: (groupId: number) => void;
  onUpdate: (incident: Incident) => void;
  onResolve: (incident: Incident) => void;
  onDelete: (incidentId: number) => Promise<void>;
  onAcknowledge: (incidentIds: number[]) => Promise<void>;
  onResolveSelected: (incidentIds: number[]) => Promise<void>;
  onGroupSimilar: (incidentIds: number[]) => Promise<void>;
  onUngroup: (groupId: number) => Promise<void>;
  onRemoveGroup: (groupId: number) => Promise<void>;
  onCopyLinks: (incidentIds: number[]) => Promise<void>;
}) {
  const { t } = useI18n();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setSelectedIds([]), [selectionKey]);

  const rows = useMemo<IncidentDisplayRow[]>(() => {
    const byGroup = new Map<number, Incident[]>();
    const order: number[] = [];
    for (const incident of incidents) {
      const key = groupSimilarRows ? (incident.similar_group_id ?? incident.id) : incident.id;
      const members = byGroup.get(key);
      if (members) members.push(incident);
      else {
        byGroup.set(key, [incident]);
        order.push(key);
      }
    }
    return order.flatMap((key) => {
      const members = byGroup.get(key) ?? [];
      const incident = members.find((item) => item.status !== 'resolved') ?? members[0];
      if (!incident) return [];
      return [
        {
          id: key,
          groupId: groupSimilarRows ? (members[0]?.similar_group_id ?? null) : null,
          incidents: members,
          incident,
          isSimilar: groupSimilarRows && members.length > 1,
        },
      ];
    });
  }, [groupSimilarRows, incidents]);

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const visibleIds = useMemo(
    () => rows.flatMap((row) => row.incidents.map((incident) => incident.id)),
    [rows],
  );
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSet.has(id));
  const someVisibleSelected = visibleIds.some((id) => selectedSet.has(id));
  const selectedIncidents = incidents.filter((incident) => selectedSet.has(incident.id));
  const canAcknowledge = selectedIncidents.some(
    (incident) => incident.status !== 'resolved' && !incident.acknowledged_at,
  );
  const canResolve = selectedIncidents.some((incident) => incident.status !== 'resolved');
  const gridClass = selectable
    ? 'ui-incident-grid'
    : 'ui-incident-grid ui-incident-grid-no-selection';

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected && !allVisibleSelected;
    }
  }, [allVisibleSelected, someVisibleSelected]);

  const toggleIds = (ids: number[]) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      const remove = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (remove) next.delete(id);
        else next.add(id);
      }
      return [...next];
    });
  };

  const toggleAllVisible = () => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return [...next];
    });
  };

  const runBulkAction = async (action: (incidentIds: number[]) => Promise<void>) => {
    setBusy(true);
    try {
      await action([...selectedIds]);
      setSelectedIds([]);
    } catch {
      return;
    } finally {
      setBusy(false);
    }
  };

  const removeSelected = async () => {
    if (
      !window.confirm(
        t('admin_dashboard.incident_remove_selected_confirm', { count: selectedIds.length }),
      )
    ) {
      return;
    }
    await runBulkAction(async (ids) => {
      for (const id of ids) await onDelete(id);
    });
  };

  const openRow = (row: IncidentDisplayRow) => {
    if (row.isSimilar && row.groupId !== null && onOpenGroup) onOpenGroup(row.groupId);
    else onOpen(row.incident.id);
  };

  return (
    <>
      <div className="ui-incident-list">
        <div className={cn('ui-incident-table-head', gridClass)}>
          <div className="ui-incident-select-cell">
            {selectable ? (
              <input
                ref={selectAllRef}
                type="checkbox"
                className="ui-checkbox"
                checked={allVisibleSelected}
                aria-label={t('admin_dashboard.incident_select_all')}
                onChange={toggleAllVisible}
              />
            ) : null}
          </div>
          <span className="ui-incident-header-label">
            {t('admin_dashboard.incident_col_incident')}
          </span>
          <span className="ui-incident-monitors">{t('common.monitors')}</span>
          <span>{t('admin_dashboard.incident_col_length')}</span>
          <span>{t('admin_dashboard.incident_col_acknowledged')}</span>
          <div className="flex items-center justify-end gap-1">
            {showHeaderControls ? (
              <>
                <IncidentSortControl
                  mode={sort}
                  direction={sortDirection}
                  onModeChange={onSortChange}
                  onDirectionChange={onSortDirectionChange}
                />
                {selectable ? (
                  <RowMenu
                    label={t('admin_dashboard.incident_actions')}
                    buttonClassName="h-[26px] w-[26px]"
                  >
                    {(close) => (
                      <MenuItem
                        icon="M4.5 12.75 9 17.25 19.5 6.75M4.5 6.75h15M4.5 12h15M4.5 17.25h15"
                        onClick={() => {
                          toggleAllVisible();
                          close();
                        }}
                      >
                        {t('admin_dashboard.incident_select_all_on_page')}
                      </MenuItem>
                    )}
                  </RowMenu>
                ) : null}
              </>
            ) : null}
          </div>
        </div>
        <div className="divide-y divide-line">
          {rows.map((row) => {
            const incident = row.incident;
            const monitorNames = [
              ...new Set(
                row.incidents.flatMap((item) =>
                  item.monitor_ids
                    .map((id) => monitorNameById.get(id))
                    .filter((name): name is string => Boolean(name)),
                ),
              ),
            ].join(', ');
            const activeCount = row.incidents.filter((item) => item.status !== 'resolved').length;
            const resolvedCount = row.incidents.length - activeCount;
            const startedAt = Math.min(...row.incidents.map((item) => item.started_at));
            const resolvedAt = Math.max(
              ...row.incidents.map((item) => item.resolved_at ?? item.started_at),
            );
            const acknowledgedCount = row.incidents.filter(
              (item) => item.acknowledged_at != null,
            ).length;
            const ids = row.incidents.map((item) => item.id);
            const selected = ids.every((id) => selectedSet.has(id));
            const ongoing = activeCount > 0;

            return (
              <div
                key={`${row.groupId ?? 'incident'}-${row.id}`}
                role="button"
                tabIndex={0}
                onClick={() => openRow(row)}
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    (event.key === 'Enter' || event.key === ' ')
                  ) {
                    event.preventDefault();
                    openRow(row);
                  }
                }}
                className={cn('ui-incident-row cursor-pointer', gridClass)}
              >
                <div
                  className="ui-incident-select-cell"
                  onClick={(event) => event.stopPropagation()}
                >
                  {selectable ? (
                    <input
                      type="checkbox"
                      className="ui-checkbox"
                      checked={selected}
                      aria-label={t('admin_dashboard.incident_select_row', {
                        title: incident.title,
                      })}
                      onClick={(event) => event.stopPropagation()}
                      onChange={() => toggleIds(ids)}
                    />
                  ) : null}
                </div>
                <div className="flex min-w-0 items-start gap-3">
                  <span
                    className={cn(
                      'ui-incident-row-status',
                      !ongoing && 'ui-incident-row-status-resolved',
                    )}
                    role="img"
                    aria-label={`${incidentStatusLabel(incident.status, t)} · ${incidentImpactLabel(incident.impact, t)}`}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d={
                          ongoing
                            ? 'M12 9v3.75m0 3h.008M20.618 5.984A15.557 15.557 0 0 1 12 2.25a15.557 15.557 0 0 1-8.618 3.734A15.58 15.58 0 0 0 3 9.75c0 6.116 3.52 11.154 9 12.75 5.48-1.596 9-6.634 9-12.75 0-1.293-.132-2.554-.382-3.766Z'
                            : 'm9 12.75 2.25 2.25L15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z'
                        }
                      />
                    </svg>
                  </span>
                  <div className="min-w-0">
                    <div className="ui-incident-name truncate" title={incident.title}>
                      {row.isSimilar
                        ? t('admin_dashboard.incident_similar_count', {
                            count: row.incidents.length,
                          })
                        : incident.title}
                    </div>
                    <div
                      className="ui-incident-row-state truncate text-ink-2"
                      title={incident.message ?? undefined}
                    >
                      {incident.message || incidentImpactLabel(incident.impact, t)}
                    </div>
                    <div className="ui-incident-row-meta">
                      {t('admin_dashboard.incident_started_relative', {
                        value: formatRelativeTime(startedAt, locale),
                      })}
                      {row.isSimilar ? (
                        <span className="ui-incident-group-counts">
                          {activeCount > 0 ? (
                            <span className="ui-incident-group-count ui-incident-group-count-active">
                              {t('admin_dashboard.incident_group_ongoing_count', {
                                count: activeCount,
                              })}
                            </span>
                          ) : null}
                          {resolvedCount > 0 ? (
                            <span className="ui-incident-group-count ui-incident-group-count-resolved">
                              {t('admin_dashboard.incident_group_resolved_count', {
                                count: resolvedCount,
                              })}
                            </span>
                          ) : null}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="ui-incident-monitors truncate" title={monitorNames}>
                  {monitorNames || '—'}
                </div>
                <div className="ui-incident-length">
                  {ongoing
                    ? t('admin_dashboard.incident_ongoing')
                    : formatDuration(Math.max(0, resolvedAt - startedAt))}
                </div>
                <div className="ui-incident-acknowledged">
                  {acknowledgedCount > 0 ? (
                    <span className="ui-incident-acknowledged-value">
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.8}
                        aria-hidden
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5 12 4 4L19 6" />
                      </svg>
                      {row.isSimilar && acknowledgedCount < row.incidents.length
                        ? `${acknowledgedCount}/${row.incidents.length}`
                        : t('admin_dashboard.incident_acknowledged_label')}
                    </span>
                  ) : (
                    <span>—</span>
                  )}
                </div>
                <div className="flex justify-end" onClick={(event) => event.stopPropagation()}>
                  {row.groupId !== null ? (
                    <RowMenu
                      label={t('admin_dashboard.incident_actions')}
                      buttonClassName="h-[26px] w-[26px]"
                    >
                      {(close) => (
                        <>
                          <MenuItem
                            icon="M8 16H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2m-6 8h8a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-8a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2Zm2-6h.01M14 12h.01"
                            onClick={() => {
                              close();
                              void onCopyLinks(row.incidents.map((item) => item.id));
                            }}
                          >
                            {t('admin_dashboard.incident_copy_links')}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            icon="M8 7h8m-8 5h8m-8 5h8M5 4h14v16H5z"
                            onClick={() => {
                              close();
                              if (row.groupId !== null) void onUngroup(row.groupId);
                            }}
                          >
                            {t('admin_dashboard.incident_ungroup')}
                          </MenuItem>
                          <MenuItem
                            tone="danger"
                            icon="M3 6h18M8 6V4h8v2m-9 0 1 14h6l1-14"
                            onClick={() => {
                              close();
                              if (
                                row.groupId !== null &&
                                window.confirm(
                                  t('admin_dashboard.incident_remove_group_confirm', {
                                    count: row.incidents.length,
                                  }),
                                )
                              ) {
                                void onRemoveGroup(row.groupId);
                              }
                            }}
                          >
                            {t('common.remove')}
                          </MenuItem>
                        </>
                      )}
                    </RowMenu>
                  ) : (
                    <RowMenu
                      label={t('admin_dashboard.incident_actions')}
                      buttonClassName="h-[26px] w-[26px]"
                    >
                      {(close) => (
                        <>
                          <MenuItem
                            icon="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125"
                            disabled={incident.status === 'resolved'}
                            onClick={() => {
                              close();
                              onUpdate(incident);
                            }}
                          >
                            {t('common.update')}
                          </MenuItem>
                          <MenuItem
                            icon="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                            disabled={incident.status === 'resolved'}
                            onClick={() => {
                              close();
                              onResolve(incident);
                            }}
                          >
                            {t('resolve_incident.resolve')}
                          </MenuItem>
                          <MenuSeparator />
                          <MenuItem
                            tone="danger"
                            icon="M3 6h18M8 6V4h8v2m-9 0 1 14h6l1-14"
                            onClick={() => {
                              close();
                              if (window.confirm(`${t('common.delete')} "${incident.title}"?`)) {
                                void onDelete(incident.id).catch(() => {});
                              }
                            }}
                          >
                            {t('common.delete')}
                          </MenuItem>
                        </>
                      )}
                    </RowMenu>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {selectable && selectedIds.length > 0 ? (
        <div
          className="ui-incident-bulk-bar"
          role="region"
          aria-label={t('admin_dashboard.incident_bulk_actions')}
        >
          <span className="ui-incident-bulk-count">
            {t('admin_dashboard.incident_selected_count', { count: selectedIds.length })}
          </span>
          <button
            type="button"
            className="ui-incident-bulk-action"
            disabled={busy || !canAcknowledge}
            onClick={() => void runBulkAction(onAcknowledge)}
          >
            {t('admin_dashboard.incident_acknowledge')}
          </button>
          <button
            type="button"
            className="ui-incident-bulk-action"
            disabled={busy || !canResolve}
            onClick={() => void runBulkAction(onResolveSelected)}
          >
            {t('resolve_incident.resolve')}
          </button>
          <button
            type="button"
            className="ui-incident-bulk-action"
            disabled={busy || selectedIds.length < 2}
            onClick={() => void runBulkAction(onGroupSimilar)}
          >
            {t('admin_dashboard.incident_group_similar')}
          </button>
          <RowMenu
            label={t('admin_dashboard.incident_more_actions')}
            buttonClassName="h-[30px] w-[30px]"
          >
            {(close) => (
              <MenuItem
                tone="danger"
                icon="M3 6h18M8 6V4h8v2m-9 0 1 14h6l1-14"
                disabled={busy}
                onClick={() => {
                  close();
                  void removeSelected();
                }}
              >
                {t('admin_dashboard.incident_remove_selected')}
              </MenuItem>
            )}
          </RowMenu>
          <button
            type="button"
            className="ui-incident-bulk-close"
            aria-label={t('common.close')}
            title={t('common.close')}
            disabled={busy}
            onClick={() => setSelectedIds([])}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              aria-hidden
            >
              <path strokeLinecap="round" d="m7 7 10 10M17 7 7 17" />
            </svg>
          </button>
        </div>
      ) : null}
    </>
  );
}

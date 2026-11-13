import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import type { AdminMonitor, HomepageMonitorCard, UptimeRatingLevel } from '../api/types';
import { useI18n } from '../app/I18nContext';
import { statusLabel } from '../i18n/labels';
import { cn } from './ui';

export type MonitorRowMetrics = {
  card: HomepageMonitorCard;
  uptimeToday: number | null;
  uptime30d: number | null;
  p95: number | null;
};

export type MonitorIncidentFlag = {
  id: number;
  title: string;
};

type MonitorListProps = {
  monitors: AdminMonitor[];
  metricsById: Map<number, MonitorRowMetrics>;
  incidentsByMonitorId?: Map<number, MonitorIncidentFlag>;
  groupMode: 'grouped' | 'flat';
  groupLabelOf: (monitor: AdminMonitor) => string;
  groupLabelText: (label: string) => string;
  groupCounts: Map<string, number>;
  selectedIds: Set<number>;
  bulkBusy: boolean;
  ratingLevel: UptimeRatingLevel;
  timeZone: string;
  /** Shown for monitors that inherit the site-wide state thresholds. */
  stateThresholdDefaults?: { failuresToDownFromUp: number; successesToUpFromDown: number };
  testingMonitorId: number | null;
  /** Selection is a mode, not a side effect: checkboxes only render while it is on. */
  selectionMode: boolean;
  onToggleSelect: (id: number) => void;
  /** Group header controls mirror the reference: sort, create, and a group menu. */
  onCreateInGroup?: (groupLabel: string) => void;
  onOpenGroupManager?: (groupLabel: string) => void;
  onEnterSelectionMode?: () => void;
  sortControl?: ReactNode;
  /** Group headers double as drag handles, like the reference. */
  onReorderGroup?: (sourceLabel: string, targetLabel: string) => void;
  onOpen: (monitor: AdminMonitor) => void;
  onTest: (monitor: AdminMonitor) => void;
  onTogglePause: (monitor: AdminMonitor) => void;
  onEdit: (monitor: AdminMonitor) => void;
  onDelete: (monitor: AdminMonitor) => void;
  /** Opens the create form from the list header and group actions. */
  footer?: ReactNode;
};

/** Row overflow menu; closes on outside click, Escape, or after an action. */
export function RowMenu({
  label,
  children,
}: {
  label: string;
  children: (close: () => void) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((previous) => !previous);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        title={label}
        className="ui-icon-btn ui-monitor-row-menu-button h-7 w-7"
      >
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z"
          />
        </svg>
      </button>
      {open ? (
        <div
          role="menu"
          className="animate-fade-in ui-panel absolute right-0 top-8 z-30 w-44 overflow-hidden p-1"
        >
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

export function MenuItem({
  icon,
  tone,
  disabled,
  onClick,
  children,
}: {
  icon: string;
  tone?: 'danger';
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tone === 'danger'
          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10'
          : 'text-ink-2 hover:bg-surface-2 hover:text-ink',
      )}
    >
      <svg
        className="h-3.5 w-3.5 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden
      >
        <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
      </svg>
      {children}
    </button>
  );
}

function formatInterval(seconds: number): string {
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

/** Compact state duration in the reference's unit style: `1mo 2d 9h 29m`. */
function formatStateDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const months = Math.floor(totalSeconds / 2_592_000);
  const days = Math.floor((totalSeconds % 2_592_000) / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);

  const parts: string[] = [];
  if (months > 0) parts.push(`${months}mo`);
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

export function MonitorStatusIcon({ status }: { status: AdminMonitor['status'] }) {
  return (
    <span className="ui-monitor-status" data-status={status} aria-hidden="true">
      <span className="ui-monitor-status-pulse" />
      <span className="ui-monitor-status-pulse" />
      <span className="ui-monitor-status-pulse" />
      <span className="ui-monitor-status-core" />
    </span>
  );
}

/** Reference-style checkbox: square, accent-filled when checked, dash when indeterminate. */
export function SelectionCheckbox({
  checked,
  indeterminate,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  indeterminate: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
      className="ui-selection-checkbox"
      data-state={indeterminate ? 'mixed' : checked ? 'checked' : 'unchecked'}
    >
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden>
        {indeterminate ? (
          <path strokeLinecap="round" d="M4.5 8h7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.6 8.3 6.5 11.2l5.9-6.4" />
        )}
      </svg>
    </button>
  );
}

export function MonitorList({
  monitors,
  metricsById: _metricsById,
  incidentsByMonitorId,
  groupMode,
  groupLabelOf,
  groupLabelText,
  groupCounts,
  selectedIds,
  bulkBusy,
  ratingLevel: _ratingLevel,
  testingMonitorId,
  selectionMode,
  onToggleSelect,
  onCreateInGroup,
  onOpenGroupManager,
  onEnterSelectionMode,
  sortControl,
  onReorderGroup,
  onOpen,
  onTest,
  onTogglePause,
  onEdit,
  onDelete,
  footer,
}: MonitorListProps) {
  const { t } = useI18n();
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);
  const [draggingGroup, setDraggingGroup] = useState<string | null>(null);

  const groupMembers = useMemo(() => {
    const map = new Map<string, AdminMonitor[]>();
    for (const monitor of monitors) {
      const label = groupLabelOf(monitor);
      const bucket = map.get(label);
      if (bucket) bucket.push(monitor);
      else map.set(label, [monitor]);
    }
    return map;
  }, [monitors, groupLabelOf]);

  const toggleGroupSelection = (label: string) => {
    const members = groupMembers.get(label) ?? [];
    const allSelectedNow =
      members.length > 0 && members.every((monitor) => selectedIds.has(monitor.id));
    for (const monitor of members) {
      const isSelected = selectedIds.has(monitor.id);
      if (allSelectedNow ? isSelected : !isSelected) onToggleSelect(monitor.id);
    }
  };

  const toggleGroup = (label: string) => {
    setCollapsedGroups((previous) =>
      previous.includes(label) ? previous.filter((item) => item !== label) : [...previous, label],
    );
  };

  return (
    <div className="ui-monitor-list">
      <div className="divide-y divide-line">
        {monitors.map((monitor, index) => {
          const previous = index > 0 ? monitors[index - 1] : null;
          const groupLabel = groupLabelOf(monitor);
          const showGroupHeader =
            groupMode === 'grouped' && groupLabel !== (previous ? groupLabelOf(previous) : null);
          const collapsed = groupMode === 'grouped' && collapsedGroups.includes(groupLabel);
          const selected = selectedIds.has(monitor.id);
          const selectionActive = selectionMode;
          const testing = testingMonitorId === monitor.id;
          const incident = incidentsByMonitorId?.get(monitor.id);
          const statusDuration =
            monitor.last_status_change_at && monitor.last_status_change_at > 0
              ? formatStateDuration(Date.now() / 1000 - monitor.last_status_change_at)
              : null;
          const isHeartbeat = monitor.type === 'heartbeat';
          const rowTarget = isHeartbeat
            ? monitor.name
            : (monitor.display_url ?? monitor.target).replace(/^https?:\/\//, '');
          const groupSize = showGroupHeader ? (groupCounts.get(groupLabel) ?? 0) : 0;
          const groupAllSelected =
            showGroupHeader && (groupMembers.get(groupLabel) ?? []).length > 0
              ? (groupMembers.get(groupLabel) ?? []).every((item) => selectedIds.has(item.id))
              : false;

          return (
            <div key={monitor.id}>
              {showGroupHeader && (
                <div
                  className="ui-group-head group/ghead flex w-full items-center justify-between"
                  onDragOver={(event) => {
                    if (draggingGroup && draggingGroup !== groupLabel && onReorderGroup) {
                      event.preventDefault();
                      event.dataTransfer.dropEffect = 'move';
                    }
                  }}
                  onDrop={(event) => {
                    if (!onReorderGroup) return;
                    event.preventDefault();
                    const source = event.dataTransfer.getData('text/plain');
                    setDraggingGroup(null);
                    if (source && source !== groupLabel) onReorderGroup(source, groupLabel);
                  }}
                >
                  {selectionMode ? (
                    <SelectionCheckbox
                      checked={groupAllSelected}
                      indeterminate={
                        !groupAllSelected &&
                        (groupMembers.get(groupLabel) ?? []).some((item) =>
                          selectedIds.has(item.id),
                        )
                      }
                      disabled={bulkBusy || groupSize === 0}
                      label={t('admin_dashboard.monitor_select_visible')}
                      onToggle={() => toggleGroupSelection(groupLabel)}
                    />
                  ) : null}
                  {!selectionMode && onReorderGroup ? (
                    <button
                      type="button"
                      draggable
                      aria-label={t('admin_dashboard.group_drag', {
                        group: groupLabelText(groupLabel),
                      })}
                      title={t('admin_dashboard.group_drag', {
                        group: groupLabelText(groupLabel),
                      })}
                      onClick={(event) => event.preventDefault()}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', groupLabel);
                        event.dataTransfer.effectAllowed = 'move';
                        setDraggingGroup(groupLabel);
                      }}
                      onDragEnd={() => setDraggingGroup(null)}
                      className="ui-monitor-grip cursor-grab active:cursor-grabbing"
                    >
                      <svg viewBox="0 0 16 16" fill="currentColor">
                        <circle cx="6" cy="4" r="1.1" />
                        <circle cx="10" cy="4" r="1.1" />
                        <circle cx="6" cy="8" r="1.1" />
                        <circle cx="10" cy="8" r="1.1" />
                        <circle cx="6" cy="12" r="1.1" />
                        <circle cx="10" cy="12" r="1.1" />
                      </svg>
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => toggleGroup(groupLabel)}
                    aria-expanded={!collapsed}
                    className="ui-group-head-toggle flex min-w-0 flex-1 items-center text-left"
                  >
                    <svg
                      className="ui-chevron ui-group-head-chevron"
                      data-open={!collapsed}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.6}
                      aria-hidden
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                    </svg>
                    <span className="ui-group-head-name truncate">
                      {groupLabelText(groupLabel)}
                    </span>
                  </button>
                  <div className="ui-group-head-actions">
                    {sortControl}
                    {onCreateInGroup ? (
                      <button
                        type="button"
                        aria-label={t('admin_dashboard.create_monitor')}
                        title={t('admin_dashboard.create_monitor')}
                        onClick={() => onCreateInGroup(groupLabel)}
                        className="ui-icon-btn"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.8}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M12 4.5v15m7.5-7.5h-15"
                          />
                        </svg>
                      </button>
                    ) : null}
                    <RowMenu label={t('admin_dashboard.monitor_actions')}>
                      {(close) => (
                        <>
                          <MenuItem
                            icon="M12 4.5v15m7.5-7.5h-15"
                            onClick={() => {
                              close();
                              onCreateInGroup?.(groupLabel);
                            }}
                          >
                            {t('admin_dashboard.create_monitor')}
                          </MenuItem>
                          <MenuItem
                            icon="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                            disabled={selectionMode}
                            onClick={() => {
                              close();
                              onEnterSelectionMode?.();
                            }}
                          >
                            {t('admin_dashboard.monitor_enter_selection')}
                          </MenuItem>
                          <MenuItem
                            icon="M4.5 12.75l6 6 9-13.5"
                            disabled={bulkBusy || groupSize === 0}
                            onClick={() => {
                              close();
                              toggleGroupSelection(groupLabel);
                            }}
                          >
                            {t('admin_dashboard.monitor_select_all')}
                          </MenuItem>
                          {onOpenGroupManager ? (
                            <>
                              <div className="my-1 border-t border-line-soft" />
                              <MenuItem
                                icon="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.063-.374-.313-.687-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
                                onClick={() => {
                                  close();
                                  onOpenGroupManager(groupLabel);
                                }}
                              >
                                {t('admin_dashboard.group_manager_title')}
                              </MenuItem>
                            </>
                          ) : null}
                        </>
                      )}
                    </RowMenu>
                  </div>
                </div>
              )}

              {!collapsed && (
                <div className="ui-monitor-row" data-selected={selected}>
                  <div
                    className="flex min-h-[57px] cursor-pointer items-center justify-between gap-4 px-5"
                    onClick={() => {
                      if (selectionMode) onToggleSelect(monitor.id);
                      else onOpen(monitor);
                    }}
                  >
                    <div className="flex min-w-0 flex-1 items-center gap-4">
                      <label
                        className={cn(
                          'grid h-10 w-10 shrink-0 place-items-center',
                          selectionActive && 'cursor-pointer',
                        )}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {selectionActive ? (
                          <SelectionCheckbox
                            checked={selected}
                            indeterminate={false}
                            disabled={bulkBusy}
                            label={t('admin_dashboard.monitor_select_row', { name: monitor.name })}
                            onToggle={() => onToggleSelect(monitor.id)}
                          />
                        ) : (
                          <span className="pointer-events-none">
                            <MonitorStatusIcon status={monitor.status} />
                          </span>
                        )}
                      </label>

                      <div className="min-w-0">
                        <div
                          className="ui-monitor-name truncate"
                          title={
                            isHeartbeat
                              ? monitor.name
                              : `${monitor.name} · ${monitor.display_url ?? monitor.target}`
                          }
                        >
                          {rowTarget}
                        </div>
                        <div className="ui-monitor-meta mt-1 flex min-w-0 items-center">
                          <span className={cn('shrink-0', `ui-monitor-state-${monitor.status}`)}>
                            {statusLabel(monitor.status, t)}
                          </span>
                          {statusDuration ? (
                            <>
                              <span className="ui-monitor-meta-sep">·</span>
                              <span className="shrink-0">{statusDuration}</span>
                            </>
                          ) : null}
                          {monitor.show_on_status_page ? (
                            <>
                              <span className="ui-monitor-meta-sep">·</span>
                              <a
                                href="/"
                                className="ui-monitor-status-page-link truncate"
                                onClick={(event) => event.stopPropagation()}
                              >
                                {t('admin_dashboard.monitor_used_on_status_page')}
                              </a>
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>

                    <div className="ui-monitor-row-actions">
                      {incident ? (
                        <span className="ui-monitor-incident-pill">
                          <span className="ui-monitor-incident-pill-main">
                            <svg
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.4}
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M8 1.8 2.9 3.9v4.3c0 3 2.2 5.3 5.1 6 2.9-.7 5.1-3 5.1-6V3.9L8 1.8Z"
                              />
                              <path strokeLinecap="round" d="M8 6v2.4" />
                              <path strokeLinecap="round" d="M8 10.4h.01" />
                            </svg>
                            {t('admin_dashboard.monitor_incident_open')}
                          </span>
                          <span className="ui-monitor-incident-pill-caret" aria-hidden>
                            <svg
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.6}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="m6.5 4.5 3.5 3.5-3.5 3.5"
                              />
                            </svg>
                          </span>
                        </span>
                      ) : null}
                      <span
                        className="ui-monitor-row-schedule"
                        title={t('monitor_form.interval_sec')}
                      >
                        <svg
                          className="ui-monitor-schedule-icon"
                          viewBox="0 0 16 16"
                          fill="none"
                          aria-hidden
                        >
                          <circle cx="8" cy="8" r="1.6" fill="currentColor" fillOpacity={1} />
                          <circle
                            cx="8"
                            cy="8"
                            r="7.5"
                            stroke="currentColor"
                            strokeOpacity={0.45}
                          />
                          <circle
                            cx="8"
                            cy="8"
                            r="4.3"
                            stroke="currentColor"
                            strokeOpacity={0.75}
                          />
                        </svg>
                        {formatInterval(monitor.interval_sec)}
                      </span>

                      <RowMenu label={t('admin_dashboard.monitor_actions')}>
                        {(close) => (
                          <>
                            {monitor.type === 'heartbeat' ? null : (
                              <MenuItem
                                icon="m3.75 13.5 10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75Z"
                                disabled={testing}
                                onClick={() => {
                                  close();
                                  onTest(monitor);
                                }}
                              >
                                {testing ? t('common.testing') : t('common.test')}
                              </MenuItem>
                            )}
                            <MenuItem
                              icon={
                                monitor.status === 'paused'
                                  ? 'M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z'
                                  : 'M15.75 5.25v13.5m-7.5-13.5v13.5'
                              }
                              onClick={() => {
                                close();
                                onTogglePause(monitor);
                              }}
                            >
                              {monitor.status === 'paused' ? t('common.resume') : t('common.pause')}
                            </MenuItem>
                            <MenuItem
                              icon="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                              onClick={() => {
                                close();
                                onEdit(monitor);
                              }}
                            >
                              {t('common.edit')}
                            </MenuItem>
                            <MenuItem
                              icon="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                              tone="danger"
                              onClick={() => {
                                close();
                                onDelete(monitor);
                              }}
                            >
                              {t('common.delete')}
                            </MenuItem>
                          </>
                        )}
                      </RowMenu>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selectionMode ? footer : null}
    </div>
  );
}

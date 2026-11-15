import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { useI18n } from '../app/I18nContext';
import { useApplyServerLocaleSetting } from '../app/useApplyServerLocaleSetting';
import { adminIncidentDetailPath, adminMonitorDetailPath } from '../app/adminPaths';
import {
  ApiError,
  fetchAdminMonitors,
  fetchHomepage,
  createMonitor,
  assignMonitorsToGroup,
  reorderMonitorGroups,
  updateMonitor,
  deleteMonitor,
  duplicateMonitor,
  removeMonitorGroup,
  renameMonitorGroup,
  sendMonitorTestAlert,
  testMonitor,
  pauseMonitor,
  resumeMonitor,
  fetchNotificationChannels,
  fetchNotificationDeliveries,
  createNotificationChannel,
  updateNotificationChannel,
  testNotificationChannel,
  deleteNotificationChannel,
  retryNotificationDelivery,
  fetchNotificationGroups,
  createNotificationGroup,
  updateNotificationGroup,
  deleteNotificationGroup,
  fetchAdminIncidents,
  createIncident,
  addIncidentUpdate,
  resolveIncident,
  deleteIncident,
  exportIncidentsCsv,
  fetchMaintenanceWindows,
  createMaintenanceWindow,
  updateMaintenanceWindow,
  deleteMaintenanceWindow,
  fetchAdminSettings,
  patchAdminSettings,
} from '../api/client';
import type {
  AdminMonitor,
  AdminSettings,
  HomepageMonitorCard,
  Incident,
  MaintenanceWindow,
  MonitorType,
  NotificationChannel,
  NotificationGroup,
  PatchMonitorInput,
  StatusResponse,
  UptimeRatingLevel,
} from '../api/types';
import { AdminPageHeader, AdminShell, AdminTabs } from '../components/AdminShell';
import { BulkConfigureDialog, type BulkConfigProperty } from '../components/BulkConfigureDialog';
import {
  AdminSearchField,
  MaintenanceList,
  NotificationChannelList,
  NotificationGroupList,
} from '../components/AdminResourceLists';
import { IncidentForm } from '../components/IncidentForm';
import { IncidentUpdateForm } from '../components/IncidentUpdateForm';
import { MaintenanceWindowForm } from '../components/MaintenanceWindowForm';
import { MonitorForm } from '../components/MonitorForm';
import { EmptyState, SettingsGroup, SettingsRow } from '../components/AdminSection';
import { DEFAULT_GROUP_LABEL, MenuItem, MonitorList, RowMenu } from '../components/MonitorList';
import { NotificationChannelForm } from '../components/NotificationChannelForm';
import { NotificationDeliveryList } from '../components/NotificationDeliveryList';
import { NotificationGroupForm } from '../components/NotificationGroupForm';
import { ResolveIncidentForm } from '../components/ResolveIncidentForm';
import { Select } from '../components/Select';
import {
  Badge,
  Button,
  Card,
  INPUT_CLASS,
  MODAL_OVERLAY_CLASS,
  MODAL_PANEL_CLASS,
  Skeleton,
  SkeletonRows,
  TEXTAREA_CLASS,
  Toast,
  ToastStack,
  cn,
} from '../components/ui';
import { incidentImpactLabel, incidentStatusLabel, statusLabel } from '../i18n/labels';
import { localeLabels, messages, type MessageKey } from '../i18n/messages';
import { formatDateTime, formatDuration, formatRelativeTime } from '../utils/datetime';
import { useDebouncedValue } from '../utils/useDebouncedValue';
import { runBulkMonitorOperation } from '../utils/bulkMonitorOperations';

type Tab = 'monitors' | 'notifications' | 'incidents' | 'maintenance' | 'settings';

const TAB_KEYS: Tab[] = ['monitors', 'notifications', 'incidents', 'maintenance', 'settings'];

type SettingsSection = 'general' | 'monitoring';

const SETTINGS_SECTIONS: SettingsSection[] = ['general', 'monitoring'];

const SETTINGS_SECTION_LABEL_KEYS: Record<SettingsSection, MessageKey> = {
  general: 'admin_settings.section.general',
  monitoring: 'admin_settings.section.monitoring',
};

type ModalState =
  | { type: 'none' }
  | { type: 'create-monitor'; initialType?: MonitorType; initialGroup?: string | undefined }
  | { type: 'edit-monitor'; monitor: AdminMonitor }
  | { type: 'create-channel' }
  | { type: 'edit-channel'; channel: NotificationChannel }
  | { type: 'create-group' }
  | { type: 'edit-group'; group: NotificationGroup }
  | { type: 'create-incident' }
  | { type: 'add-incident-update'; incident: Incident }
  | { type: 'resolve-incident'; incident: Incident }
  | { type: 'create-maintenance' }
  | { type: 'edit-maintenance'; window: MaintenanceWindow }
  | { type: 'bulk-move' }
  | { type: 'bulk-edit' }
  | { type: 'rename-group'; label: string }
  | { type: 'remove-group'; label: string }
  | { type: 'bulk-configure'; property: BulkConfigProperty };

/** Reference selection-mode menu entries; each opens its own dialog. */
const BULK_CONFIG_PROPERTIES: Array<{
  property: BulkConfigProperty;
  labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0];
  icon: string;
}> = [
  {
    property: 'frequency',
    labelKey: 'admin_dashboard.bulk_frequency',
    icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  {
    property: 'confirmation',
    labelKey: 'admin_dashboard.bulk_confirmation',
    icon: 'M12 6v6l4 2m5-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  {
    property: 'recovery',
    labelKey: 'admin_dashboard.bulk_recovery',
    icon: 'm9 12.75 2.25 2.25L15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  },
  {
    property: 'request',
    labelKey: 'admin_dashboard.bulk_request',
    icon: 'M6.75 7.5h10.5M6.75 12h10.5m-10.5 4.5h6',
  },
  {
    property: 'headers',
    labelKey: 'admin_dashboard.bulk_headers',
    icon: 'M4.5 6.75h15m-15 5.25h15m-15 5.25h9',
  },
  {
    property: 'http-auth',
    labelKey: 'admin_dashboard.bulk_http_auth',
    icon: 'M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-1.5 9h12a1.5 1.5 0 0 0 1.5-1.5v-6a1.5 1.5 0 0 0-1.5-1.5h-12A1.5 1.5 0 0 0 4.5 12v6a1.5 1.5 0 0 0 1.5 1.5Z',
  },
  {
    property: 'ssl',
    labelKey: 'admin_dashboard.bulk_ssl',
    icon: 'M9 12.75 11.25 15 15 9.75M21 12c0 4.556-3.03 8.36-7.5 9.5C9.03 20.36 6 16.556 6 12V5.25l6-2.25 6 2.25V12Z',
  },
  {
    property: 'domain',
    labelKey: 'admin_dashboard.bulk_domain',
    icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3M3.6 9h16.8M3.6 15h16.8',
  },
  {
    property: 'maintenance',
    labelKey: 'admin_dashboard.bulk_maintenance',
    icon: 'M11.42 15.17 17.25 21A2.652 2.652 0 0 0 21 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 1 1-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 0 0 4.486-6.336l-3.276 3.277a3.004 3.004 0 0 1-2.25-2.25l3.276-3.276a4.5 4.5 0 0 0-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437 1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008Z',
  },
  {
    property: 'metadata',
    labelKey: 'admin_dashboard.bulk_metadata',
    icon: 'M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z',
  },
];

/** Page forms own their header, scroller and footer. */
function ownsPageShell(type: ModalState['type']): boolean {
  return [
    'create-monitor',
    'edit-monitor',
    'create-channel',
    'edit-channel',
    'create-group',
    'edit-group',
    'create-incident',
    'add-incident-update',
    'resolve-incident',
    'create-maintenance',
    'edit-maintenance',
  ].includes(type);
}

type MonitorTestFeedback = {
  at: number;
  monitor: Awaited<ReturnType<typeof testMonitor>>['monitor'];
  result: Awaited<ReturnType<typeof testMonitor>>['result'];
};

type MonitorTestErrorState = {
  monitorId: number;
  at: number;
  message: string;
};

type ChannelTestFeedback = {
  at: number;
  channelId: number;
  eventKey: Awaited<ReturnType<typeof testNotificationChannel>>['event_key'];
  delivery: Awaited<ReturnType<typeof testNotificationChannel>>['delivery'];
};

type ChannelTestErrorState = {
  channelId: number;
  at: number;
  message: string;
};

import {
  MonitorSortControl,
  type MonitorSortDirection,
  type MonitorSortMode,
} from '../components/MonitorSortControl';
type MonitorGroupMode = 'grouped' | 'flat';
type MonitorGroupMeta = {
  label: string;
  count: number;
  sortOrder: number;
};

type MonitorOpsSnapshot = {
  card: HomepageMonitorCard;
  uptimeToday: number | null;
  uptime30d: number | null;
  p95: number | null;
};

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(ratio * sorted.length) - 1));
  return sorted[index] as number;
}

const GROUP_ORDER_STEP = 10;
const UNGROUPED_LABEL = DEFAULT_GROUP_LABEL;
const UNGROUPED_LABEL_ALIASES = [
  UNGROUPED_LABEL,
  ...new Set(
    Object.values(messages).map(
      (localeMessages) =>
        localeMessages['status_page.group_ungrouped'] ?? messages.en['status_page.group_ungrouped'],
    ),
  ),
];
const ALL_GROUPS_FILTER = '__all_groups__';
const BULK_UNGROUPED = 'ungrouped';
const BULK_NEW_GROUP = 'new';
const BULK_EXISTING_PREFIX = 'group:';

function formatError(err: unknown): string | undefined {
  if (!err) return undefined;
  if (err instanceof ApiError) return `${err.code}: ${err.message}`;
  if (err instanceof Error) return err.message;
  return String(err);
}

function isUnsupportedSiteLocaleError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.code !== 'INVALID_ARGUMENT') return false;
  const m = err.message.toLowerCase();
  return m.includes('site_locale') && m.includes('unrecognized');
}

function sanitizeSiteTitle(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) return 'Uptimer';
  return trimmed.slice(0, 100);
}

function sanitizeSiteDescription(value: string): string {
  return value.trim().slice(0, 500);
}

function clampInt(value: number, min: number, max: number): number {
  const n = Math.trunc(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function monitorGroupLabel(monitor: Pick<AdminMonitor, 'group_name'>): string {
  const trimmed = monitor.group_name?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : UNGROUPED_LABEL;
}

function displayGroupLabel(groupLabel: string, ungroupedLabel: string): string {
  return groupLabel === UNGROUPED_LABEL ? ungroupedLabel : groupLabel;
}

function normalizeGroupInput(value: string, ungroupedLabel: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const aliases = [ungroupedLabel, ...UNGROUPED_LABEL_ALIASES];
  if (
    aliases.some((alias) => trimmed.localeCompare(alias, undefined, { sensitivity: 'base' }) === 0)
  ) {
    return null;
  }
  return trimmed;
}

function formatMonitorDisplayName(monitor: Pick<AdminMonitor, 'id' | 'name'>): string {
  return `${monitor.name} (#${monitor.id})`;
}

function formatMonitorDisplayNameById(
  monitorId: number,
  monitorNameById: Map<number, string>,
): string {
  const monitorName = monitorNameById.get(monitorId);
  return monitorName ? `${monitorName} (#${monitorId})` : `#${monitorId}`;
}

function monitorStatusRank(status: AdminMonitor['status']): number {
  switch (status) {
    case 'down':
      return 0;
    case 'unknown':
      return 1;
    case 'maintenance':
      return 2;
    case 'paused':
      return 3;
    case 'up':
      return 4;
    default:
      return 5;
  }
}

function compareMonitors(
  a: AdminMonitor,
  b: AdminMonitor,
  mode: MonitorSortMode,
  direction: MonitorSortDirection,
  ungroupedLabel: string,
): number {
  const dir = direction === 'asc' ? 1 : -1;
  let cmp = 0;

  switch (mode) {
    case 'configured':
      cmp = a.group_sort_order - b.group_sort_order;
      if (cmp === 0) {
        cmp = displayGroupLabel(monitorGroupLabel(a), ungroupedLabel).localeCompare(
          displayGroupLabel(monitorGroupLabel(b), ungroupedLabel),
          undefined,
          {
            sensitivity: 'base',
          },
        );
      }
      if (cmp === 0) {
        cmp = a.sort_order - b.sort_order;
      }
      break;
    case 'name':
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      break;
    case 'status':
      cmp = monitorStatusRank(a.status) - monitorStatusRank(b.status);
      break;
    case 'created_at':
      cmp = a.created_at - b.created_at;
      break;
    case 'updated_at':
      cmp = (a.updated_at ?? 0) - (b.updated_at ?? 0);
      break;
    case 'interval_sec':
      cmp = a.interval_sec - b.interval_sec;
      break;
    case 'last_status_change_at':
      cmp = (a.last_status_change_at ?? 0) - (b.last_status_change_at ?? 0);
      break;
    default:
      cmp = 0;
  }

  if (cmp !== 0) return cmp * dir;
  return (a.id - b.id) * dir;
}

/** Reference column headers carry a 26 × 26 sort button. */
const INCIDENT_SORT_ASC_ICON = 'M3 4.5h11.25M3 9h7.5M3 13.5h5.25m8.25-9v12m0 0-3-3m3 3 3-3';
const INCIDENT_SORT_DESC_ICON = 'M3 4.5h11.25M3 9h7.5M3 13.5h5.25m8.25 9v-12m0 0-3 3m3-3 3 3';

function IncidentSortButton({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: 'asc' | 'desc';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className="ui-icon-btn ui-incident-sort-button"
    >
      <svg
        className="h-3.5 w-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.7}
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={active && dir === 'asc' ? INCIDENT_SORT_ASC_ICON : INCIDENT_SORT_DESC_ICON}
        />
      </svg>
    </button>
  );
}

export function AdminDashboard() {
  const { locale, setLocaleSetting, t } = useI18n();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { search } = useLocation();
  const ungroupedLabel = t('status_page.group_ungrouped');
  const requestedTab = new URLSearchParams(search).get('tab');
  const tab: Tab =
    requestedTab && (TAB_KEYS as string[]).includes(requestedTab)
      ? (requestedTab as Tab)
      : 'monitors';
  const [modal, setModal] = useState<ModalState>({ type: 'none' });
  const modalRef = useRef<HTMLDivElement>(null);
  const modalBusyRef = useRef(false);
  const [testingMonitorId, setTestingMonitorId] = useState<number | null>(null);
  const [testingChannelId, setTestingChannelId] = useState<number | null>(null);
  const [monitorTestFeedback, setMonitorTestFeedback] = useState<MonitorTestFeedback | null>(null);
  const [monitorTestError, setMonitorTestError] = useState<MonitorTestErrorState | null>(null);
  const [channelTestFeedback, setChannelTestFeedback] = useState<ChannelTestFeedback | null>(null);
  const [channelTestError, setChannelTestError] = useState<ChannelTestErrorState | null>(null);
  const [monitorGroupReorderError, setMonitorGroupReorderError] = useState<string | null>(null);
  const [monitorGroupManageError, setMonitorGroupManageError] = useState<string | null>(null);
  const [bulkNotice, setBulkNotice] = useState<{
    kind: 'success' | 'error';
    message: string;
  } | null>(null);
  const [exportNotice, setExportNotice] = useState<{
    tone: 'success' | 'danger';
    title: string;
  } | null>(null);
  /** Row-menu notices: duplicate and test-alert results. */
  const [monitorActionNotice, setMonitorActionNotice] = useState<{
    tone: 'success' | 'danger';
    title: string;
  } | null>(null);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState<number | null>(null);
  const [deliveryNotice, setDeliveryNotice] = useState<string | null>(null);
  const [selectedMonitorIds, setSelectedMonitorIds] = useState<number[]>([]);
  const [bulkInterval, setBulkInterval] = useState('');
  const [bulkTimeout, setBulkTimeout] = useState('');
  const [bulkActive, setBulkActive] = useState('');
  const [bulkVisibility, setBulkVisibility] = useState('');
  const [bulkTargetGroup, setBulkTargetGroup] = useState<string>('');
  const [bulkNewGroupName, setBulkNewGroupName] = useState<string>('');
  const [bulkTargetGroupSortOrderInput, setBulkTargetGroupSortOrderInput] = useState<string>('');
  const [monitorSortMode, setMonitorSortMode] = useState<MonitorSortMode>('configured');
  const [monitorSortDirection, setMonitorSortDirection] = useState<MonitorSortDirection>('asc');
  const [monitorGroupMode, setMonitorGroupMode] = useState<MonitorGroupMode>('grouped');
  const [monitorGroupFilter, setMonitorGroupFilter] = useState<string>(ALL_GROUPS_FILTER);
  const [monitorSearch, setMonitorSearch] = useState('');
  const [incidentSearch, setIncidentSearch] = useState('');
  const [incidentStatusFilter, setIncidentStatusFilter] = useState('');
  const incidentSearchTerm = useDebouncedValue(incidentSearch.trim(), 350);
  const [showIncidentFilters, setShowIncidentFilters] = useState(false);
  const incidentFiltersRef = useRef<HTMLDivElement | null>(null);
  const [notificationSearch, setNotificationSearch] = useState('');
  const [maintenanceSearch, setMaintenanceSearch] = useState('');
  const [notificationView, setNotificationView] = useState<'channels' | 'groups' | 'deliveries'>(
    'channels',
  );
  const [settingsSection, setSettingsSection] = useState<SettingsSection>('general');
  const [showMonitorFilters, setShowMonitorFilters] = useState(false);
  const [showGroupManager, setShowGroupManager] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const createMenuRef = useRef<HTMLDivElement | null>(null);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const [incidentSort, setIncidentSort] = useState<'default' | 'title' | 'length'>('default');
  const [incidentSortDir, setIncidentSortDir] = useState<'asc' | 'desc'>('desc');
  const bulkMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!showCreateMenu && !showIncidentFilters && !showBulkMenu) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!createMenuRef.current?.contains(target)) setShowCreateMenu(false);
      if (!incidentFiltersRef.current?.contains(target)) setShowIncidentFilters(false);
      if (!bulkMenuRef.current?.contains(target)) setShowBulkMenu(false);
    };
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowCreateMenu(false);
        setShowBulkMenu(false);
        setShowIncidentFilters(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [showCreateMenu, showIncidentFilters, showBulkMenu]);
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null);
  const [dragOverGroup, setDragOverGroup] = useState<string | null>(null);
  const [serverLocalePatchSupported, setServerLocalePatchSupported] = useState(true);
  const [localePatchFallbackActive, setLocalePatchFallbackActive] = useState(false);

  const monitorsQuery = useInfiniteQuery({
    queryKey: ['admin-monitors'],
    queryFn: ({ pageParam }) => fetchAdminMonitors(200, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
  });
  const monitors = useMemo(
    () => monitorsQuery.data?.pages.flatMap((page) => page.monitors) ?? [],
    [monitorsQuery.data?.pages],
  );
  // The monitor list is an operational view, so it reuses the public homepage snapshot for
  // uptime and heartbeat history instead of issuing one analytics request per row.
  const homepageQuery = useQuery({
    queryKey: ['homepage'],
    queryFn: fetchHomepage,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });
  const channelsQuery = useQuery({
    queryKey: ['admin-channels'],
    queryFn: () => fetchNotificationChannels(),
  });
  const groupsQuery = useQuery({
    queryKey: ['admin-notification-groups'],
    queryFn: () => fetchNotificationGroups(),
  });
  const deliveriesQuery = useQuery({
    queryKey: ['admin-notification-deliveries'],
    queryFn: () => fetchNotificationDeliveries(50),
    enabled: tab === 'notifications' && notificationView === 'deliveries',
    refetchInterval: 20_000,
  });
  const incidentsQuery = useQuery({
    queryKey: ['admin-incidents', 'open'],
    queryFn: () => fetchAdminIncidents(200),
  });
  const incidentListQuery = useInfiniteQuery({
    queryKey: [
      'admin-incidents',
      'list',
      {
        q: incidentSearchTerm || null,
        status: incidentStatusFilter || null,
        sort: incidentSort,
        dir: incidentSortDir,
      },
    ],
    queryFn: ({ pageParam }) =>
      fetchAdminIncidents({
        limit: 50,
        offset: pageParam,
        sort: incidentSort,
        dir: incidentSortDir,
        ...(incidentSearchTerm ? { q: incidentSearchTerm } : {}),
        ...(incidentStatusFilter ? { status: incidentStatusFilter as Incident['status'] } : {}),
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => lastPage.next_offset ?? undefined,
    placeholderData: keepPreviousData,
    enabled: tab === 'incidents',
  });
  const maintenanceQuery = useQuery({
    queryKey: ['admin-maintenance-windows'],
    queryFn: () => fetchMaintenanceWindows(),
  });

  const settingsQuery = useQuery({
    queryKey: ['admin-settings'],
    queryFn: fetchAdminSettings,
  });

  const settings = settingsQuery.data?.settings;
  const stateThresholdDefaults = useMemo(
    () => ({
      failuresToDownFromUp: settings?.state_failures_to_down_from_up ?? 2,
      successesToUpFromDown: settings?.state_successes_to_up_from_down ?? 2,
    }),
    [settings?.state_failures_to_down_from_up, settings?.state_successes_to_up_from_down],
  );
  useApplyServerLocaleSetting(settings?.site_locale);
  const siteTitle = settings?.site_title?.trim() || 'Uptimer';

  useEffect(() => {
    document.title = `${siteTitle} · ${t('admin_dashboard.document_title_suffix')}`;
  }, [siteTitle, t]);

  const [settingsDraft, setSettingsDraft] = useState<AdminSettings | null>(null);
  const [unsavedSettingsPatch, setUnsavedSettingsPatch] = useState<Partial<AdminSettings>>({});
  const [focusedSetting, setFocusedSetting] = useState<keyof AdminSettings | null>(null);
  const localeOptions: Array<{ value: AdminSettings['site_locale']; label: string }> = [
    { value: 'auto', label: t('admin_settings.locale.option.auto') },
    { value: 'en', label: localeLabels.en },
    { value: 'zh-CN', label: localeLabels['zh-CN'] },
    { value: 'zh-TW', label: localeLabels['zh-TW'] },
    { value: 'ja', label: localeLabels.ja },
    { value: 'es', label: localeLabels.es },
  ];

  useEffect(() => {
    if (!settings) return;

    // A cache rollback must not discard failed edits or the field currently being edited.
    setSettingsDraft((prev) => {
      if (!prev) return settings;
      return {
        ...settings,
        ...unsavedSettingsPatch,
        ...(focusedSetting ? { [focusedSetting]: prev[focusedSetting] } : {}),
      };
    });
  }, [settings, focusedSetting, unsavedSettingsPatch]);

  const applyLocaleLocally = (next: AdminSettings['site_locale']) => {
    setUnsavedSettingsPatch((prev) => {
      const patch = { ...prev };
      delete patch.site_locale;
      return patch;
    });
    setSettingsDraft((prev) => (prev ? { ...prev, site_locale: next } : prev));
    setLocaleSetting(next);
    queryClient.setQueryData<{ settings: AdminSettings }>(['admin-settings'], (old) =>
      old ? { settings: { ...old.settings, site_locale: next } } : old,
    );
    queryClient.setQueryData<StatusResponse>(['status'], (old) =>
      old ? { ...old, site_locale: next } : old,
    );
  };

  const patchSettingsMut = useMutation({
    mutationFn: (patch: Partial<AdminSettings>) => patchAdminSettings(patch),
    onMutate: async (patch) => {
      setUnsavedSettingsPatch((prev) => ({ ...prev, ...patch }));
      await queryClient.cancelQueries({ queryKey: ['admin-settings'] });
      await queryClient.cancelQueries({ queryKey: ['status'] });

      const prevSettings = queryClient.getQueryData<{ settings: AdminSettings }>([
        'admin-settings',
      ]);
      const prevStatus = queryClient.getQueryData<StatusResponse>(['status']);

      if (prevSettings) {
        queryClient.setQueryData<{ settings: AdminSettings }>(['admin-settings'], {
          settings: { ...prevSettings.settings, ...patch },
        });
      }

      // Keep status page data in sync for fields used there (title + uptime rating).
      if (prevStatus) {
        const nextSiteTitle = typeof patch.site_title === 'string' ? patch.site_title : undefined;
        const nextRating = patch.uptime_rating_level as 1 | 2 | 3 | 4 | 5 | undefined;
        const nextLocale = patch.site_locale;

        queryClient.setQueryData<StatusResponse>(['status'], {
          ...prevStatus,
          ...(nextSiteTitle ? { site_title: nextSiteTitle } : {}),
          ...(typeof nextLocale === 'string' ? { site_locale: nextLocale } : {}),
          ...(nextRating
            ? {
                uptime_rating_level: nextRating,
                monitors: prevStatus.monitors.map((m) => ({
                  ...m,
                  uptime_rating_level: nextRating,
                })),
              }
            : {}),
        });

        if (typeof nextLocale === 'string') {
          setLocaleSetting(nextLocale);
        }
      }

      return { prevSettings, prevStatus };
    },
    onError: (err, patch, ctx) => {
      if (typeof patch.site_locale === 'string' && isUnsupportedSiteLocaleError(err)) {
        setServerLocalePatchSupported(false);
        setLocalePatchFallbackActive(true);
        applyLocaleLocally(patch.site_locale);
        return;
      }

      const prevSettings = (ctx as { prevSettings?: { settings: AdminSettings } } | undefined)
        ?.prevSettings;
      const prevStatus = (ctx as { prevStatus?: StatusResponse } | undefined)?.prevStatus;

      if (prevSettings) queryClient.setQueryData(['admin-settings'], prevSettings);
      if (prevStatus) queryClient.setQueryData(['status'], prevStatus);
    },
    onSuccess: (data, patch) => {
      if (patch.site_locale !== undefined) {
        setServerLocalePatchSupported(true);
        setLocalePatchFallbackActive(false);
      }
      queryClient.setQueryData(['admin-settings'], data);
      setUnsavedSettingsPatch((prev) => {
        const remaining = { ...prev };
        for (const key of Object.keys(patch) as Array<keyof AdminSettings>) {
          delete remaining[key];
        }
        return remaining;
      });

      // Update status query cache so StatusPage header updates instantly.
      const title = data.settings.site_title;
      const level = data.settings.uptime_rating_level;
      const localeSetting = data.settings.site_locale;
      queryClient.setQueryData<StatusResponse>(['status'], (old) =>
        old
          ? {
              ...old,
              site_title: title,
              site_locale: localeSetting,
              uptime_rating_level: level,
              monitors: old.monitors.map((m) => ({ ...m, uptime_rating_level: level })),
            }
          : old,
      );
      setLocaleSetting(localeSetting);
    },
  });

  const closeModal = () => setModal({ type: 'none' });

  const createMonitorMut = useMutation({
    mutationFn: createMonitor,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      closeModal();
    },
  });
  const updateMonitorMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateMonitor>[1] }) =>
      updateMonitor(id, data),
    onSuccess: async (_result, { data }) => {
      if (data.name !== undefined) {
        void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      closeModal();
    },
  });
  const deleteMonitorMut = useMutation({
    mutationFn: deleteMonitor,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(
        ['admin-monitors'],
        (old: { monitors: AdminMonitor[] } | undefined) => ({
          monitors: (old?.monitors ?? []).filter((m) => m.id !== id),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
    },
  });

  const duplicateMonitorMut = useMutation({
    mutationFn: duplicateMonitor,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      setMonitorActionNotice({
        tone: 'success',
        title: t('admin_dashboard.monitor_duplicated', { name: data.monitor.name }),
      });
    },
    onError: (err) => {
      setMonitorActionNotice({
        tone: 'danger',
        title: formatError(err) ?? t('admin_dashboard.monitor_duplicate_failed'),
      });
    },
  });

  const sendTestAlertMut = useMutation({
    mutationFn: sendMonitorTestAlert,
    onSuccess: (data) => {
      const delivered = data.results.filter((r) => r.status === 'success').length;
      setMonitorActionNotice({
        tone: delivered > 0 ? 'success' : 'danger',
        title:
          delivered > 0
            ? t('admin_dashboard.monitor_test_alert_sent', {
                count: delivered,
                total: data.results.length,
              })
            : t('admin_dashboard.monitor_test_alert_failed'),
      });
    },
    onError: (err) => {
      setMonitorActionNotice({
        tone: 'danger',
        title: formatError(err) ?? t('admin_dashboard.monitor_test_alert_failed'),
      });
    },
  });

  const pauseMonitorMut = useMutation({
    mutationFn: pauseMonitor,
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-monitors'],
        (old: { monitors: AdminMonitor[] } | undefined) => ({
          monitors: (old?.monitors ?? []).map((m) => (m.id === data.monitor.id ? data.monitor : m)),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
    },
  });

  const resumeMonitorMut = useMutation({
    mutationFn: resumeMonitor,
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-monitors'],
        (old: { monitors: AdminMonitor[] } | undefined) => ({
          monitors: (old?.monitors ?? []).map((m) => (m.id === data.monitor.id ? data.monitor : m)),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
    },
  });

  const testMonitorMut = useMutation({
    mutationFn: testMonitor,
    onSuccess: (data) => {
      setMonitorTestFeedback({
        at: Math.floor(Date.now() / 1000),
        monitor: data.monitor,
        result: data.result,
      });
      setMonitorTestError(null);
    },
    onError: (err, monitorId) => {
      setMonitorTestError({
        monitorId,
        at: Math.floor(Date.now() / 1000),
        message: formatError(err) ?? t('admin_dashboard.monitor_test_failed_default'),
      });
      setMonitorTestFeedback(null);
    },
    onSettled: () => setTestingMonitorId(null),
  });

  const createChannelMut = useMutation({
    mutationFn: createNotificationChannel,
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-channels'],
        (old: { notification_channels: NotificationChannel[] } | undefined) => ({
          notification_channels: [
            ...(old?.notification_channels ?? []),
            data.notification_channel,
          ].sort((a, b) => a.id - b.id),
        }),
      );
      closeModal();
    },
  });
  const updateChannelMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Parameters<typeof updateNotificationChannel>[1];
    }) => updateNotificationChannel(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-channels'],
        (old: { notification_channels: NotificationChannel[] } | undefined) => ({
          notification_channels: (old?.notification_channels ?? []).map((ch) =>
            ch.id === data.notification_channel.id ? data.notification_channel : ch,
          ),
        }),
      );
      closeModal();
    },
  });
  const testChannelMut = useMutation({
    mutationFn: testNotificationChannel,
    onSuccess: (data, channelId) => {
      setChannelTestFeedback({
        at: Math.floor(Date.now() / 1000),
        channelId,
        eventKey: data.event_key,
        delivery: data.delivery,
      });
      setChannelTestError(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-notification-deliveries'] });
    },
    onError: (err, channelId) => {
      setChannelTestError({
        channelId,
        at: Math.floor(Date.now() / 1000),
        message: formatError(err) ?? t('admin_dashboard.webhook_test_failed_default'),
      });
      setChannelTestFeedback(null);
    },
    onSettled: () => setTestingChannelId(null),
  });

  const retryDeliveryMut = useMutation({
    mutationFn: retryNotificationDelivery,
    onSuccess: () => {
      setDeliveryNotice(null);
      void queryClient.invalidateQueries({ queryKey: ['admin-notification-deliveries'] });
    },
    onError: (err) => {
      setDeliveryNotice(formatError(err) ?? t('notification_delivery.retry_failed'));
    },
    onSettled: () => setRetryingDeliveryId(null),
  });

  const deleteChannelMut = useMutation({
    mutationFn: deleteNotificationChannel,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(
        ['admin-channels'],
        (old: { notification_channels: NotificationChannel[] } | undefined) => ({
          notification_channels: (old?.notification_channels ?? []).filter((ch) => ch.id !== id),
        }),
      );
      // Deleting a channel also removes its group memberships on the server.
      void queryClient.invalidateQueries({ queryKey: ['admin-notification-groups'] });
    },
  });

  const createGroupMut = useMutation({
    mutationFn: createNotificationGroup,
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-notification-groups'],
        (old: { notification_groups: NotificationGroup[] } | undefined) => ({
          notification_groups: [...(old?.notification_groups ?? []), data.notification_group].sort(
            (a, b) => a.id - b.id,
          ),
        }),
      );
      closeModal();
    },
  });
  const updateGroupMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Parameters<typeof updateNotificationGroup>[1];
    }) => updateNotificationGroup(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-notification-groups'],
        (old: { notification_groups: NotificationGroup[] } | undefined) => ({
          notification_groups: (old?.notification_groups ?? []).map((group) =>
            group.id === data.notification_group.id ? data.notification_group : group,
          ),
        }),
      );
      closeModal();
    },
  });
  const deleteGroupMut = useMutation({
    mutationFn: deleteNotificationGroup,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(
        ['admin-notification-groups'],
        (old: { notification_groups: NotificationGroup[] } | undefined) => ({
          notification_groups: (old?.notification_groups ?? []).filter((group) => group.id !== id),
        }),
      );
    },
  });

  const createIncidentMut = useMutation({
    mutationFn: createIncident,
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-incidents'],
        (old: { incidents: Incident[] } | undefined) => ({
          incidents: [data.incident, ...(old?.incidents ?? [])],
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
      closeModal();
    },
  });
  const addIncidentUpdateMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof addIncidentUpdate>[1] }) =>
      addIncidentUpdate(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-incidents'],
        (old: { incidents: Incident[] } | undefined) => ({
          incidents: (old?.incidents ?? []).map((it) =>
            it.id === data.incident.id ? data.incident : it,
          ),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
      closeModal();
    },
  });
  const resolveIncidentMut = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Parameters<typeof resolveIncident>[1] }) =>
      resolveIncident(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-incidents'],
        (old: { incidents: Incident[] } | undefined) => ({
          incidents: (old?.incidents ?? []).map((it) =>
            it.id === data.incident.id ? data.incident : it,
          ),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
      closeModal();
    },
  });
  const deleteIncidentMut = useMutation({
    mutationFn: deleteIncident,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(
        ['admin-incidents'],
        (old: { incidents: Incident[] } | undefined) => ({
          incidents: (old?.incidents ?? []).filter((it) => it.id !== id),
        }),
      );
      void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
    },
  });

  const createMaintenanceMut = useMutation({
    mutationFn: createMaintenanceWindow,
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-maintenance-windows'],
        (old: { maintenance_windows: MaintenanceWindow[] } | undefined) => ({
          maintenance_windows: [data.maintenance_window, ...(old?.maintenance_windows ?? [])],
        }),
      );
      closeModal();
    },
  });
  const updateMaintenanceMut = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: number;
      data: Parameters<typeof updateMaintenanceWindow>[1];
    }) => updateMaintenanceWindow(id, data),
    onSuccess: (data) => {
      queryClient.setQueryData(
        ['admin-maintenance-windows'],
        (old: { maintenance_windows: MaintenanceWindow[] } | undefined) => ({
          maintenance_windows: (old?.maintenance_windows ?? []).map((w) =>
            w.id === data.maintenance_window.id ? data.maintenance_window : w,
          ),
        }),
      );
      closeModal();
    },
  });
  const deleteMaintenanceMut = useMutation({
    mutationFn: deleteMaintenanceWindow,
    onSuccess: (_data, id) => {
      queryClient.setQueryData(
        ['admin-maintenance-windows'],
        (old: { maintenance_windows: MaintenanceWindow[] } | undefined) => ({
          maintenance_windows: (old?.maintenance_windows ?? []).filter((w) => w.id !== id),
        }),
      );
    },
  });

  modalBusyRef.current =
    createMonitorMut.isPending ||
    updateMonitorMut.isPending ||
    createChannelMut.isPending ||
    updateChannelMut.isPending ||
    createGroupMut.isPending ||
    updateGroupMut.isPending ||
    createIncidentMut.isPending ||
    addIncidentUpdateMut.isPending ||
    resolveIncidentMut.isPending ||
    createMaintenanceMut.isPending ||
    updateMaintenanceMut.isPending;

  useEffect(() => {
    if (modal.type === 'none') return;
    const dialog = modalRef.current;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !modalBusyRef.current) {
        event.preventDefault();
        setModal({ type: 'none' });
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === dialog)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [modal.type]);

  const monitorNameById = useMemo(
    () => new Map(monitors.map((m) => [m.id, m.name] as const)),
    [monitors],
  );

  const monitorGroupMetaByLabel = useMemo(() => {
    const byLabel = new Map<string, MonitorGroupMeta>();

    for (const monitor of monitors) {
      const label = monitorGroupLabel(monitor);
      const existing = byLabel.get(label);

      if (!existing) {
        byLabel.set(label, {
          label,
          count: 1,
          sortOrder: monitor.group_sort_order,
        });
        continue;
      }

      existing.count += 1;
      if (monitor.group_sort_order < existing.sortOrder) {
        existing.sortOrder = monitor.group_sort_order;
      }
    }

    return byLabel;
  }, [monitors]);

  const orderedMonitorGroups = useMemo(() => {
    return [...monitorGroupMetaByLabel.values()].sort((a, b) => {
      const orderCmp = a.sortOrder - b.sortOrder;
      if (orderCmp !== 0) return orderCmp;
      return a.label.localeCompare(b.label, undefined, { sensitivity: 'base' });
    });
  }, [monitorGroupMetaByLabel]);

  const monitorGroupIndexByLabel = useMemo(
    () => new Map(orderedMonitorGroups.map((group, index) => [group.label, index] as const)),
    [orderedMonitorGroups],
  );

  const monitorGroupLabels = useMemo(
    () => orderedMonitorGroups.map((group) => group.label),
    [orderedMonitorGroups],
  );

  const bulkTargetGroupName =
    bulkTargetGroup === BULK_UNGROUPED
      ? null
      : bulkTargetGroup === BULK_NEW_GROUP
        ? normalizeGroupInput(bulkNewGroupName, ungroupedLabel)
        : bulkTargetGroup.startsWith(BULK_EXISTING_PREFIX)
          ? bulkTargetGroup.slice(BULK_EXISTING_PREFIX.length)
          : null;
  const bulkTargetValid =
    bulkTargetGroup === BULK_UNGROUPED ||
    (bulkTargetGroup === BULK_NEW_GROUP && bulkTargetGroupName !== null) ||
    (bulkTargetGroup.startsWith(BULK_EXISTING_PREFIX) &&
      bulkTargetGroupName !== null &&
      monitorGroupLabels.includes(bulkTargetGroupName));
  const bulkSortOrderText = bulkTargetGroupSortOrderInput.trim();
  const bulkSortOrderValid =
    bulkSortOrderText.length === 0 ||
    (/^-?\d+$/.test(bulkSortOrderText) &&
      Number(bulkSortOrderText) >= -100000 &&
      Number(bulkSortOrderText) <= 100000);
  const intervalValue = Number(bulkInterval);
  const timeoutValue = Number(bulkTimeout);
  const bulkEditValid =
    (bulkInterval.trim() === '' || (Number.isSafeInteger(intervalValue) && intervalValue >= 60)) &&
    (bulkTimeout.trim() === '' || (Number.isSafeInteger(timeoutValue) && timeoutValue >= 1000)) &&
    (bulkInterval.trim() !== '' ||
      bulkTimeout.trim() !== '' ||
      bulkActive !== '' ||
      bulkVisibility !== '');

  useEffect(() => {
    const available = new Set(monitors.map((m) => m.id));
    setSelectedMonitorIds((prev) => prev.filter((id) => available.has(id)));
  }, [monitors]);

  useEffect(() => {
    if (selectedMonitorIds.length !== 0) return;
    setBulkTargetGroup('');
    setBulkNewGroupName('');
    setBulkTargetGroupSortOrderInput('');
    setMonitorGroupManageError(null);
    setBulkInterval('');
    setBulkTimeout('');
    setBulkActive('');
    setBulkVisibility('');
  }, [selectedMonitorIds.length]);

  useEffect(() => {
    if (monitorGroupFilter === ALL_GROUPS_FILTER) return;
    if (monitorGroupLabels.includes(monitorGroupFilter)) return;
    setMonitorGroupFilter(ALL_GROUPS_FILTER);
  }, [monitorGroupFilter, monitorGroupLabels]);

  const moveMonitorGroupMut = useMutation({
    mutationFn: async ({ groupLabel, toIndex }: { groupLabel: string; toIndex: number }) => {
      const fromIndex = monitorGroupIndexByLabel.get(groupLabel);
      if (fromIndex === undefined) return;
      if (toIndex < 0 || toIndex >= orderedMonitorGroups.length || toIndex === fromIndex) return;

      const reordered = [...orderedMonitorGroups];
      const [movedGroup] = reordered.splice(fromIndex, 1);
      if (!movedGroup) return;
      reordered.splice(toIndex, 0, movedGroup);

      const updates = reordered
        .map((group, index) => ({
          groupName: group.label === UNGROUPED_LABEL ? null : group.label,
          nextSortOrder: index * GROUP_ORDER_STEP,
        }))
        .filter((item, index) => item.nextSortOrder !== reordered[index]?.sortOrder);

      if (updates.length === 0) return;

      await reorderMonitorGroups({
        groups: updates.map((item) => ({
          group_name: item.groupName,
          group_sort_order: item.nextSortOrder,
        })),
      });
    },
    onMutate: () => {
      setMonitorGroupReorderError(null);
    },
    onError: (err) => {
      setMonitorGroupReorderError(formatError(err) ?? t('admin_dashboard.reorder_groups_failed'));
    },
    onSuccess: async () => {
      setMonitorGroupReorderError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
    },
  });

  const assignSelectedMonitorsMut = useMutation({
    mutationFn: async () => {
      const monitorIds = [...new Set(selectedMonitorIds)];
      if (monitorIds.length === 0 || !bulkTargetValid) {
        throw new Error(t('admin_dashboard.bulk_assign_choose'));
      }
      if (!bulkSortOrderValid) {
        throw new Error(t('admin_dashboard.bulk_assign_order_invalid'));
      }

      const sortOrderTrimmed = bulkTargetGroupSortOrderInput.trim();
      const parsedSortOrder =
        sortOrderTrimmed.length > 0 ? Number.parseInt(sortOrderTrimmed, 10) : undefined;
      const groupSortOrder =
        parsedSortOrder !== undefined && Number.isFinite(parsedSortOrder)
          ? parsedSortOrder
          : undefined;

      await assignMonitorsToGroup({
        monitor_ids: monitorIds,
        group_name: bulkTargetGroupName,
        ...(groupSortOrder !== undefined ? { group_sort_order: groupSortOrder } : {}),
      });
    },
    onMutate: () => {
      setMonitorGroupManageError(null);
    },
    onError: (err) => {
      setMonitorGroupManageError(formatError(err) ?? t('admin_dashboard.move_selected_failed'));
    },
    onSuccess: async () => {
      setMonitorGroupManageError(null);
      setSelectedMonitorIds([]);
      setBulkTargetGroup('');
      setBulkNewGroupName('');
      setBulkTargetGroupSortOrderInput('');
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
    },
  });

  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) => runBulkMonitorOperation(ids, deleteMonitor),
    onMutate: () => setBulkNotice(null),
    onError: (error) =>
      setBulkNotice({
        kind: 'error',
        message: formatError(error) ?? t('admin_dashboard.bulk_failed'),
      }),
    onSuccess: async (result) => {
      setSelectedMonitorIds(result.failed.map((item) => item.id));
      void queryClient.invalidateQueries({ queryKey: ['admin-incidents'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      setBulkNotice({
        kind: result.failed.length ? 'error' : 'success',
        message: result.failed.length
          ? t('admin_dashboard.bulk_partial', {
              succeeded: result.succeeded.length,
              failed: result.failed.length,
            })
          : t('admin_dashboard.bulk_deleted', { count: result.succeeded.length }),
      });
    },
  });
  const bulkEditMut = useMutation({
    mutationFn: ({ ids, patch }: { ids: number[]; patch: PatchMonitorInput }) =>
      runBulkMonitorOperation(ids, (id) => updateMonitor(id, patch)),
    onMutate: () => setBulkNotice(null),
    onError: (error) =>
      setBulkNotice({
        kind: 'error',
        message: formatError(error) ?? t('admin_dashboard.bulk_failed'),
      }),
    onSuccess: async (result) => {
      setSelectedMonitorIds(result.failed.map((item) => item.id));
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      setBulkNotice({
        kind: result.failed.length ? 'error' : 'success',
        message: result.failed.length
          ? t('admin_dashboard.bulk_partial', {
              succeeded: result.succeeded.length,
              failed: result.failed.length,
            })
          : t('admin_dashboard.bulk_updated', { count: result.succeeded.length }),
      });
    },
  });
  const bulkBusy =
    assignSelectedMonitorsMut.isPending || bulkDeleteMut.isPending || bulkEditMut.isPending;

  const sortedMonitors = useMemo(() => {
    const list = [...monitors];
    const dir = monitorSortDirection === 'asc' ? 1 : -1;

    list.sort((a, b) => {
      if (monitorGroupMode === 'grouped') {
        const groupA = monitorGroupLabel(a);
        const groupB = monitorGroupLabel(b);
        const groupOrderA = monitorGroupMetaByLabel.get(groupA)?.sortOrder ?? 0;
        const groupOrderB = monitorGroupMetaByLabel.get(groupB)?.sortOrder ?? 0;
        const groupOrderCmp = groupOrderA - groupOrderB;
        if (groupOrderCmp !== 0) return groupOrderCmp;

        const groupCmp = groupA.localeCompare(groupB, undefined, {
          sensitivity: 'base',
        });
        if (groupCmp !== 0) return groupCmp;

        if (monitorSortMode === 'configured') {
          const configuredCmp = a.sort_order - b.sort_order;
          if (configuredCmp !== 0) return configuredCmp * dir;
          return (a.id - b.id) * dir;
        }
      }

      return compareMonitors(a, b, monitorSortMode, monitorSortDirection, ungroupedLabel);
    });
    return list;
  }, [
    monitorGroupMetaByLabel,
    monitorGroupMode,
    monitorSortDirection,
    monitorSortMode,
    monitors,
    ungroupedLabel,
  ]);

  const filteredMonitors = useMemo(() => {
    const byGroup =
      monitorGroupFilter === ALL_GROUPS_FILTER
        ? sortedMonitors
        : sortedMonitors.filter((monitor) => monitorGroupLabel(monitor) === monitorGroupFilter);

    const term = monitorSearch.trim().toLowerCase();
    if (!term) return byGroup;

    return byGroup.filter((monitor) => {
      return (
        monitor.name.toLowerCase().includes(term) ||
        monitor.target.toLowerCase().includes(term) ||
        String(monitor.id) === term
      );
    });
  }, [monitorGroupFilter, monitorSearch, sortedMonitors]);

  const pausedMonitorIds = useMemo(
    () =>
      new Set(
        monitors.filter((monitor) => monitor.status === 'paused').map((monitor) => monitor.id),
      ),
    [monitors],
  );

  const monitorOpsById = useMemo(() => {
    const map = new Map<number, MonitorOpsSnapshot>();
    for (const card of homepageQuery.data?.monitors ?? []) {
      if (pausedMonitorIds.has(card.id)) continue;
      const dayMilli = card.uptime_day_strip.uptime_pct_milli;
      const todayMilli = dayMilli.length > 0 ? dayMilli[dayMilli.length - 1] : null;
      const latencies = card.heartbeat_strip.latency_ms.filter(
        (value): value is number => typeof value === 'number',
      );
      map.set(card.id, {
        card,
        uptimeToday: todayMilli === null || todayMilli === undefined ? null : todayMilli / 1000,
        uptime30d: card.uptime_30d?.uptime_pct ?? null,
        p95: latencies.length > 0 ? percentile(latencies, 0.95) : null,
      });
    }
    return map;
  }, [homepageQuery.data?.monitors, pausedMonitorIds]);

  // Open incidents by monitor, so a row can flag itself as part of an ongoing incident.
  const openIncidentByMonitorId = useMemo(() => {
    const map = new Map<number, Incident>();
    for (const incident of incidentsQuery.data?.incidents ?? []) {
      if (incident.status === 'resolved') continue;
      for (const monitorId of incident.monitor_ids) {
        if (!map.has(monitorId)) map.set(monitorId, incident);
      }
    }
    return map;
  }, [incidentsQuery.data?.incidents]);

  const ratingLevel: UptimeRatingLevel =
    homepageQuery.data?.uptime_rating_level ?? settings?.uptime_rating_level ?? 3;

  const monitorCountsByGroup = useMemo(() => {
    return new Map(orderedMonitorGroups.map((group) => [group.label, group.count] as const));
  }, [orderedMonitorGroups]);

  const selectedMonitorIdSet = useMemo(() => new Set(selectedMonitorIds), [selectedMonitorIds]);

  const incidentList = useMemo(
    () => incidentListQuery.data?.pages.flatMap((page) => page.incidents) ?? [],
    [incidentListQuery.data?.pages],
  );

  const visibleMonitorIds = useMemo(
    () => filteredMonitors.map((monitor) => monitor.id),
    [filteredMonitors],
  );

  const allVisibleMonitorsSelected =
    visibleMonitorIds.length > 0 && visibleMonitorIds.every((id) => selectedMonitorIdSet.has(id));

  const hiddenSelectedCount =
    selectedMonitorIds.length -
    visibleMonitorIds.filter((id) => selectedMonitorIdSet.has(id)).length;

  const channelNameById = useMemo(
    () =>
      new Map(
        (channelsQuery.data?.notification_channels ?? []).map((ch) => [ch.id, ch.name] as const),
      ),
    [channelsQuery.data?.notification_channels],
  );
  const toUiGroupLabel = (groupLabel: string) => displayGroupLabel(groupLabel, ungroupedLabel);
  const toggleVisibleMonitors = () => {
    if (allVisibleMonitorsSelected) {
      setSelectedMonitorIds((previous) => previous.filter((id) => !visibleMonitorIds.includes(id)));
      return;
    }
    setSelectedMonitorIds((previous) => [...new Set([...previous, ...visibleMonitorIds])]);
  };
  const selectedMonitors = monitors.filter((monitor) => selectedMonitorIds.includes(monitor.id));
  const toggleMonitor = (id: number) => {
    setSelectedMonitorIds((previous) =>
      previous.includes(id)
        ? previous.filter((selectedId) => selectedId !== id)
        : [...previous, id],
    );
  };

  const sortMenu = (
    <MonitorSortControl
      mode={monitorSortMode}
      direction={monitorSortDirection}
      onModeChange={setMonitorSortMode}
      onDirectionChange={setMonitorSortDirection}
    />
  );

  const renameGroupMut = useMutation({
    mutationFn: ({ from, to }: { from: string; to: string }) => renameMonitorGroup(from, to),
    onSuccess: async () => {
      setModal({ type: 'none' });
      setMonitorGroupManageError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-homepage'] });
    },
    onError: (error) => setMonitorGroupManageError(formatError(error) ?? ''),
  });

  const removeGroupMut = useMutation({
    mutationFn: (name: string) => removeMonitorGroup(name),
    onSuccess: async () => {
      setModal({ type: 'none' });
      setMonitorGroupManageError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-monitors'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-homepage'] });
    },
    onError: (error) => setMonitorGroupManageError(formatError(error) ?? ''),
  });

  const bulkMovePanel = (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 text-xs text-ink-2 dark:text-ink-3">
          {t('admin_dashboard.bulk_assign_target_group')}
          <Select
            className="ui-select mt-1"
            aria-label={t('admin_dashboard.bulk_assign_target_group')}
            disabled={bulkBusy}
            value={bulkTargetGroup}
            onChange={(next) => {
              setBulkTargetGroup(next);
              setBulkTargetGroupSortOrderInput('');
            }}
          >
            <option value="">{t('admin_dashboard.bulk_assign_choose')}</option>
            <option value={BULK_UNGROUPED}>{ungroupedLabel}</option>
            {monitorGroupLabels
              .filter((label) => label !== UNGROUPED_LABEL)
              .map((label) => (
                <option key={label} value={`${BULK_EXISTING_PREFIX}${label}`}>
                  {label}
                </option>
              ))}
            <option value={BULK_NEW_GROUP}>{t('admin_dashboard.bulk_assign_new_group')}</option>
          </Select>
        </label>
        {bulkTargetGroup === BULK_NEW_GROUP && (
          <label className="min-w-[12rem] flex-1 text-xs text-ink-2 dark:text-ink-3">
            {t('admin_dashboard.bulk_assign_new_name')}
            <input
              className="ui-input mt-1"
              value={bulkNewGroupName}
              disabled={bulkBusy}
              onChange={(event) => setBulkNewGroupName(event.target.value)}
              maxLength={64}
            />
            {bulkNewGroupName.trim().length > 0 && bulkTargetGroupName === null && (
              <span role="alert" className="mt-1 block text-red-600 dark:text-red-400">
                {t('admin_dashboard.bulk_assign_invalid_name')}
              </span>
            )}
          </label>
        )}
        <Button
          type="button"
          disabled={!bulkTargetValid || !bulkSortOrderValid || bulkBusy}
          onClick={() => assignSelectedMonitorsMut.mutate()}
        >
          {assignSelectedMonitorsMut.isPending
            ? t('admin_dashboard.bulk_assign_apply_pending')
            : t('admin_dashboard.bulk_assign_apply', {
                count: selectedMonitorIds.length,
              })}
        </Button>
      </div>
      <details className="mt-3 text-xs text-ink-2 dark:text-ink-3">
        <summary className="cursor-pointer">
          {t('admin_dashboard.bulk_assign_target_group_order')}
        </summary>
        <input
          type="number"
          value={bulkTargetGroupSortOrderInput}
          disabled={bulkBusy}
          onChange={(event) => setBulkTargetGroupSortOrderInput(event.target.value)}
          min={-100000}
          max={100000}
          className="ui-input mt-2 max-w-48"
          placeholder={t('admin_dashboard.bulk_assign_target_group_order_placeholder')}
          aria-label={t('admin_dashboard.bulk_assign_target_group_order')}
        />
        {!bulkSortOrderValid && (
          <p role="alert" className="mt-1 text-red-600 dark:text-red-400">
            {t('admin_dashboard.bulk_assign_order_invalid')}
          </p>
        )}
      </details>
    </>
  );

  const bulkEditPanel = (
    <form
      className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!bulkEditValid || bulkBusy) return;
        const patch: PatchMonitorInput = {};
        if (bulkInterval.trim()) patch.interval_sec = intervalValue;
        if (bulkTimeout.trim()) patch.timeout_ms = timeoutValue;
        if (bulkActive) patch.is_active = bulkActive === 'true';
        if (bulkVisibility) patch.show_on_status_page = bulkVisibility === 'true';
        bulkEditMut.mutate({ ids: [...selectedMonitorIds], patch });
      }}
    >
      <label className="min-w-0 text-xs text-ink-2 dark:text-ink-3">
        {t('monitor_form.interval_sec')}
        <input
          className="ui-input mt-1"
          type="number"
          min={60}
          step={1}
          value={bulkInterval}
          disabled={bulkBusy}
          placeholder={t('admin_dashboard.bulk_keep')}
          onChange={(event) => setBulkInterval(event.target.value)}
        />
      </label>
      <label className="min-w-0 text-xs text-ink-2 dark:text-ink-3">
        {t('monitor_form.timeout_ms')}
        <input
          className="ui-input mt-1"
          type="number"
          min={1000}
          step={1}
          value={bulkTimeout}
          disabled={bulkBusy}
          placeholder={t('admin_dashboard.bulk_keep')}
          onChange={(event) => setBulkTimeout(event.target.value)}
        />
      </label>
      <label className="min-w-0 text-xs text-ink-2 dark:text-ink-3">
        {t('admin_dashboard.bulk_active')}
        <Select
          className="ui-select mt-1"
          value={bulkActive}
          disabled={bulkBusy}
          onChange={setBulkActive}
        >
          <option value="">{t('admin_dashboard.bulk_keep')}</option>
          <option value="true">{t('admin_dashboard.bulk_enable')}</option>
          <option value="false">{t('admin_dashboard.bulk_disable')}</option>
        </Select>
      </label>
      <label className="min-w-0 text-xs text-ink-2 dark:text-ink-3">
        {t('monitor_form.show_on_status_page')}
        <Select
          className="ui-select mt-1"
          value={bulkVisibility}
          disabled={bulkBusy}
          onChange={setBulkVisibility}
        >
          <option value="">{t('admin_dashboard.bulk_keep')}</option>
          <option value="true">{t('admin_dashboard.bulk_show')}</option>
          <option value="false">{t('admin_dashboard.bulk_hide')}</option>
        </Select>
      </label>
      <div className="sm:col-span-2 xl:col-span-4">
        <Button type="submit" disabled={!bulkEditValid || bulkBusy}>
          {bulkEditMut.isPending
            ? t('common.saving')
            : t('admin_dashboard.bulk_edit_apply', {
                count: selectedMonitorIds.length,
              })}
        </Button>
      </div>
    </form>
  );

  const bulkBar = selectionMode ? (
    <div role="region" aria-label={t('admin_dashboard.bulk_assign_title')} className="ui-bulk-bar">
      <span className="ui-bulk-bar-count">
        {t('admin_dashboard.bulk_assign_selected', { count: selectedMonitorIds.length })}
      </span>
      <button
        type="button"
        disabled={bulkBusy}
        onClick={() => {
          setMonitorGroupManageError(null);
          setModal({ type: 'bulk-move' });
        }}
        className="ui-bulk-bar-action ui-bulk-bar-action-boxed"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z"
          />
        </svg>
        {t('admin_dashboard.bulk_move')}
      </button>
      {/* Reference: with nothing selected the action reads Unpause and becomes Pause once rows are
            selected; there is nothing to act on at zero, so it stays disabled until then. */}
      <button
        type="button"
        disabled={bulkBusy || selectedMonitorIds.length === 0}
        onClick={() =>
          bulkEditMut.mutate({
            ids: [...selectedMonitorIds],
            patch: { is_active: selectedMonitorIds.length === 0 },
          })
        }
        className="ui-bulk-bar-action ui-bulk-bar-action-boxed"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25v13.5m-7.5-13.5v13.5" />
        </svg>
        {selectedMonitorIds.length === 0 ? t('common.resume') : t('common.pause')}
      </button>
      <div className="relative" ref={bulkMenuRef}>
        <button
          type="button"
          disabled={bulkBusy}
          aria-haspopup="menu"
          aria-expanded={showBulkMenu}
          aria-label={t('admin_dashboard.bulk_actions')}
          title={t('admin_dashboard.bulk_actions')}
          onClick={() => setShowBulkMenu((prev) => !prev)}
          className="ui-bulk-bar-action ui-bulk-bar-action-boxed ui-bulk-bar-more"
        >
          <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
            <circle cx="6" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="18" cy="12" r="1.6" />
          </svg>
        </button>
        {showBulkMenu ? (
          <div role="menu" className="ui-sort-menu ui-bulk-menu">
            <button
              type="button"
              role="menuitem"
              className="ui-sort-menu-item"
              onClick={() => {
                setShowBulkMenu(false);
                bulkEditMut.mutate({
                  ids: [...selectedMonitorIds],
                  patch: { is_active: true },
                });
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                />
              </svg>
              {t('common.resume')}
            </button>
            {BULK_CONFIG_PROPERTIES.map(({ property, labelKey, icon }) => (
              <button
                key={property}
                type="button"
                role="menuitem"
                className="ui-sort-menu-item"
                onClick={() => {
                  setShowBulkMenu(false);
                  setModal({ type: 'bulk-configure', property });
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
                </svg>
                {t(labelKey)}
              </button>
            ))}
            <div className="ui-sort-menu-divider" />
            <button
              type="button"
              role="menuitem"
              className="ui-sort-menu-item ui-sort-menu-item-danger"
              onClick={() => {
                setShowBulkMenu(false);
                if (
                  window.confirm(
                    t('admin_dashboard.bulk_delete_confirm', {
                      count: selectedMonitorIds.length,
                    }),
                  )
                ) {
                  bulkDeleteMut.mutate([...selectedMonitorIds]);
                }
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.7}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165"
                />
              </svg>
              {t('admin_dashboard.bulk_delete')}
            </button>
          </div>
        ) : null}
      </div>
      <button
        type="button"
        disabled={bulkBusy}
        aria-label={t('admin_dashboard.bulk_assign_clear')}
        title={t('admin_dashboard.bulk_assign_clear')}
        onClick={() => {
          setSelectedMonitorIds([]);
          setSelectionMode(false);
          setShowBulkMenu(false);
          setBulkTargetGroup('');
          setBulkNewGroupName('');
          setBulkTargetGroupSortOrderInput('');
          setMonitorGroupManageError(null);
        }}
        className="ui-bulk-bar-close"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  ) : null;

  return (
    <AdminShell active="dashboard" layout="sidebar" dashboardTab={tab}>
      <main
        className={cn(
          'mx-auto px-5 pb-8',
          tab === 'settings'
            ? 'box-border w-full max-w-[1040px] pt-8'
            : 'ui-monitor-page max-w-[1040px] pt-2.5',
        )}
      >
        {/* Tab bodies swap in place with a short fade instead of an instant clear. */}
        <div key={tab} className="ui-page-enter">
          {tab === 'monitors' && (
            <div className="space-y-5">
              <AdminPageHeader
                title={t('admin_dashboard.tab.monitors')}
                description={t('admin_dashboard.monitors_description')}
                className="ui-monitor-page-header"
                actions={
                  <>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowMonitorFilters((previous) => !previous)}
                        aria-label={t('admin_dashboard.group_filter')}
                        aria-expanded={showMonitorFilters}
                        title={t('admin_dashboard.group_filter')}
                        className="ui-btn-secondary ui-icon-btn ui-monitor-filter-button h-9 w-9"
                      >
                        <svg
                          className="h-4 w-4"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M1.66406 3H14.3307"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M3.66406 8H12.3307"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M5.66406 13H10.3307"
                          />
                        </svg>
                      </button>
                      {showMonitorFilters ? (
                        <div
                          role="group"
                          aria-label={t('admin_dashboard.group_filter')}
                          className="ui-panel absolute right-0 top-11 z-30 w-64 space-y-3 p-3 shadow-lg"
                        >
                          <label className="block text-[11px] font-medium text-ink-2">
                            {t('admin_dashboard.group_filter')}
                            <Select
                              value={monitorGroupFilter}
                              onChange={setMonitorGroupFilter}
                              aria-label={t('admin_dashboard.group_filter')}
                              className="ui-compact ui-select mt-1"
                            >
                              <option value={ALL_GROUPS_FILTER}>
                                {t('admin_dashboard.group_all')}
                              </option>
                              {monitorGroupLabels.map((label) => (
                                <option key={label} value={label}>
                                  {toUiGroupLabel(label)}
                                </option>
                              ))}
                            </Select>
                          </label>
                          <label className="block text-[11px] font-medium text-ink-2">
                            {t('common.sort')}
                            <Select
                              value={monitorSortMode}
                              onChange={(next) => setMonitorSortMode(next as MonitorSortMode)}
                              aria-label={t('common.sort')}
                              className="ui-compact ui-select mt-1"
                            >
                              <option value="configured">
                                {t('admin_dashboard.monitor_sort_mode_configured')}
                              </option>
                              <option value="status">{t('common.state')}</option>
                              <option value="name">{t('common.name')}</option>
                              <option value="last_checked_at">
                                {t('admin_dashboard.monitor_sort_mode_last_check')}
                              </option>
                              <option value="created_at">
                                {t('admin_dashboard.monitor_sort_mode_created_time')}
                              </option>
                            </Select>
                          </label>
                          <label className="block text-[11px] font-medium text-ink-2">
                            {t('common.direction')}
                            <Select
                              value={monitorSortDirection}
                              onChange={(next) =>
                                setMonitorSortDirection(next as MonitorSortDirection)
                              }
                              aria-label={t('common.direction')}
                              className="ui-compact ui-select mt-1"
                            >
                              <option value="asc">{t('common.asc')}</option>
                              <option value="desc">{t('common.desc')}</option>
                            </Select>
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectionMode(true);
                              setShowMonitorFilters(false);
                            }}
                            className="w-full border-t border-line-soft pt-3 text-left text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
                          >
                            {t('admin_dashboard.monitor_enter_selection')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectionMode(true);
                              toggleVisibleMonitors();
                            }}
                            className="w-full text-left text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
                          >
                            {t('admin_dashboard.monitor_select_all')}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowGroupManager(true);
                              setShowMonitorFilters(false);
                            }}
                            className="w-full border-t border-line-soft pt-3 text-left text-[12px] font-medium text-ink-2 transition-colors hover:text-ink"
                          >
                            {t('admin_dashboard.group_manager_title')}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    {/* The reference keeps sort in the group header; the flat view has no header, so it
                        only falls back to the toolbar there. Rendering both would open two popovers. */}
                    {monitorGroupMode === 'flat' ? sortMenu : null}

                    <div className="ui-split-button" ref={createMenuRef}>
                      <Button
                        className="ui-monitor-create-button"
                        onClick={() => {
                          createMonitorMut.reset();
                          updateMonitorMut.reset();
                          setModal({ type: 'create-monitor' });
                        }}
                      >
                        {t('admin_dashboard.create_monitor')}
                      </Button>
                      <button
                        type="button"
                        aria-haspopup="menu"
                        aria-expanded={showCreateMenu}
                        aria-label={t('admin_dashboard.create_monitor')}
                        onClick={() => setShowCreateMenu((previous) => !previous)}
                        className="ui-split-button-caret"
                      >
                        <svg
                          className="h-2.5 w-2.5"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3.6}
                          aria-hidden
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                        </svg>
                      </button>
                      {showCreateMenu ? (
                        <div
                          role="menu"
                          className="animate-fade-in ui-panel absolute right-0 top-10 z-30 w-[190px] overflow-hidden p-1"
                        >
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowCreateMenu(false);
                              createMonitorMut.reset();
                              updateMonitorMut.reset();
                              setModal({ type: 'create-monitor', initialType: 'http' });
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            <svg
                              className="h-3.5 w-3.5 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418"
                              />
                            </svg>
                            {t('monitor_form.type_http')}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowCreateMenu(false);
                              createMonitorMut.reset();
                              updateMonitorMut.reset();
                              setModal({ type: 'create-monitor', initialType: 'heartbeat' });
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            <svg
                              className="h-3.5 w-3.5 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M3 12h3.2l1.9-5 3.2 10 2.1-5H21"
                              />
                            </svg>
                            {t('monitor_form.type_heartbeat')}
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                              setShowCreateMenu(false);
                              createMonitorMut.reset();
                              updateMonitorMut.reset();
                              setModal({ type: 'create-monitor', initialType: 'tcp' });
                            }}
                            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:bg-surface-2 hover:text-ink"
                          >
                            <svg
                              className="h-3.5 w-3.5 shrink-0"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={1.5}
                              aria-hidden
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 0 6h13.5a3 3 0 1 0 0-6m-16.5-3a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3m-19.5 0a4.5 4.5 0 0 1 .9-2.7L5.737 5.1a3.375 3.375 0 0 1 2.7-1.35h7.126c1.062 0 2.062.5 2.7 1.35l2.587 3.45a4.5 4.5 0 0 1 .9 2.7m0 0a3 3 0 0 1-3 3m0 3h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Zm-3 6h.008v.008h-.008v-.008Zm0-6h.008v.008h-.008v-.008Z"
                              />
                            </svg>
                            {t('monitor_form.type_tcp')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </>
                }
                search={
                  <div className="relative w-full sm:w-[265px]">
                    <svg
                      className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-3"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                      />
                    </svg>
                    <input
                      type="search"
                      value={monitorSearch}
                      onChange={(event) => setMonitorSearch(event.target.value)}
                      placeholder={t('admin_dashboard.search_monitors')}
                      aria-label={t('admin_dashboard.search_monitors_label')}
                      className={cn(INPUT_CLASS, 'ui-compact ui-search')}
                    />
                    <span className="ui-kbd pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                      /
                    </span>
                  </div>
                }
              />

              <AdminTabs
                className="ui-monitor-tabs"
                tabs={[
                  {
                    key: 'grouped',
                    label: t('admin_dashboard.monitor_group_mode_grouped'),
                  },
                  {
                    key: 'flat',
                    label: t('admin_dashboard.tab_all_monitors'),
                  },
                ]}
                value={monitorGroupMode}
                onChange={(next) => setMonitorGroupMode(next as MonitorGroupMode)}
              />

              {monitorsQuery.isLoading ? (
                <div className="ui-panel mt-3 overflow-hidden">
                  {[0, 1, 2, 3, 4].map((row) => (
                    <div
                      key={row}
                      className="ui-monitor-row flex min-h-[57px] items-center gap-4 px-4 sm:px-5"
                    >
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <Skeleton className="h-4 w-52 max-w-[70%]" />
                        <Skeleton className="h-3 w-32" />
                      </div>
                      <Skeleton className="hidden h-4 w-20 sm:block" />
                    </div>
                  ))}
                </div>
              ) : !monitors.length ? (
                <Card className="mt-3 p-6 text-center text-ink-2 sm:p-8 dark:text-ink-3">
                  {t('admin_dashboard.no_monitors_yet')}
                </Card>
              ) : (
                <div className="grid gap-4 pt-3">
                  <div className="order-2 space-y-4">
                    <div className={cn('ui-panel overflow-hidden', !showGroupManager && 'hidden')}>
                      <button
                        type="button"
                        onClick={() => setShowGroupManager((previous) => !previous)}
                        aria-expanded={showGroupManager}
                        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left transition-colors hover:bg-surface-2 dark:hover:bg-surface-2"
                      >
                        <span className="flex items-center gap-2">
                          <svg
                            className="h-4 w-4 text-ink-3"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={1.8}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z"
                            />
                          </svg>
                          <span className="text-[13px] font-medium text-ink">
                            {t('admin_dashboard.group_manager_title')}
                          </span>
                        </span>
                        <span className="flex items-center gap-2 text-[11px] text-ink-3 dark:text-ink-2">
                          {t(
                            orderedMonitorGroups.length === 1
                              ? 'admin_dashboard.group_manager_count_one'
                              : 'admin_dashboard.group_manager_count',
                            { count: orderedMonitorGroups.length },
                          )}
                          <svg
                            className="ui-chevron h-3.5 w-3.5"
                            data-open={showGroupManager}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" />
                          </svg>
                        </span>
                      </button>
                      <div className="ui-expand" data-open={showGroupManager}>
                        <div>
                          <div className="grid gap-2 border-t border-line-soft px-4 py-3 sm:grid-cols-2 xl:grid-cols-3 dark:border-line">
                            <button
                              type="button"
                              onClick={() => setMonitorGroupFilter(ALL_GROUPS_FILTER)}
                              className={cn(
                                'flex w-full items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                                monitorGroupFilter === ALL_GROUPS_FILTER
                                  ? 'border-ink bg-ink text-surface'
                                  : 'border-line text-ink-2 hover:bg-surface-2 dark:border-line dark:text-ink-2 dark:hover:bg-surface-2',
                              )}
                            >
                              <span>{t('admin_dashboard.group_all')}</span>
                              <span className="tabular-nums">{sortedMonitors.length}</span>
                            </button>
                            {orderedMonitorGroups.map((group, index) => {
                              const active = monitorGroupFilter === group.label;
                              const isFirst = index === 0;
                              const isLast = index === orderedMonitorGroups.length - 1;

                              return (
                                <div
                                  key={group.label}
                                  className={cn(
                                    'group/group-row flex items-center gap-2 rounded-lg',
                                    dragOverGroup === group.label &&
                                      'bg-blue-100 dark:bg-blue-900/40',
                                  )}
                                  onDragOver={(event) => {
                                    if (
                                      draggedGroup &&
                                      draggedGroup !== group.label &&
                                      !moveMonitorGroupMut.isPending
                                    ) {
                                      event.preventDefault();
                                      event.dataTransfer.dropEffect = 'move';
                                      setDragOverGroup(group.label);
                                    }
                                  }}
                                  onDrop={(event) => {
                                    event.preventDefault();
                                    const source = event.dataTransfer.getData('text/plain');
                                    setDraggedGroup(null);
                                    setDragOverGroup(null);
                                    if (
                                      source &&
                                      source !== group.label &&
                                      !moveMonitorGroupMut.isPending
                                    ) {
                                      moveMonitorGroupMut.mutate({
                                        groupLabel: source,
                                        toIndex: index,
                                      });
                                    }
                                  }}
                                >
                                  <button
                                    type="button"
                                    draggable={
                                      !moveMonitorGroupMut.isPending &&
                                      orderedMonitorGroups.length > 1
                                    }
                                    disabled={
                                      moveMonitorGroupMut.isPending ||
                                      orderedMonitorGroups.length < 2
                                    }
                                    aria-label={t('admin_dashboard.group_drag', {
                                      group: toUiGroupLabel(group.label),
                                    })}
                                    title={t('admin_dashboard.group_drag', {
                                      group: toUiGroupLabel(group.label),
                                    })}
                                    className="cursor-grab rounded px-1 py-2 text-ink-3 opacity-0 transition-opacity focus-visible:opacity-100 group-hover/group-row:opacity-100 active:cursor-grabbing disabled:opacity-0"
                                    onDragStart={(event) => {
                                      event.dataTransfer.setData('text/plain', group.label);
                                      event.dataTransfer.effectAllowed = 'move';
                                      setDraggedGroup(group.label);
                                    }}
                                    onDragEnd={() => {
                                      setDraggedGroup(null);
                                      setDragOverGroup(null);
                                    }}
                                  >
                                    <span aria-hidden="true">⋮⋮</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setMonitorGroupFilter(group.label)}
                                    className={cn(
                                      'flex min-w-0 flex-1 items-center justify-between rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                                      active
                                        ? 'border-ink bg-ink text-surface'
                                        : 'border-line text-ink-2 hover:bg-surface-2 dark:border-line dark:text-ink-2 dark:hover:bg-surface-2',
                                    )}
                                  >
                                    <span className="truncate">{toUiGroupLabel(group.label)}</span>
                                    <span className="ml-2 tabular-nums">{group.count}</span>
                                  </button>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      title={t('admin_dashboard.group_move_up')}
                                      onClick={() =>
                                        moveMonitorGroupMut.mutate({
                                          groupLabel: group.label,
                                          toIndex: index - 1,
                                        })
                                      }
                                      disabled={isFirst || moveMonitorGroupMut.isPending}
                                      className="rounded border border-line px-2 py-1 text-[11px] font-semibold text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line dark:text-ink dark:hover:bg-surface-2"
                                    >
                                      ↑
                                    </button>
                                    <button
                                      type="button"
                                      title={t('admin_dashboard.group_move_down')}
                                      onClick={() =>
                                        moveMonitorGroupMut.mutate({
                                          groupLabel: group.label,
                                          toIndex: index + 1,
                                        })
                                      }
                                      disabled={isLast || moveMonitorGroupMut.isPending}
                                      className="rounded border border-line px-2 py-1 text-[11px] font-semibold text-ink-2 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50 dark:border-line dark:text-ink dark:hover:bg-surface-2"
                                    >
                                      ↓
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>

                    {monitorGroupReorderError && (
                      <Card className="p-3 border-red-200 bg-red-50/70 dark:bg-red-500/10 dark:border-red-400/30">
                        <div className="text-sm text-red-700 dark:text-red-300">
                          {monitorGroupReorderError}
                        </div>
                      </Card>
                    )}
                  </div>

                  <div className="order-1 min-w-0 space-y-2.5">
                    {filteredMonitors.length === 0 ? (
                      <Card className="p-6 text-center text-sm text-ink-2 sm:p-8 dark:text-ink-3">
                        {monitorSearch.trim()
                          ? t('admin_dashboard.monitor_no_match')
                          : t('admin_dashboard.monitor_empty_in_group')}
                      </Card>
                    ) : (
                      <>
                        <MonitorList
                          monitors={filteredMonitors}
                          metricsById={monitorOpsById}
                          incidentsByMonitorId={openIncidentByMonitorId}
                          groupMode={monitorGroupMode}
                          groupLabelOf={monitorGroupLabel}
                          groupLabelText={toUiGroupLabel}
                          groupCounts={monitorCountsByGroup}
                          selectedIds={selectedMonitorIdSet}
                          bulkBusy={bulkBusy}
                          ratingLevel={ratingLevel}
                          timeZone={settings?.site_timezone ?? 'UTC'}
                          stateThresholdDefaults={stateThresholdDefaults}
                          testingMonitorId={testingMonitorId}
                          selectionMode={selectionMode}
                          onToggleSelect={toggleMonitor}
                          sortControl={sortMenu}
                          onCreateInGroup={(groupLabel) => {
                            createMonitorMut.reset();
                            updateMonitorMut.reset();
                            setModal({
                              type: 'create-monitor',
                              initialGroup: groupLabel === UNGROUPED_LABEL ? undefined : groupLabel,
                            });
                          }}
                          onEnterSelectionMode={() => setSelectionMode(true)}
                          onReorderGroup={(source, target) => {
                            const ordered = orderedMonitorGroups.map((group) => group.label);
                            const toIndex = ordered.indexOf(target);
                            if (toIndex < 0 || source === target) return;
                            moveMonitorGroupMut.mutate({ groupLabel: source, toIndex });
                          }}
                          onOpen={(monitor) => navigate(adminMonitorDetailPath(monitor.id))}
                          onTest={(monitor) => {
                            setMonitorTestFeedback(null);
                            setTestingMonitorId(monitor.id);
                            testMonitorMut.mutate(monitor.id);
                          }}
                          onTogglePause={(monitor) => {
                            if (monitor.status === 'paused') resumeMonitorMut.mutate(monitor.id);
                            else pauseMonitorMut.mutate(monitor.id);
                          }}
                          onEdit={(monitor) => {
                            updateMonitorMut.reset();
                            setModal({ type: 'edit-monitor', monitor });
                          }}
                          onDelete={(monitor) => {
                            if (window.confirm(`${t('common.delete')} "${monitor.name}"?`)) {
                              deleteMonitorMut.mutate(monitor.id);
                            }
                          }}
                          onViewIncidents={(monitor) => {
                            const incident = openIncidentByMonitorId.get(monitor.id);
                            navigate(
                              incident
                                ? adminIncidentDetailPath(incident.id)
                                : adminMonitorDetailPath(monitor.id),
                            );
                          }}
                          onDuplicate={(monitor) => duplicateMonitorMut.mutate(monitor.id)}
                          onDuplicatePending={() => duplicateMonitorMut.isPending}
                          onSendTestAlert={(monitor) => sendTestAlertMut.mutate(monitor.id)}
                          onCreateGroup={() => setModal({ type: 'create-group' })}
                          onRenameGroup={(label) => {
                            setMonitorGroupManageError(null);
                            setGroupNameDraft(label);
                            setModal({ type: 'rename-group', label });
                          }}
                          onRemoveGroup={(label) => {
                            setMonitorGroupManageError(null);
                            setModal({ type: 'remove-group', label });
                          }}
                          footer={
                            <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 text-[11px] text-ink-2 dark:text-ink-3">
                              <span>
                                {t('admin_dashboard.monitor_list_summary', {
                                  filtered: filteredMonitors.length,
                                  total: sortedMonitors.length,
                                })}
                                {monitorGroupFilter !== ALL_GROUPS_FILTER && (
                                  <span className="ml-1 font-medium text-ink">
                                    {toUiGroupLabel(monitorGroupFilter)}
                                  </span>
                                )}
                                {' · '}
                                {t('admin_dashboard.monitor_list_summary_selected', {
                                  count: selectedMonitorIds.length,
                                })}
                              </span>
                            </div>
                          }
                        />
                        {monitorsQuery.hasNextPage || monitorsQuery.isFetchNextPageError ? (
                          <div className="flex justify-center pt-1">
                            <Button
                              variant="secondary"
                              disabled={monitorsQuery.isFetchingNextPage}
                              aria-busy={monitorsQuery.isFetchingNextPage}
                              onClick={() => void monitorsQuery.fetchNextPage()}
                            >
                              {monitorsQuery.isFetchingNextPage
                                ? t('common.loading_ellipsis')
                                : monitorsQuery.isFetchNextPageError
                                  ? t('common.retry')
                                  : t('common.load_more')}
                            </Button>
                          </div>
                        ) : null}
                      </>
                    )}
                    {bulkBar}
                  </div>
                </div>
              )}
            </div>
          )}

          {tab === 'notifications' && (
            <div className="ui-monitor-page space-y-10">
              <AdminPageHeader
                title={t('admin_dashboard.tab.notifications')}
                className="ui-monitor-page-header"
                search={
                  <AdminSearchField
                    value={notificationSearch}
                    onChange={setNotificationSearch}
                    label={t('admin_dashboard.search_notifications')}
                  />
                }
                actions={
                  notificationView === 'deliveries' ? (
                    <Button
                      variant="secondary"
                      disabled={deliveriesQuery.isFetching}
                      onClick={() => void deliveriesQuery.refetch()}
                    >
                      {deliveriesQuery.isFetching ? t('common.loading') : t('common.refresh')}
                    </Button>
                  ) : (
                    <Button
                      onClick={() =>
                        setModal({
                          type: notificationView === 'channels' ? 'create-channel' : 'create-group',
                        })
                      }
                    >
                      {t(
                        notificationView === 'channels'
                          ? 'admin_dashboard.create_channel'
                          : 'admin_dashboard.create_group',
                      )}
                    </Button>
                  )
                }
              />
              <AdminTabs
                tabs={[
                  { key: 'channels', label: t('admin_dashboard.notification_channels_title') },
                  { key: 'groups', label: t('admin_dashboard.notification_groups_title') },
                  { key: 'deliveries', label: t('notification_delivery.title') },
                ]}
                value={notificationView}
                onChange={setNotificationView}
              />
              {notificationView === 'channels' &&
                (channelsQuery.isLoading ? (
                  <SkeletonRows
                    className="ui-panel overflow-hidden"
                    rows={4}
                    rowClassName="ui-resource-row ui-resource-grid"
                    cells={[
                      'w-44',
                      'hidden w-40 lg:block',
                      'hidden w-24 sm:block',
                      'ml-auto h-5 w-5',
                    ]}
                  />
                ) : channelsQuery.isError ? (
                  <div
                    role="alert"
                    className="ui-panel flex flex-wrap items-center justify-between gap-3 p-4 text-status-down"
                  >
                    <span>
                      {formatError(channelsQuery.error) ??
                        t('admin_dashboard.channels_load_failed')}
                    </span>
                    <Button variant="secondary" onClick={() => void channelsQuery.refetch()}>
                      {t('common.retry')}
                    </Button>
                  </div>
                ) : (
                  <NotificationChannelList
                    channels={channelsQuery.data?.notification_channels ?? []}
                    search={notificationSearch}
                    onEdit={(channel) => setModal({ type: 'edit-channel', channel })}
                    onDelete={(channel) => {
                      if (confirm(`${t('common.delete')} "${channel.name}"?`))
                        deleteChannelMut.mutate(channel.id);
                    }}
                    onTest={(channel) => {
                      setTestingChannelId(channel.id);
                      setChannelTestFeedback(null);
                      setChannelTestError(null);
                      testChannelMut.mutate(channel.id);
                    }}
                    testingId={testingChannelId}
                    testPending={testChannelMut.isPending}
                    deletePending={deleteChannelMut.isPending}
                  />
                ))}
              {notificationView === 'groups' &&
                (groupsQuery.isLoading ? (
                  <SkeletonRows
                    className="ui-panel overflow-hidden"
                    rows={3}
                    rowClassName="ui-resource-row ui-resource-grid"
                    cells={[
                      'w-40',
                      'hidden w-36 lg:block',
                      'hidden w-24 sm:block',
                      'ml-auto h-5 w-5',
                    ]}
                  />
                ) : groupsQuery.isError ? (
                  <div
                    role="alert"
                    className="ui-panel flex flex-wrap items-center justify-between gap-3 p-4 text-status-down"
                  >
                    <span>
                      {formatError(groupsQuery.error) ?? t('admin_dashboard.groups_load_failed')}
                    </span>
                    <Button variant="secondary" onClick={() => void groupsQuery.refetch()}>
                      {t('common.retry')}
                    </Button>
                  </div>
                ) : (
                  <NotificationGroupList
                    groups={groupsQuery.data?.notification_groups ?? []}
                    search={notificationSearch}
                    onEdit={(group) => setModal({ type: 'edit-group', group })}
                    onDelete={(group) => {
                      if (confirm(`${t('common.delete')} "${group.name}"?`))
                        deleteGroupMut.mutate(group.id);
                    }}
                    deletePending={deleteGroupMut.isPending}
                  />
                ))}
              {notificationView === 'deliveries' &&
                (deliveriesQuery.isLoading ? (
                  <SkeletonRows
                    className="ui-panel overflow-hidden"
                    rows={5}
                    rowClassName="grid gap-3 border-b border-line-soft px-4 py-3 md:grid-cols-[11rem_10rem_9rem_6rem_1fr_5.5rem]"
                    cells={['h-4 w-24', 'h-4 w-28', 'h-4 w-24', 'h-4 w-14', 'h-4 w-40']}
                  />
                ) : deliveriesQuery.isError ? (
                  <div
                    role="alert"
                    className="ui-panel flex flex-wrap items-center justify-between gap-3 p-4 text-status-down"
                  >
                    <span>
                      {formatError(deliveriesQuery.error) ?? t('notification_delivery.load_failed')}
                    </span>
                    <Button variant="secondary" onClick={() => void deliveriesQuery.refetch()}>
                      {t('common.retry')}
                    </Button>
                  </div>
                ) : (
                  <NotificationDeliveryList
                    deliveries={deliveriesQuery.data?.deliveries ?? []}
                    search={notificationSearch}
                    timeZone={settings?.site_timezone ?? 'UTC'}
                    retryingId={retryingDeliveryId}
                    onRetry={(delivery) => {
                      setRetryingDeliveryId(delivery.id);
                      retryDeliveryMut.mutate(delivery.id);
                    }}
                  />
                ))}
            </div>
          )}

          {tab === 'settings' && (
            <div className="space-y-10">
              <header className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-[28px] font-semibold leading-[33.6px] tracking-[-0.02em] text-ink">
                  {t('admin_dashboard.tab.settings')}
                </h1>
                <div role="status" aria-live="polite">
                  {patchSettingsMut.isPending ? (
                    <span className="text-[12px] text-ink-2 dark:text-ink-3">
                      {t('admin_dashboard.settings_saving')}
                    </span>
                  ) : Object.keys(unsavedSettingsPatch).length > 0 ? (
                    <div className="flex items-center gap-3 text-[12px] text-status-down">
                      <span>{t('admin_dashboard.settings_save_failed')}</span>
                      <Button
                        variant="ghost"
                        onClick={() => patchSettingsMut.mutate(unsavedSettingsPatch)}
                      >
                        {t('common.retry')}
                      </Button>
                    </div>
                  ) : patchSettingsMut.isSuccess ? (
                    <span className="flex items-center gap-1 text-[12px] text-emerald-600 dark:text-emerald-400">
                      <svg
                        className="h-3.5 w-3.5"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.4}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4 12.5l5 5L20 6.5" />
                      </svg>
                      {t('admin_dashboard.settings_saved')}
                    </span>
                  ) : null}
                </div>
              </header>

              {settingsQuery.isLoading ? (
                <div role="status" className="text-ink-2 dark:text-ink-3">
                  {t('common.loading')}
                </div>
              ) : settingsQuery.isError ? (
                <div
                  role="alert"
                  className="ui-panel flex flex-wrap items-center justify-between gap-3 p-4 text-status-down"
                >
                  <span>{t('admin_dashboard.failed_load_settings')}</span>
                  <Button
                    variant="secondary"
                    disabled={settingsQuery.isFetching}
                    onClick={() => void settingsQuery.refetch()}
                  >
                    {settingsQuery.isFetching ? t('common.loading') : t('common.retry')}
                  </Button>
                </div>
              ) : null}

              <div className="space-y-10">
                <nav aria-label={t('admin_dashboard.tab.settings')} className="mt-6">
                  <ul className="mb-8 flex overflow-x-auto border-b border-line text-ink-2">
                    {SETTINGS_SECTIONS.map((section) => (
                      <li key={section} className="relative">
                        <button
                          type="button"
                          onClick={() => setSettingsSection(section)}
                          aria-current={settingsSection === section ? 'page' : undefined}
                          className={cn(
                            'block rounded-t-lg p-4 text-[14px] leading-[21px] whitespace-nowrap transition-colors',
                            settingsSection === section ? 'text-ink' : 'text-ink-2 hover:text-ink',
                          )}
                        >
                          {t(SETTINGS_SECTION_LABEL_KEYS[section])}
                        </button>
                        {settingsSection === section ? (
                          <span
                            aria-hidden
                            className="absolute inset-x-0 bottom-0 h-[3px] rounded-full bg-accent"
                          />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </nav>

                <div className="space-y-[60px]">
                  {settingsSection === 'general' && (
                    <div className="space-y-[60px]">
                      <SettingsGroup
                        title={t('admin_settings.branding.title')}
                        description={t('admin_settings.branding.help')}
                      >
                        <div className="py-4">
                          <label className="mb-1.5 block text-[12px] font-medium leading-4 text-ink-2">
                            {t('admin_settings.branding.site_title')}
                          </label>
                          <input
                            value={settingsDraft?.site_title ?? ''}
                            aria-label={t('admin_settings.branding.site_title')}
                            onChange={(e) => {
                              const next = e.target.value.slice(0, 100);
                              setSettingsDraft((prev) =>
                                prev ? { ...prev, site_title: next } : prev,
                              );
                            }}
                            onFocus={() => setFocusedSetting('site_title')}
                            onBlur={(e) => {
                              setFocusedSetting(null);
                              const next = sanitizeSiteTitle(e.currentTarget.value);
                              setSettingsDraft((prev) =>
                                prev ? { ...prev, site_title: next } : prev,
                              );
                              patchSettingsMut.mutate({ site_title: next });
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              (e.currentTarget as HTMLInputElement).blur();
                            }}
                            disabled={settingsQuery.isLoading || !settingsDraft}
                            className={cn(INPUT_CLASS, 'ui-compact !h-9 disabled:opacity-50')}
                          />
                        </div>

                        <div className="py-4">
                          <label className="mb-1.5 block text-[12px] font-medium leading-4 text-ink-2">
                            {t('admin_settings.branding.timezone')}
                          </label>
                          <input
                            value={settingsDraft?.site_timezone ?? ''}
                            aria-label={t('admin_settings.branding.timezone')}
                            onChange={(e) => {
                              const next = e.target.value.slice(0, 64);
                              setSettingsDraft((prev) =>
                                prev ? { ...prev, site_timezone: next } : prev,
                              );
                            }}
                            onFocus={() => setFocusedSetting('site_timezone')}
                            onBlur={(e) => {
                              setFocusedSetting(null);
                              const next = e.currentTarget.value.trim().slice(0, 64) || 'UTC';
                              setSettingsDraft((prev) =>
                                prev ? { ...prev, site_timezone: next } : prev,
                              );
                              patchSettingsMut.mutate({ site_timezone: next });
                            }}
                            onKeyDown={(e) => {
                              if (e.key !== 'Enter') return;
                              (e.currentTarget as HTMLInputElement).blur();
                            }}
                            disabled={settingsQuery.isLoading || !settingsDraft}
                            placeholder="UTC"
                            className={cn(INPUT_CLASS, 'ui-compact !h-9 disabled:opacity-50')}
                          />
                          <p className="mt-2 text-[14px] leading-5 text-ink-2">
                            {t('admin_settings.branding.timezone_help')}
                          </p>
                        </div>

                        <div className="py-4">
                          <label className="mb-1.5 block text-[12px] font-medium leading-4 text-ink-2">
                            {t('admin_settings.branding.site_description')}
                          </label>
                          <textarea
                            value={settingsDraft?.site_description ?? ''}
                            aria-label={t('admin_settings.branding.site_description')}
                            onChange={(e) => {
                              const next = e.target.value.slice(0, 500);
                              setSettingsDraft((prev) =>
                                prev ? { ...prev, site_description: next } : prev,
                              );
                            }}
                            onFocus={() => setFocusedSetting('site_description')}
                            onBlur={(e) => {
                              setFocusedSetting(null);
                              const next = sanitizeSiteDescription(e.currentTarget.value);
                              setSettingsDraft((prev) =>
                                prev ? { ...prev, site_description: next } : prev,
                              );
                              patchSettingsMut.mutate({ site_description: next });
                            }}
                            disabled={settingsQuery.isLoading || !settingsDraft}
                            rows={3}
                            className={cn(
                              TEXTAREA_CLASS,
                              'resize-y !text-[14px] disabled:opacity-50',
                            )}
                          />
                        </div>
                      </SettingsGroup>
                      <SettingsGroup
                        title={t('admin_settings.locale.title')}
                        description={t('admin_settings.locale.help')}
                      >
                        <div className="max-w-xs py-4">
                          <Select
                            aria-label={t('admin_settings.locale.title')}
                            value={settingsDraft?.site_locale ?? 'auto'}
                            onChange={(next) => {
                              const value = next as AdminSettings['site_locale'];
                              applyLocaleLocally(value);
                              if (serverLocalePatchSupported) {
                                patchSettingsMut.mutate({ site_locale: value });
                              }
                            }}
                            disabled={settingsQuery.isLoading || !settingsDraft}
                            className="ui-select !h-9 w-full !text-[14px] disabled:opacity-50"
                          >
                            {localeOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                          {localePatchFallbackActive ? (
                            <p className="mt-2 text-[14px] leading-5 text-ink-2">
                              {t('admin_settings.locale.local_only')}
                            </p>
                          ) : null}
                        </div>
                      </SettingsGroup>
                      <SettingsGroup
                        title={t('admin_settings.uptime_rating.title')}
                        description={t('admin_settings.uptime_rating.help')}
                      >
                        <div className="max-w-sm py-4">
                          <Select
                            aria-label={t('admin_settings.uptime_rating.title')}
                            value={settingsDraft?.uptime_rating_level ?? 3}
                            onChange={(next) => {
                              const value = Number(next) as 1 | 2 | 3 | 4 | 5;
                              const cur = settingsDraft?.uptime_rating_level ?? 3;
                              if (value === cur) return;
                              setSettingsDraft((prev) =>
                                prev ? { ...prev, uptime_rating_level: value } : prev,
                              );
                              patchSettingsMut.mutate({ uptime_rating_level: value });
                            }}
                            disabled={settingsQuery.isLoading || !settingsDraft}
                            className="ui-select !h-9 w-full !text-[14px] disabled:opacity-50"
                          >
                            <option value={1}>{t('admin_settings.uptime_rating.level_1')}</option>
                            <option value={2}>{t('admin_settings.uptime_rating.level_2')}</option>
                            <option value={3}>{t('admin_settings.uptime_rating.level_3')}</option>
                            <option value={4}>{t('admin_settings.uptime_rating.level_4')}</option>
                            <option value={5}>{t('admin_settings.uptime_rating.level_5')}</option>
                          </Select>
                        </div>
                      </SettingsGroup>
                    </div>
                  )}

                  {settingsSection === 'monitoring' && (
                    <div className="space-y-[60px]">
                      <SettingsGroup
                        title={t('admin_settings.monitoring.title')}
                        description={t('admin_settings.monitoring.help')}
                      >
                        <SettingsRow
                          label={t('admin_settings.retention.days')}
                          help={t('admin_settings.retention.help')}
                          control={
                            <input
                              type="number"
                              min={1}
                              max={365}
                              aria-label={t('admin_settings.retention.days')}
                              value={settingsDraft?.retention_check_results_days ?? 7}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                const next = Number.isFinite(raw) ? Math.trunc(raw) : 1;
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, retention_check_results_days: next } : prev,
                                );
                              }}
                              onFocus={() => setFocusedSetting('retention_check_results_days')}
                              onBlur={(e) => {
                                setFocusedSetting(null);
                                const next = clampInt(Number(e.currentTarget.value), 1, 365);
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, retention_check_results_days: next } : prev,
                                );
                                patchSettingsMut.mutate({ retention_check_results_days: next });
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                (e.currentTarget as HTMLInputElement).blur();
                              }}
                              disabled={settingsQuery.isLoading || !settingsDraft}
                              className={cn(
                                INPUT_CLASS,
                                'ui-compact !h-9 tabular-nums disabled:opacity-50',
                              )}
                            />
                          }
                        />
                        <SettingsRow
                          label={t('admin_settings.state_machine.failures_to_down')}
                          control={
                            <input
                              type="number"
                              min={1}
                              max={10}
                              aria-label={t('admin_settings.state_machine.failures_to_down')}
                              value={settingsDraft?.state_failures_to_down_from_up ?? 2}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                const next = Number.isFinite(raw) ? Math.trunc(raw) : 1;
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, state_failures_to_down_from_up: next } : prev,
                                );
                              }}
                              onFocus={() => setFocusedSetting('state_failures_to_down_from_up')}
                              onBlur={(e) => {
                                setFocusedSetting(null);
                                const next = clampInt(Number(e.currentTarget.value), 1, 10);
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, state_failures_to_down_from_up: next } : prev,
                                );
                                patchSettingsMut.mutate({ state_failures_to_down_from_up: next });
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                (e.currentTarget as HTMLInputElement).blur();
                              }}
                              disabled={settingsQuery.isLoading || !settingsDraft}
                              className={cn(
                                INPUT_CLASS,
                                'ui-compact !h-9 tabular-nums disabled:opacity-50',
                              )}
                            />
                          }
                        />
                        <SettingsRow
                          label={t('admin_settings.state_machine.successes_to_up')}
                          control={
                            <input
                              type="number"
                              min={1}
                              max={10}
                              aria-label={t('admin_settings.state_machine.successes_to_up')}
                              value={settingsDraft?.state_successes_to_up_from_down ?? 2}
                              onChange={(e) => {
                                const raw = Number(e.target.value);
                                const next = Number.isFinite(raw) ? Math.trunc(raw) : 1;
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, state_successes_to_up_from_down: next } : prev,
                                );
                              }}
                              onFocus={() => setFocusedSetting('state_successes_to_up_from_down')}
                              onBlur={(e) => {
                                setFocusedSetting(null);
                                const next = clampInt(Number(e.currentTarget.value), 1, 10);
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, state_successes_to_up_from_down: next } : prev,
                                );
                                patchSettingsMut.mutate({ state_successes_to_up_from_down: next });
                              }}
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                (e.currentTarget as HTMLInputElement).blur();
                              }}
                              disabled={settingsQuery.isLoading || !settingsDraft}
                              className={cn(
                                INPUT_CLASS,
                                'ui-compact !h-9 tabular-nums disabled:opacity-50',
                              )}
                            />
                          }
                        />
                      </SettingsGroup>
                      <SettingsGroup
                        title={t('admin_settings.defaults.title')}
                        description={t('admin_settings.defaults.help')}
                      >
                        <SettingsRow
                          label={t('admin_settings.defaults.overview_range')}
                          controlWidth="w-32"
                          control={
                            <Select
                              aria-label={t('admin_settings.defaults.overview_range')}
                              value={settingsDraft?.admin_default_overview_range ?? '24h'}
                              onChange={(next) => {
                                const value = next as '24h' | '7d';
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, admin_default_overview_range: value } : prev,
                                );
                                patchSettingsMut.mutate({ admin_default_overview_range: value });
                              }}
                              disabled={settingsQuery.isLoading || !settingsDraft}
                              className="ui-select ui-compact !h-9 !w-full disabled:opacity-50"
                            >
                              <option value="24h">24h</option>
                              <option value="7d">7d</option>
                            </Select>
                          }
                        />
                        <SettingsRow
                          label={t('admin_settings.defaults.monitor_range')}
                          controlWidth="w-32"
                          control={
                            <Select
                              aria-label={t('admin_settings.defaults.monitor_range')}
                              value={settingsDraft?.admin_default_monitor_range ?? '24h'}
                              onChange={(next) => {
                                const value = next as AdminSettings['admin_default_monitor_range'];
                                setSettingsDraft((prev) =>
                                  prev ? { ...prev, admin_default_monitor_range: value } : prev,
                                );
                                patchSettingsMut.mutate({ admin_default_monitor_range: value });
                              }}
                              disabled={settingsQuery.isLoading || !settingsDraft}
                              className="ui-select ui-compact !h-9 !w-full disabled:opacity-50"
                            >
                              <option value="24h">24h</option>
                              <option value="7d">7d</option>
                              <option value="30d">30d</option>
                              <option value="90d">90d</option>
                            </Select>
                          }
                        />
                      </SettingsGroup>
                    </div>
                  )}
                </div>
              </div>

              {/* Reference settings keep one primary save action at the page bottom. */}
              <div className="flex items-center gap-3">
                <Button
                  size="lg"
                  disabled={
                    patchSettingsMut.isPending || Object.keys(unsavedSettingsPatch).length === 0
                  }
                  onClick={() => patchSettingsMut.mutate(unsavedSettingsPatch)}
                >
                  {patchSettingsMut.isPending
                    ? t('admin_dashboard.settings_saving')
                    : t('admin_dashboard.settings_save_changes')}
                </Button>
                <span className="text-[12px] text-ink-3">
                  {t('admin_dashboard.settings_autosave_hint')}
                </span>
              </div>
            </div>
          )}

          {tab === 'incidents' && (
            <div className="ui-incidents-page space-y-10">
              <AdminPageHeader
                title={t('admin_dashboard.tab.incidents')}
                className="ui-monitor-page-header"
                actions={
                  <>
                    <div ref={incidentFiltersRef} className="relative">
                      <button
                        type="button"
                        onClick={() => setShowIncidentFilters((previous) => !previous)}
                        aria-label={t('admin_dashboard.incident_filters')}
                        aria-expanded={showIncidentFilters}
                        className="ui-btn-secondary ui-icon-btn ui-monitor-filter-button relative"
                      >
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                          aria-hidden
                        >
                          <path
                            strokeLinecap="round"
                            d="M1.664 3h12.667M3.664 8h8.667M5.664 13h4.667"
                          />
                        </svg>
                        {incidentStatusFilter ? (
                          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-accent" />
                        ) : null}
                      </button>
                      {showIncidentFilters ? (
                        <div
                          role="group"
                          aria-label={t('admin_dashboard.incident_filters')}
                          className="ui-panel absolute right-0 top-11 z-30 w-64 p-3 shadow-lg"
                        >
                          <label className="block text-[13px] text-ink-2">
                            {t('common.state')}
                            <Select
                              value={incidentStatusFilter}
                              onChange={setIncidentStatusFilter}
                              aria-label={t('common.state')}
                              className="mt-2"
                            >
                              <option value="">{t('admin_dashboard.incident_all_statuses')}</option>
                              {(
                                ['investigating', 'identified', 'monitoring', 'resolved'] as const
                              ).map((status) => (
                                <option key={status} value={status}>
                                  {incidentStatusLabel(status, t)}
                                </option>
                              ))}
                            </Select>
                          </label>
                        </div>
                      ) : null}
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void (async () => {
                          try {
                            await exportIncidentsCsv('90d');
                            setExportNotice({
                              tone: 'success',
                              title: t('admin_dashboard.export_downloaded'),
                            });
                          } catch (error) {
                            setExportNotice({
                              tone: 'danger',
                              title:
                                error instanceof Error
                                  ? error.message
                                  : t('admin_dashboard.export_failed'),
                            });
                          }
                        })();
                      }}
                    >
                      {t('admin_dashboard.export_incidents')}
                    </Button>
                    <Button
                      onClick={() => {
                        createIncidentMut.reset();
                        setModal({ type: 'create-incident' });
                      }}
                    >
                      {t('admin_dashboard.report_incident')}
                    </Button>
                  </>
                }
                search={
                  <AdminSearchField
                    value={incidentSearch}
                    onChange={setIncidentSearch}
                    label={t('admin_dashboard.search_incidents')}
                  />
                }
              />

              {incidentListQuery.isLoading ? (
                <SkeletonRows
                  className="ui-panel overflow-hidden"
                  rows={4}
                  rowClassName="ui-incident-row ui-incident-grid"
                  cells={[
                    'w-56',
                    'hidden w-32 lg:block',
                    'hidden w-20 lg:block',
                    'w-16',
                    'ml-auto h-5 w-5',
                  ]}
                />
              ) : incidentListQuery.isError ? (
                <div
                  role="alert"
                  className="ui-panel flex flex-wrap items-center justify-between gap-3 p-4 text-status-down"
                >
                  <span>{formatError(incidentListQuery.error)}</span>
                  <Button variant="secondary" onClick={() => void incidentListQuery.refetch()}>
                    {t('common.retry')}
                  </Button>
                </div>
              ) : incidentList.length === 0 && !incidentSearchTerm && !incidentStatusFilter ? (
                <div className="ui-panel">
                  <EmptyState
                    icon="alert"
                    title={t('admin_dashboard.no_incidents_yet')}
                    description={t('admin_dashboard.no_incidents_help')}
                  />
                </div>
              ) : incidentList.length === 0 ? (
                <div className="ui-panel">
                  <EmptyState
                    icon="alert"
                    title={t('admin_dashboard.incident_no_match')}
                    description={t('admin_dashboard.incident_no_match_help')}
                  />
                </div>
              ) : (
                <div className="ui-incident-list">
                  <div className="ui-incident-table-head ui-incident-grid">
                    <span className="flex items-center gap-1">
                      {t('admin_dashboard.incident_col_incident')}
                      <IncidentSortButton
                        label={t('admin_dashboard.incident_col_incident')}
                        active={incidentSort === 'title'}
                        dir={incidentSortDir}
                        onClick={() => {
                          setIncidentSort('title');
                          setIncidentSortDir((previous) =>
                            incidentSort === 'title' && previous === 'asc' ? 'desc' : 'asc',
                          );
                        }}
                      />
                    </span>
                    <span className="ui-incident-monitors">{t('common.monitors')}</span>
                    <span>{t('common.state')}</span>
                    <span className="flex items-center justify-end gap-1 pr-0.5">
                      {t('admin_dashboard.incident_col_length')}
                      <IncidentSortButton
                        label={t('admin_dashboard.incident_col_length')}
                        active={incidentSort === 'length'}
                        dir={incidentSortDir}
                        onClick={() => {
                          setIncidentSort('length');
                          setIncidentSortDir((previous) =>
                            incidentSort === 'length' && previous === 'desc' ? 'asc' : 'desc',
                          );
                        }}
                      />
                    </span>
                    <span aria-hidden />
                  </div>
                  <div className="divide-y divide-line">
                    {incidentList.map((incident) => {
                      const monitorNames = incident.monitor_ids
                        .map((id) => formatMonitorDisplayNameById(id, monitorNameById))
                        .join(', ');
                      const ongoing = incident.status !== 'resolved';
                      return (
                        <div
                          key={incident.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => navigate(adminIncidentDetailPath(incident.id))}
                          onKeyDown={(event) => {
                            if (
                              event.target === event.currentTarget &&
                              (event.key === 'Enter' || event.key === ' ')
                            ) {
                              event.preventDefault();
                              navigate(adminIncidentDetailPath(incident.id));
                            }
                          }}
                          className="ui-incident-row ui-incident-grid cursor-pointer"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <span
                              className={cn(
                                'ui-incident-row-status',
                                !ongoing && 'ui-incident-row-status-resolved',
                              )}
                              aria-hidden
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
                                {incident.title}
                              </div>
                              <div
                                className="ui-incident-row-state truncate text-ink-2"
                                title={incident.message ?? undefined}
                              >
                                {incident.message || incidentImpactLabel(incident.impact, t)}
                              </div>
                              <div className="ui-incident-row-meta">
                                {incident.resolved_at === null
                                  ? t('admin_dashboard.incident_started_relative', {
                                      value: formatRelativeTime(incident.started_at, locale),
                                    })
                                  : t('admin_dashboard.incident_resolved_relative', {
                                      value: formatRelativeTime(incident.resolved_at, locale),
                                    })}
                              </div>
                            </div>
                          </div>

                          <div className="ui-incident-monitors truncate" title={monitorNames}>
                            {monitorNames || '-'}
                          </div>

                          <div className="min-w-0">
                            <span className={ongoing ? 'text-status-down' : 'text-status-up'}>
                              {incidentStatusLabel(incident.status, t)}
                            </span>
                            <div className="ui-incident-meta">
                              {incidentImpactLabel(incident.impact, t)}
                            </div>
                          </div>

                          <div className="ui-incident-length">
                            {incident.resolved_at === null
                              ? t('admin_dashboard.incident_ongoing')
                              : formatDuration(incident.resolved_at - incident.started_at)}
                          </div>

                          <div
                            className="flex justify-end"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <RowMenu label={t('admin_dashboard.incident_actions')}>
                              {(close) => (
                                <>
                                  <MenuItem
                                    icon="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10"
                                    disabled={
                                      incident.status === 'resolved' || deleteIncidentMut.isPending
                                    }
                                    onClick={() => {
                                      close();
                                      addIncidentUpdateMut.reset();
                                      setModal({ type: 'add-incident-update', incident });
                                    }}
                                  >
                                    {t('common.update')}
                                  </MenuItem>
                                  <MenuItem
                                    icon="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                                    disabled={
                                      incident.status === 'resolved' || deleteIncidentMut.isPending
                                    }
                                    onClick={() => {
                                      close();
                                      resolveIncidentMut.reset();
                                      setModal({ type: 'resolve-incident', incident });
                                    }}
                                  >
                                    {t('resolve_incident.resolve')}
                                  </MenuItem>
                                  <MenuItem
                                    icon="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
                                    tone="danger"
                                    disabled={deleteIncidentMut.isPending}
                                    onClick={() => {
                                      close();
                                      if (confirm(`${t('common.delete')} "${incident.title}"?`)) {
                                        deleteIncidentMut.mutate(incident.id);
                                      }
                                    }}
                                  >
                                    {t('common.delete')}
                                  </MenuItem>
                                </>
                              )}
                            </RowMenu>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {incidentList.length > 0 &&
              (incidentListQuery.hasNextPage || incidentListQuery.isFetchNextPageError) ? (
                <div className="flex justify-center">
                  <Button
                    variant="secondary"
                    disabled={incidentListQuery.isFetchingNextPage}
                    aria-busy={incidentListQuery.isFetchingNextPage}
                    onClick={() => void incidentListQuery.fetchNextPage()}
                  >
                    {incidentListQuery.isFetchingNextPage
                      ? t('common.loading_ellipsis')
                      : incidentListQuery.isFetchNextPageError
                        ? t('common.retry')
                        : t('common.load_more')}
                  </Button>
                </div>
              ) : null}
            </div>
          )}

          {tab === 'maintenance' && (
            <div className="ui-monitor-page space-y-10">
              <AdminPageHeader
                title={t('admin_dashboard.maintenance_windows_title')}
                className="ui-monitor-page-header"
                search={
                  <AdminSearchField
                    value={maintenanceSearch}
                    onChange={setMaintenanceSearch}
                    label={t('admin_dashboard.search_maintenance')}
                  />
                }
                actions={
                  <Button onClick={() => setModal({ type: 'create-maintenance' })}>
                    {t('admin_dashboard.create_maintenance')}
                  </Button>
                }
              />
              {maintenanceQuery.isLoading ? (
                <SkeletonRows
                  className="ui-panel overflow-hidden"
                  rows={3}
                  rowClassName="ui-resource-row ui-resource-grid"
                  cells={[
                    'w-40',
                    'hidden w-36 lg:block',
                    'hidden w-24 sm:block',
                    'ml-auto h-5 w-5',
                  ]}
                />
              ) : maintenanceQuery.isError ? (
                <div
                  role="alert"
                  className="ui-panel flex flex-wrap items-center justify-between gap-3 p-4 text-status-down"
                >
                  <span>
                    {formatError(maintenanceQuery.error) ??
                      t('admin_dashboard.maintenance_load_failed')}
                  </span>
                  <Button variant="secondary" onClick={() => void maintenanceQuery.refetch()}>
                    {t('common.retry')}
                  </Button>
                </div>
              ) : (
                <MaintenanceList
                  windows={maintenanceQuery.data?.maintenance_windows ?? []}
                  monitorNames={monitorNameById}
                  search={maintenanceSearch}
                  timeZone={settings?.site_timezone ?? 'UTC'}
                  onEdit={(window) => setModal({ type: 'edit-maintenance', window })}
                  onDelete={(window) => {
                    if (confirm(`${t('common.delete')} "${window.title}"?`))
                      deleteMaintenanceMut.mutate(window.id);
                  }}
                  deletePending={deleteMaintenanceMut.isPending}
                />
              )}
            </div>
          )}
        </div>
      </main>

      <ToastStack>
        {[deleteChannelMut, deleteGroupMut, deleteMaintenanceMut, deleteIncidentMut].map(
          (mutation, index) =>
            mutation.isError && (
              <Toast
                key={index}
                tone="danger"
                title={t('admin_dashboard.delete_failed')}
                onClose={() => mutation.reset()}
                closeLabel={t('common.close')}
              >
                {formatError(mutation.error)}
              </Toast>
            ),
        )}
        {monitorActionNotice ? (
          <Toast
            tone={monitorActionNotice.tone}
            title={monitorActionNotice.title}
            onClose={() => setMonitorActionNotice(null)}
            closeLabel={t('common.close')}
          />
        ) : null}
        {exportNotice ? (
          <Toast
            tone={exportNotice.tone}
            title={exportNotice.title}
            onClose={() => setExportNotice(null)}
            closeLabel={t('common.close')}
          />
        ) : null}
        {deliveryNotice ? (
          <Toast
            tone="danger"
            title={t('notification_delivery.retry_failed')}
            onClose={() => setDeliveryNotice(null)}
            closeLabel={t('common.close')}
          >
            {deliveryNotice}
          </Toast>
        ) : null}
        {monitorTestFeedback && (
          <Toast
            tone={
              monitorTestFeedback.result.status === 'down'
                ? 'danger'
                : monitorTestFeedback.result.status === 'up'
                  ? 'success'
                  : 'info'
            }
            title={
              <span className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    monitorTestFeedback.result.status === 'up'
                      ? 'up'
                      : monitorTestFeedback.result.status === 'down'
                        ? 'down'
                        : monitorTestFeedback.result.status === 'maintenance'
                          ? 'maintenance'
                          : 'unknown'
                  }
                >
                  {statusLabel(monitorTestFeedback.result.status, t)}
                </Badge>
                <span className="min-w-0 truncate">
                  {t('admin_dashboard.monitor_test_last', {
                    name: formatMonitorDisplayName(monitorTestFeedback.monitor),
                  })}
                </span>
              </span>
            }
            onClose={() => setMonitorTestFeedback(null)}
            closeLabel={t('common.close')}
          >
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] tabular-nums text-ink-2 dark:text-ink-3">
              <span>
                {t('admin_dashboard.monitor_test_attempts', {
                  value: monitorTestFeedback.result.attempts,
                })}
              </span>
              <span>
                {t('admin_dashboard.monitor_test_http', {
                  value:
                    monitorTestFeedback.result.http_status !== null
                      ? monitorTestFeedback.result.http_status
                      : '-',
                })}
              </span>
              <span>
                {t('admin_dashboard.monitor_test_latency', {
                  value:
                    monitorTestFeedback.result.latency_ms !== null
                      ? `${monitorTestFeedback.result.latency_ms}ms`
                      : '-',
                })}
              </span>
            </div>
            <div
              className={cn(
                'mt-1 text-[12px]',
                monitorTestFeedback.result.error ? 'text-red-600 dark:text-red-400' : 'text-ink-2',
              )}
            >
              {monitorTestFeedback.result.error ?? t('admin_dashboard.monitor_test_no_error')}
            </div>
            <div className="mt-1 text-[11px] text-ink-3 dark:text-ink-2">
              {formatDateTime(monitorTestFeedback.at, settings?.site_timezone)}
            </div>
          </Toast>
        )}

        {monitorTestError && (
          <Toast
            tone="danger"
            title={t('admin_dashboard.monitor_test_failed', {
              name: formatMonitorDisplayNameById(monitorTestError.monitorId, monitorNameById),
            })}
            onClose={() => setMonitorTestError(null)}
            closeLabel={t('common.close')}
          >
            <div className="mt-1 text-[12px] text-red-600 dark:text-red-400">
              {monitorTestError.message}
            </div>
            <div className="mt-1 text-[11px] text-ink-3 dark:text-ink-2">
              {formatDateTime(monitorTestError.at, settings?.site_timezone)}
            </div>
          </Toast>
        )}

        {channelTestFeedback && (
          <Toast
            tone={
              channelTestFeedback.delivery?.status === 'failed'
                ? 'danger'
                : channelTestFeedback.delivery?.status === 'success'
                  ? 'success'
                  : 'info'
            }
            title={
              <span className="flex flex-wrap items-center gap-2">
                <Badge
                  variant={
                    channelTestFeedback.delivery?.status === 'success'
                      ? 'up'
                      : channelTestFeedback.delivery?.status === 'failed'
                        ? 'down'
                        : 'unknown'
                  }
                >
                  {channelTestFeedback.delivery?.status === 'success'
                    ? t('admin_dashboard.webhook_test_status_success')
                    : channelTestFeedback.delivery?.status === 'failed'
                      ? t('admin_dashboard.webhook_test_status_failed')
                      : t('admin_dashboard.webhook_test_unknown')}
                </Badge>
                <span className="min-w-0 truncate">
                  {t('admin_dashboard.webhook_test_last', {
                    name:
                      channelNameById.get(channelTestFeedback.channelId) ??
                      `#${channelTestFeedback.channelId}`,
                  })}
                </span>
              </span>
            }
            onClose={() => setChannelTestFeedback(null)}
            closeLabel={t('common.close')}
          >
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-ink-2 dark:text-ink-3">
              <span>
                {t('admin_dashboard.webhook_test_http', {
                  value: channelTestFeedback.delivery?.http_status ?? '-',
                })}
              </span>
              <span className="max-w-full truncate" title={channelTestFeedback.eventKey}>
                {t('admin_dashboard.webhook_test_event_key', {
                  value: channelTestFeedback.eventKey,
                })}
              </span>
            </div>
            <div
              className={cn(
                'mt-1 text-[12px]',
                channelTestFeedback.delivery?.status === 'failed'
                  ? 'text-red-600 dark:text-red-400'
                  : 'text-ink-2',
              )}
            >
              {channelTestFeedback.delivery?.error
                ? channelTestFeedback.delivery.error
                : channelTestFeedback.delivery
                  ? t('admin_dashboard.webhook_delivery_success')
                  : t('admin_dashboard.webhook_delivery_missing')}
            </div>
            <div className="mt-1 text-[11px] text-ink-3 dark:text-ink-2">
              {formatDateTime(channelTestFeedback.at, settings?.site_timezone)}
            </div>
          </Toast>
        )}

        {channelTestError && (
          <Toast
            tone="danger"
            title={t('admin_dashboard.webhook_test_failed', {
              name:
                channelNameById.get(channelTestError.channelId) ?? `#${channelTestError.channelId}`,
            })}
            onClose={() => setChannelTestError(null)}
            closeLabel={t('common.close')}
          >
            <div className="mt-1 text-[12px] text-red-600 dark:text-red-400">
              {channelTestError.message}
            </div>
            <div className="mt-1 text-[11px] text-ink-3 dark:text-ink-2">
              {formatDateTime(channelTestError.at, settings?.site_timezone)}
            </div>
          </Toast>
        )}

        {bulkNotice && (
          <Toast
            tone={bulkNotice.kind === 'error' ? 'danger' : 'success'}
            title={bulkNotice.message}
            onClose={() => setBulkNotice(null)}
            closeLabel={t('common.close')}
          />
        )}
      </ToastStack>

      {modal.type !== 'none' && (
        <div className={ownsPageShell(modal.type) ? 'ui-monitor-form-page' : MODAL_OVERLAY_CLASS}>
          <div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-modal-title"
            tabIndex={-1}
            className={cn(
              ownsPageShell(modal.type)
                ? 'mx-auto h-full min-h-0 w-full focus:outline-none'
                : cn(
                    MODAL_PANEL_CLASS,
                    'p-5 focus:outline-none sm:p-6',
                    modal.type === 'bulk-configure'
                      ? 'sm:max-w-[581px]'
                      : modal.type === 'create-group' || modal.type === 'edit-group'
                        ? 'sm:max-w-2xl'
                        : modal.type === 'create-channel' || modal.type === 'edit-channel'
                          ? 'sm:max-w-lg'
                          : 'sm:max-w-md',
                  ),
            )}
          >
            {!ownsPageShell(modal.type) && (
              <h2 id="admin-modal-title" className="ui-dialog-title">
                {modal.type === 'create-monitor' && t('admin_dashboard.create_monitor')}
                {modal.type === 'edit-monitor' && t('admin_dashboard.edit_monitor')}
                {modal.type === 'create-channel' && t('admin_dashboard.create_channel')}
                {modal.type === 'edit-channel' && t('admin_dashboard.edit_channel')}
                {modal.type === 'create-group' && t('admin_dashboard.create_group')}
                {modal.type === 'edit-group' && t('admin_dashboard.edit_group')}
                {modal.type === 'create-incident' && t('admin_dashboard.create_incident')}
                {modal.type === 'add-incident-update' && t('admin_dashboard.post_update')}
                {modal.type === 'resolve-incident' && t('admin_dashboard.resolve_incident')}
                {modal.type === 'create-maintenance' && t('admin_dashboard.create_maintenance')}
                {modal.type === 'edit-maintenance' && t('admin_dashboard.edit_maintenance')}
                {modal.type === 'bulk-move' && t('admin_dashboard.bulk_move')}
                {modal.type === 'bulk-edit' && t('admin_dashboard.bulk_edit')}
                {modal.type === 'rename-group' && t('common.rename')}
                {modal.type === 'remove-group' && t('common.remove')}
              </h2>
            )}

            {modal.type === 'bulk-move' && (
              <div className="space-y-3">
                {hiddenSelectedCount > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-300">
                    {t('admin_dashboard.bulk_assign_hidden', { count: hiddenSelectedCount })}
                  </p>
                )}
                {bulkMovePanel}
                {monitorGroupManageError && (
                  <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                    {monitorGroupManageError}
                  </p>
                )}
              </div>
            )}

            {modal.type === 'bulk-edit' && <div className="space-y-3">{bulkEditPanel}</div>}

            {modal.type === 'rename-group' && (
              <div className="space-y-4">
                <label className="ui-label" htmlFor="rename-group-input">
                  {t('admin_dashboard.group_name')}
                </label>
                <input
                  id="rename-group-input"
                  className="ui-input w-full"
                  value={groupNameDraft}
                  maxLength={64}
                  onChange={(event) => setGroupNameDraft(event.target.value)}
                />
                {monitorGroupManageError ? (
                  <p role="alert" className="text-[13px] text-status-down">
                    {monitorGroupManageError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" type="button" onClick={closeModal}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    type="button"
                    disabled={groupNameDraft.trim().length === 0 || renameGroupMut.isPending}
                    onClick={() =>
                      renameGroupMut.mutate({ from: modal.label, to: groupNameDraft.trim() })
                    }
                  >
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            )}

            {modal.type === 'remove-group' && (
              <div className="space-y-4">
                <p className="text-[13px] text-ink-2">
                  {t('admin_dashboard.group_remove_help', { name: modal.label })}
                </p>
                {monitorGroupManageError ? (
                  <p role="alert" className="text-[13px] text-status-down">
                    {monitorGroupManageError}
                  </p>
                ) : null}
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" type="button" onClick={closeModal}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    variant="danger"
                    type="button"
                    disabled={removeGroupMut.isPending}
                    onClick={() => removeGroupMut.mutate(modal.label)}
                  >
                    {t('common.remove')}
                  </Button>
                </div>
              </div>
            )}

            {modal.type === 'bulk-configure' && (
              <BulkConfigureDialog
                property={modal.property}
                selected={selectedMonitors}
                busy={bulkBusy}
                onCancel={closeModal}
                onSave={(patchOrFactory) => {
                  if (typeof patchOrFactory === 'function') {
                    runBulkMonitorOperation(
                      selectedMonitors.map((monitor) => monitor.id),
                      (id) => {
                        const monitor = selectedMonitors.find((item) => item.id === id);
                        return updateMonitor(id, monitor ? patchOrFactory(monitor) : {});
                      },
                    ).then(() => closeModal());
                    return;
                  }
                  if (Object.keys(patchOrFactory).length === 0) {
                    closeModal();
                    return;
                  }
                  bulkEditMut.mutate(
                    { ids: [...selectedMonitorIds], patch: patchOrFactory },
                    { onSuccess: () => closeModal() },
                  );
                }}
              />
            )}

            {(modal.type === 'create-monitor' || modal.type === 'edit-monitor') && (
              <>
                {modal.type === 'create-monitor' && (
                  <MonitorForm
                    variant="page"
                    onSubmit={(data) => createMonitorMut.mutate(data)}
                    onCancel={closeModal}
                    isLoading={createMonitorMut.isPending}
                    error={formatError(createMonitorMut.error)}
                    groupOptions={monitorGroupLabels.filter((label) => label !== UNGROUPED_LABEL)}
                    initialType={modal.initialType}
                    initialGroup={modal.initialGroup}
                    stateThresholdDefaults={stateThresholdDefaults}
                  />
                )}
                {modal.type === 'edit-monitor' && (
                  <MonitorForm
                    variant="page"
                    monitor={modal.monitor}
                    onSubmit={(data) => updateMonitorMut.mutate({ id: modal.monitor.id, data })}
                    onCancel={closeModal}
                    isLoading={updateMonitorMut.isPending}
                    error={formatError(updateMonitorMut.error)}
                    groupOptions={monitorGroupLabels.filter((label) => label !== UNGROUPED_LABEL)}
                    stateThresholdDefaults={stateThresholdDefaults}
                    onTestAlert={() => testMonitorMut.mutate(modal.monitor.id)}
                    onTogglePause={() =>
                      modal.monitor.status === 'paused'
                        ? resumeMonitorMut.mutate(modal.monitor.id)
                        : pauseMonitorMut.mutate(modal.monitor.id)
                    }
                    onDelete={() => {
                      if (window.confirm(`${t('common.delete')} "${modal.monitor.name}"?`)) {
                        deleteMonitorMut.mutate(modal.monitor.id);
                        closeModal();
                      }
                    }}
                    actionPending={
                      testMonitorMut.isPending ||
                      pauseMonitorMut.isPending ||
                      deleteMonitorMut.isPending
                    }
                  />
                )}
              </>
            )}
            {(modal.type === 'create-channel' || modal.type === 'edit-channel') && (
              <NotificationChannelForm
                channel={modal.type === 'edit-channel' ? modal.channel : undefined}
                onSubmit={(data) =>
                  modal.type === 'edit-channel'
                    ? updateChannelMut.mutate({ id: modal.channel.id, data })
                    : createChannelMut.mutate(data)
                }
                onCancel={closeModal}
                isLoading={createChannelMut.isPending || updateChannelMut.isPending}
                error={
                  modal.type === 'edit-channel'
                    ? formatError(updateChannelMut.error)
                    : formatError(createChannelMut.error)
                }
              />
            )}
            {(modal.type === 'create-group' || modal.type === 'edit-group') && (
              <NotificationGroupForm
                group={modal.type === 'edit-group' ? modal.group : undefined}
                monitors={monitors}
                channels={channelsQuery.data?.notification_channels ?? []}
                onSubmit={(data) =>
                  modal.type === 'edit-group'
                    ? updateGroupMut.mutate({ id: modal.group.id, data })
                    : createGroupMut.mutate(data)
                }
                onCancel={closeModal}
                isLoading={createGroupMut.isPending || updateGroupMut.isPending}
                error={
                  modal.type === 'edit-group'
                    ? formatError(updateGroupMut.error)
                    : formatError(createGroupMut.error)
                }
              />
            )}
            {modal.type === 'create-incident' && (
              <IncidentForm
                variant="page"
                monitors={monitors.map((m) => ({
                  id: m.id,
                  name: formatMonitorDisplayName(m),
                }))}
                onSubmit={(data) => createIncidentMut.mutate(data)}
                onCancel={closeModal}
                isLoading={createIncidentMut.isPending}
                error={formatError(createIncidentMut.error)}
              />
            )}
            {modal.type === 'add-incident-update' && (
              <IncidentUpdateForm
                variant="page"
                initialStatus={modal.incident.status}
                onSubmit={(data) => addIncidentUpdateMut.mutate({ id: modal.incident.id, data })}
                onCancel={closeModal}
                isLoading={addIncidentUpdateMut.isPending}
                error={formatError(addIncidentUpdateMut.error)}
              />
            )}
            {modal.type === 'resolve-incident' && (
              <ResolveIncidentForm
                variant="page"
                onSubmit={(data) => resolveIncidentMut.mutate({ id: modal.incident.id, data })}
                onCancel={closeModal}
                isLoading={resolveIncidentMut.isPending}
                error={formatError(resolveIncidentMut.error)}
              />
            )}
            {modal.type === 'create-maintenance' && (
              <MaintenanceWindowForm
                monitors={monitors.map((m) => ({
                  id: m.id,
                  name: formatMonitorDisplayName(m),
                }))}
                onSubmit={(data) => createMaintenanceMut.mutate(data)}
                onCancel={closeModal}
                isLoading={createMaintenanceMut.isPending}
                error={formatError(createMaintenanceMut.error)}
              />
            )}
            {modal.type === 'edit-maintenance' && (
              <MaintenanceWindowForm
                monitors={monitors.map((m) => ({
                  id: m.id,
                  name: formatMonitorDisplayName(m),
                }))}
                window={modal.window}
                onSubmit={(data) => updateMaintenanceMut.mutate({ id: modal.window.id, data })}
                onCancel={closeModal}
                isLoading={updateMaintenanceMut.isPending}
                error={formatError(updateMaintenanceMut.error)}
              />
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}

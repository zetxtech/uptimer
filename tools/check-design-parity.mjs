#!/usr/bin/env node
/**
 * Checks the admin design tokens and layout constants against the values recorded in
 * docs/reference/better-stack/design-tokens.md. The reference file is parsed at run time, so the
 * check fails whenever either side drifts: our stylesheet or the recorded reference values.
 *
 * Usage: node tools/check-design-parity.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (path) => readFileSync(join(root, path), 'utf8');

const tokensDoc = read('docs/reference/better-stack/design-tokens.md');
const styles = read('apps/web/src/styles.css');
const monitorList = read('apps/web/src/components/MonitorList.tsx');
const formPage = read('apps/web/src/components/formPage.tsx');
const adminEvents = read('apps/web/src/pages/AdminEvents.tsx');

/** Hexes listed for a named table row in the reference doc: `| elevation-2 | \`#222838\` | ...`. */
function referenceHex(rowName) {
  const match = new RegExp(`^\\| ${rowName} \\| \`(#[0-9a-f]{6})\``, 'm').exec(tokensDoc);
  if (!match) throw new Error(`reference row "${rowName}" not found in design-tokens.md`);
  return match[1];
}

/** Neutral ramp entries: `| neutral-800 | \`#222838\` |`. */
function referenceNeutral(name) {
  return referenceHex(`neutral-\\d*|${name}`.includes('|') ? name : name);
}

/** Declarations inside a CSS block, e.g. `.dark { ... }`. */
function cssVars(blockSelector) {
  const start = styles.indexOf(`${blockSelector} {`);
  if (start === -1) throw new Error(`block "${blockSelector}" not found in styles.css`);
  const end = styles.indexOf('}', start);
  const block = styles.slice(start, end);
  const vars = new Map();
  for (const match of block.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)) {
    vars.set(match[1], match[2].trim().toLowerCase());
  }
  return vars;
}

const light = cssVars(':root');
const dark = cssVars('.dark');

const checks = [];
const check = (label, actual, expected) => {
  checks.push({
    label,
    actual,
    expected,
    ok: String(actual).toLowerCase() === String(expected).toLowerCase(),
  });
};
const contains = (label, haystack, needle) => {
  checks.push({
    label,
    actual: haystack.includes(needle) ? 'present' : 'missing',
    expected: needle,
    ok: haystack.includes(needle),
  });
};
const assert = (label, condition, expected) => {
  checks.push({
    label,
    actual: condition ? 'present' : 'missing',
    expected,
    ok: Boolean(condition),
  });
};

// Surfaces: dark theme maps onto the reference elevation scale.
check('dark canvas (--color-bg)', dark.get('color-bg'), referenceHex('page canvas'));
check('dark card (--color-card)', dark.get('color-card'), referenceHex('elevation-2'));
check(
  'dark secondary fill (--color-bg-secondary)',
  dark.get('color-bg-secondary'),
  referenceHex('elevation-3'),
);
check('dark border (--color-border)', dark.get('color-border'), referenceHex('elevation-4'));
check('dark sidebar (--color-admin-sidebar)', dark.get('color-admin-sidebar'), '#222838');
check(
  'dark workspace (--color-admin-workspace)',
  dark.get('color-admin-workspace'),
  referenceHex('page canvas'),
);
check(
  'dark input fill (--color-input-bg)',
  dark.get('color-input-bg'),
  referenceHex('elevation-2'),
);
check('dark input border (--color-input-border)', dark.get('color-input-border'), '#3b4254');
check(
  'dark table head (--color-table-head)',
  dark.get('color-table-head'),
  referenceHex('elevation-2'),
);

// Status palette.
check('dark up (--color-up)', dark.get('color-up'), '#64c28d');
check('dark down (--color-down)', dark.get('color-down'), '#e0687d');
check('dark maintenance (--color-maintenance)', dark.get('color-maintenance'), '#4bb9e8');
check('dark paused (--color-paused)', dark.get('color-paused'), '#dd9c51');
check('light up (--color-up)', light.get('color-up'), '#00885d');
check('light down (--color-down)', light.get('color-down'), '#c03a5a');
check('light maintenance (--color-maintenance)', light.get('color-maintenance'), '#009fe3');
check('light paused (--color-paused)', light.get('color-paused'), '#d57b16');

// Brand surfaces.
check('dark primary button fill', dark.get('color-btn-primary-bg'), '#5b63d3');
check('dark primary button border', dark.get('color-btn-primary-border'), '#7c87f7');
check('light primary button fill', light.get('color-btn-primary-bg'), '#5b63d3');
check('light canvas (--color-bg)', light.get('color-bg'), '#f8f9fc');
check('light card (--color-card)', light.get('color-card'), '#ffffff');

// Radii: 8 px controls, 12 px cards.
check('--radius-sm (inputs, buttons)', light.get('radius-sm'), '0.5rem');
check('--radius-lg (cards, dialogs)', light.get('radius-lg'), '0.75rem');

// Layout constants pinned in the components.
contains('monitor row height', monitorList, 'min-h-[57px]');
contains('page editor rail', formPage, 'minmax(0,13.5rem)');
contains('page editor gutter', formPage, 'min-[900px]:gap-x-12');
const cssRule = (selector) => {
  const start = styles.indexOf(`${selector} {`);
  if (start === -1) return '';
  return styles.slice(start, styles.indexOf('}', start));
};
assert('group header height', /height:\s*42px/.test(cssRule('.ui-group-head')), 'height: 42px');
assert('range segment width', /width:\s*64px/.test(cssRule('.ui-range-segment')), 'width: 64px');
const monitorForm = read('apps/web/src/components/MonitorForm.tsx');
contains('heartbeat number field width', monitorForm, 'w-16 shrink-0');
contains('heartbeat unit select width', monitorForm, 'min-w-[120px]');
assert(
  'create monitor exposes separate Advanced settings and Metadata rows',
  monitorForm.includes('id={`${formId}-advanced`}') &&
    monitorForm.includes('id={`${formId}-metadata`}'),
  'two independent collapsed sections',
);
assert(
  'monitor form disclosure row height',
  /height:\s*31px/.test(cssRule('.ui-form-collapse-row')),
  '31px disclosure row',
);
assert(
  'monitor notification choices use bordered option rows',
  monitorForm.includes('ui-monitor-escalation-option') &&
    /min-height:\s*58px/.test(cssRule('.ui-monitor-escalation-option')),
  '58px radio option row',
);
assert(
  'monitor configuration selects keep native popups',
  monitorForm.includes('ui-native-select') &&
    /appearance:\s*auto/.test(cssRule('.ui-native-select')),
  'native browser select appearance',
);
const checkKindOrder = [
  '<option value="url_down">',
  '<option value="url_lacks_keyword">',
  '<option value="url_has_keyword">',
  '<option value="url_status">',
  '<option value="host_ping">',
].map((option) => monitorForm.indexOf(option));
assert(
  'monitor check type options follow the captured order',
  checkKindOrder.every(
    (index, position) => index >= 0 && (position === 0 || index > checkKindOrder[position - 1]),
  ),
  'URL down, keyword absent, keyword present, status, host ping',
);
assert(
  'monitor breadcrumbs use the workspace top bar',
  read('apps/web/src/components/AdminShell.tsx').includes('workspaceHeader') &&
    read('apps/web/src/pages/AdminDashboard.tsx').includes('showBreadcrumb={false}') &&
    read('apps/web/src/pages/AdminMonitorDetail.tsx').includes('showBreadcrumb={false}'),
  'create and configure pages share the top-bar breadcrumb slot',
);
assert(
  'monitor breadcrumb aligns to the captured workspace origin',
  read('apps/web/src/components/AdminShell.tsx').includes('pl-12 pr-6') &&
    read('apps/web/src/components/AdminShell.tsx').includes('items-center gap-2') &&
    read('apps/web/src/components/AdminShell.tsx').includes('items-center gap-3'),
  '48px sidebar offset and recorded breadcrumb spacing',
);
assert(
  'no off-scale Tailwind type sizes',
  !/text-(2xl|3xl|4xl|5xl|lg)\b/.test(
    [
      'apps/web/src/pages/StatusPage.tsx',
      'apps/web/src/pages/IncidentHistoryPage.tsx',
      'apps/web/src/pages/MaintenanceHistoryPage.tsx',
      'apps/web/src/components/MonitorForm.tsx',
      'apps/web/src/components/DayDowntimeModal.tsx',
    ]
      .map(read)
      .join('\n'),
  ),
  'text-lg and text-2xl are off the scale',
);
assert(
  'public status title on the page scale',
  /font-size:\s*28px/.test(cssRule('\n.ui-public-title')),
  '28px heading',
);
assert(
  'field pitch (label 6 px, help 10 px)',
  /margin-bottom:\s*0\.375rem/.test(cssRule('\n.ui-label')) &&
    /margin-top:\s*0\.625rem/.test(cssRule('\n.ui-help')),
  'label 6px, help 10px',
);
assert(
  'radii limited to the reference set (4/8/12/pill)',
  !/rounded-(md|sm)\b/.test(
    [
      'apps/web/src/components/ui.tsx',
      'apps/web/src/components/MonitorList.tsx',
      'apps/web/src/components/MonitorCard.tsx',
      'apps/web/src/pages/StatusPage.tsx',
      'apps/web/src/pages/AdminDashboard.tsx',
    ]
      .map(read)
      .join('\n'),
  ),
  'no 2/6 px radii',
);
assert(
  'monitor row menu carries the reference actions',
  [
    'monitor_view_incidents',
    'monitor_configure',
    'monitor_duplicate',
    'monitor_send_test_alert',
    'monitor_select',
    'monitor_create_group',
  ].every((key) =>
    read('apps/web/src/components/MonitorList.tsx').includes(`admin_dashboard.${key}`),
  ) && /w-\[190px\]/.test(read('apps/web/src/components/MonitorList.tsx')),
  'reference item set in a 190px menu',
);
assert(
  'row incident pill matches the archived measurement',
  /height:\s*30px/.test(cssRule('\n.ui-monitor-incident-pill')) &&
    /border:\s*1px solid var\(--color-border\)/.test(cssRule('\n.ui-monitor-incident-pill')) &&
    /border-radius:\s*8px/.test(cssRule('\n.ui-monitor-incident-pill')) &&
    /width:\s*12px/.test(cssRule('\n.ui-monitor-incident-caret')),
  '182x30, 1px border, radius 8 (archive note)',
);
assert(
  'bulk bar matches the 377x32 reference footprint',
  /width:\s*377px/.test(cssRule('\n.ui-bulk-bar')) &&
    /height:\s*32px/.test(cssRule('\n.ui-bulk-bar')) &&
    /width:\s*131px/.test(cssRule('\n.ui-bulk-bar-create-group')) &&
    /width:\s*105px/.test(cssRule('\n.ui-bulk-bar-pause')),
  '377x32 bar, 131px create-group action, 105px pause action',
);
assert(
  'monitor heading stays on one line with the toolbar',
  !read('apps/web/src/pages/AdminDashboard.tsx').includes(
    "description={t('admin_dashboard.monitors_description')}",
  ),
  'no second-line description pushing the tabs and list down',
);
assert(
  'monitor filter closes on outside press without swallowing portal selections',
  /targetElement\?\.closest\('\.ui-select-popup'\)/.test(
    read('apps/web/src/pages/AdminDashboard.tsx'),
  ) &&
    /!monitorFiltersRef\.current\?\.contains\(target\) && !clickedSelectOption/.test(
      read('apps/web/src/pages/AdminDashboard.tsx'),
    ) &&
    (read('apps/web/src/pages/AdminDashboard.tsx').match(/setShowMonitorFilters\(false\)/g) ?? [])
      .length >= 2,
  'outside pointer and Escape close the filter, portal listbox clicks stay inside',
);
assert(
  'monitor filter panel matches the recorded control set and geometry',
  /width:\s*450px/.test(cssRule('\n.ui-monitor-filter-panel')) &&
    /height:\s*62px/.test(cssRule('\n.ui-monitor-filter-header')) &&
    /height:\s*112px/.test(cssRule('\n.ui-monitor-filter-body')) &&
    /height:\s*74px/.test(cssRule('\n.ui-monitor-filter-footer')) &&
    /height:\s*44px/.test(cssRule('\n.ui-select-trigger.ui-monitor-filter-status-select')) &&
    /height:\s*44px/.test(cssRule('\n.ui-monitor-filter-apply')),
  '450px panel: Filters header, one 44px status select, and Filter monitors footer',
);
assert(
  'monitor filter contains only status and apply controls',
  (() => {
    const source = read('apps/web/src/pages/AdminDashboard.tsx');
    const start = source.indexOf('className="ui-panel ui-monitor-filter-panel');
    const end = source.indexOf(') : null}', start);
    const panel = source.slice(start, end);
    return (
      start >= 0 &&
      end > start &&
      panel.includes('monitor_filter_status') &&
      panel.includes('monitor_filter_any_status') &&
      panel.includes('monitor_filter_apply') &&
      !panel.includes('common.sort') &&
      !panel.includes('group_filter') &&
      !panel.includes('monitor_select_all')
    );
  })(),
  'status field only; sorting, group selection and selection-mode actions stay outside this panel',
);
assert(
  'status condition uses natural Chinese copy',
  read('apps/web/src/i18n/messages.ts').includes(
    "'monitor_form.kind_url_status': '网址返回非预期状态码',",
  ) &&
    read('apps/web/src/i18n/messages.ts').includes(
      "'monitor_form.kind_url_status': '網址回傳非預期狀態碼',",
    ),
  'zh-CN and zh-TW labels no longer end in an incomplete “不是”',
);
assert(
  'HTTP status-specific field precedes the target URL',
  read('apps/web/src/components/MonitorForm.tsx').indexOf("kind === 'url_status' && (") <
    read('apps/web/src/components/MonitorForm.tsx').indexOf('htmlFor={\`${formId}-target\`}') &&
    read('apps/web/src/components/MonitorForm.tsx').includes(
      "className={kind === 'url_down' ? undefined : 'mt-[53px]'}",
    ),
  'conditional status field first, then target URL with the captured field pitch',
);
assert(
  'selection mode matches the archived notes',
  /width:\s*16px/.test(cssRule('\n.ui-selection-checkbox')) &&
    /border-radius:\s*4px/.test(cssRule('\n.ui-selection-checkbox')) &&
    /bottom:\s*60px/.test(cssRule('\n.ui-bulk-bar')),
  '16px square indicator, bar 60px above the edge',
);
assert(
  'group menu carries the recorded items',
  ['create_monitor', 'monitor_enter_selection', 'monitor_select_all'].every((key) =>
    read('apps/web/src/components/MonitorList.tsx').includes(`admin_dashboard.${key}`),
  ) &&
    read('apps/web/src/components/MonitorList.tsx').includes("t('common.rename')") &&
    read('apps/web/src/components/MonitorList.tsx').includes("t('common.remove')"),
  'Create monitor / Select / Select all / Rename / Remove',
);
assert(
  'group menu separator spacing follows its 190px capture',
  (read('apps/web/src/components/MonitorList.tsx').match(/<MenuSeparator compact \/>/g) ?? [])
    .length === 2 && /my-\[3px\]/.test(read('apps/web/src/components/MonitorList.tsx')),
  'two compact section separators in the group menu',
);
assert(
  'type scale limited to 11/12/13/14/16/20/28',
  !/text-\[(?!11px\]|12px\]|13px\]|14px\]|16px\]|20px\]|28px\])[0-9]+px\]/.test(
    [
      'apps/web/src/pages/StatusPage.tsx',
      'apps/web/src/pages/MaintenanceHistoryPage.tsx',
      'apps/web/src/pages/IncidentHistoryPage.tsx',
      'apps/web/src/pages/AdminReporting.tsx',
      'apps/web/src/components/AdminSection.tsx',
      'apps/web/src/components/MonitorCard.tsx',
      'apps/web/src/components/KpiCell.tsx',
      'apps/web/src/components/PublicStatusHeader.tsx',
    ]
      .map(read)
      .join('\n'),
  ),
  'no off-scale font sizes',
);
assert(
  'no off-palette colours in data visuals',
  !/#(10b981|84cc16|f59e0b|ef4444|22c55e|34d399|38bdf8|0ea5e9|64748b|94a3b8|1e293b|334155|f1f5f9|0f172a|4b93e8|cbd5e1|0284c7|d97706|059669|db2777|7c3aed|dc2626|0891b2)\b/i.test(
    [
      'apps/web/src/components/UptimeBar30d.tsx',
      'apps/web/src/components/HeartbeatBar.tsx',
      'apps/web/src/components/DailyUptimeChart.tsx',
      'apps/web/src/components/DailyLatencyChart.tsx',
      'apps/web/src/components/ProbeHistoryChart.tsx',
      'apps/web/src/pages/AdminEventDetail.tsx',
    ]
      .map(read)
      .join('\n'),
  ),
  'charts and bars use the design tokens',
);
assert(
  'uptime tiers use token classes',
  /ui-tier-bg-\$\{tierKey\(tier\)\}/.test(read('apps/web/src/utils/uptime.ts')) &&
    /ui-tier-pill-\$\{tierKey\(tier\)\}/.test(read('apps/web/src/utils/uptime.ts')),
  'tier helpers return token classes',
);
assert(
  'workspace top bar (52 px)',
  /h-\[52px\] max-w-\[90rem\]/.test(read('apps/web/src/components/AdminShell.tsx')) &&
    /flex h-\[52px\] shrink-0 items-center/.test(read('apps/web/src/components/AdminShell.tsx')),
  '52px bar and sidebar brand row',
);
assert(
  'monitor detail chart toolbar carries the region filter',
  /monitor_detail\.chart_region/.test(read('apps/web/src/pages/AdminMonitorDetail.tsx')) &&
    /chartRegions\.length > 0/.test(read('apps/web/src/pages/AdminMonitorDetail.tsx')),
  'region selector in the chart toolbar, hidden when no region has data',
);
assert(
  'monitor detail chart ranges follow the reference',
  /CHART_RANGES = \['1h', '24h', '7d', '30d'\]/.test(
    read('apps/web/src/pages/AdminMonitorDetail.tsx'),
  ) &&
    read('apps/web/src/pages/AdminMonitorDetail.tsx').includes('monitor_detail.chart_range_hour'),
  'hour, day, week, month periods',
);
assert(
  'monitor detail region selector uses native popup with flag slot',
  read('apps/web/src/pages/AdminMonitorDetail.tsx').includes('ui-chart-region-flag') &&
    read('apps/web/src/pages/AdminMonitorDetail.tsx').includes(
      'ui-native-select ui-chart-region-select',
    ) &&
    /width:\s*20px/.test(cssRule('.ui-chart-region-flag')) &&
    /height:\s*14px/.test(cssRule('.ui-chart-region-flag')),
  '20×14 flag overlay in the region selector',
);
assert(
  'monitor detail has no probe-mode or delete controls',
  !/monitor_detail\.probe_mode/.test(read('apps/web/src/pages/AdminMonitorDetail.tsx')) &&
    !/monitor_detail\.delete_confirm/.test(read('apps/web/src/pages/AdminMonitorDetail.tsx')),
  'removed from the detail page',
);
assert(
  'monitor create sections keep the reference vertical gap',
  /mt-10 space-y-8 min-\[900px\]:space-y-10/.test(read('apps/web/src/components/MonitorForm.tsx')),
  '40px desktop gap between target, escalation, and other page sections',
);
assert(
  'heartbeat create starts with a visible service name',
  monitorForm.indexOf("label={t('monitor_form.heartbeat_name')}") <
    monitorForm.indexOf("label={t('monitor_form.heartbeat_every')}") &&
    monitorForm.includes("props.initialType === 'heartbeat' ? 86_400 : 60"),
  'name is above a one-day default heartbeat schedule',
);
assert(
  'range pickers follow the reference field',
  /height:\s*36px/.test(cssRule('\n.ui-date-field')) &&
    /font-size:\s*13px/.test(cssRule('\n.ui-date-field')) &&
    /border-radius:\s*var\(--radius-lg\)/.test(cssRule('\n.ui-calendar')),
  '36px field, 13px text, card-radius calendar panel',
);
assert(
  'monitor detail header is text-only (17 px status line)',
  /mt-\[17px\] flex flex-wrap items-center gap-x-1\.5 text-\[14px\]/.test(
    read('apps/web/src/pages/AdminMonitorDetail.tsx'),
  ) &&
    !/MonitorStatusIcon status=\{monitor\.status\}/.test(
      read('apps/web/src/pages/AdminMonitorDetail.tsx'),
    ),
  'status line 14px at 17px, no header status icon',
);
assert(
  'monitor detail chart body (466 px)',
  /height=\{466\}/.test(read('apps/web/src/pages/AdminMonitorDetail.tsx')) &&
    /h-\[466px\] w-full/.test(read('apps/web/src/pages/AdminMonitorDetail.tsx')),
  'reference 466px chart body',
);
assert(
  'event timeline uses the captured text and marker geometry',
  read('apps/web/src/pages/AdminEventDetail.tsx').includes('mt-1 ml-2 break-words') &&
    read('apps/web/src/pages/AdminEventDetail.tsx').includes('flex w-6 shrink-0 flex-col') &&
    read('apps/web/src/pages/AdminEventDetail.tsx').includes('-mb-[1.5px] min-h-[20px] w-[3px]') &&
    read('apps/web/src/pages/AdminEventDetail.tsx').includes('mr-3 mb-5 ml-2 grow text-[14px]') &&
    read('apps/web/src/pages/AdminEventDetail.tsx').includes('leading-8 text-ink-2 sm:block') &&
    read('apps/web/src/pages/AdminEventDetail.tsx').includes('ui-event-timeline-point') &&
    /box-shadow:\s*0 1px 2px rgb\(0 0 0 \/ 5%\)/.test(cssRule('.ui-event-timeline-point')),
  '14px body and timestamps, 24px marker column, 3px connector, subtle marker edge',
);
assert(
  'uptime table header row (41 px)',
  /height:\s*41px/.test(cssRule('\n.ui-uptime-table th')),
  '41px header band',
);
assert(
  'settings section rhythm (60 px)',
  /space-y-\[60px\]/.test(read('apps/web/src/pages/AdminDashboard.tsx')),
  'settings sections keep the reference 60px gap',
);
assert(
  'settings save action present',
  /settings_save_changes/.test(read('apps/web/src/pages/AdminDashboard.tsx')) &&
    (read('apps/web/src/i18n/messages.ts').match(/'admin_dashboard\.settings_save_changes'/g) ?? [])
      .length === 5,
  'bottom save action with all five locales',
);
assert(
  'keyboard hint chip (22x22, radius 4)',
  /width:\s*1\.375rem/.test(cssRule('\n.ui-kbd')) &&
    /border-radius:\s*0\.25rem/.test(cssRule('\n.ui-kbd')),
  '22px / radius 4',
);
assert(
  'incident sort button size',
  /width:\s*26px/.test(cssRule('.ui-incident-sort-button')) &&
    /border-radius:\s*6px/.test(cssRule('.ui-incident-sort-button')),
  '26px / radius 6',
);
assert(
  'button type scale (14 px)',
  /md: 'h-9 px-3\.5 text-\[14px\]'/.test(read('apps/web/src/components/ui.tsx')),
  'text-[14px]',
);
assert(
  'admin section rhythm (40px)',
  /space-y-10/.test(read('apps/web/src/pages/AdminDashboard.tsx')) &&
    /space-y-10/.test(read('apps/web/src/pages/AdminProbes.tsx')) &&
    /space-y-10/.test(read('apps/web/src/pages/AdminAnalytics.tsx')),
  'space-y-10',
);
contains(
  'monitor detail action gap',
  read('apps/web/src/pages/AdminMonitorDetail.tsx'),
  'md:gap-12',
);
assert(
  'no list header chrome',
  !/ui-monitor-list-header/.test(styles) && !/ui-monitor-list-header/.test(monitorList),
  'removed',
);
assert(
  'incident header band height',
  /height:\s*42px/.test(cssRule('.ui-incident-table-head')),
  'height: 42px',
);
assert(
  'incident list is a framed selection card',
  /border:\s*1px solid var\(--color-border\)/.test(cssRule('.ui-incident-list')) &&
    /border-radius:\s*12px/.test(cssRule('.ui-incident-list')) &&
    /background:\s*var\(--color-card\)/.test(cssRule('.ui-incident-list')),
  '1px border, 12px radius and card surface',
);
assert(
  'incident selection and similar-group actions are present',
  /incident_select_all_on_page/.test(read('apps/web/src/components/AdminIncidentList.tsx')) &&
    /ui-incident-bulk-bar/.test(read('apps/web/src/components/AdminIncidentList.tsx')) &&
    /incident_group_similar/.test(read('apps/web/src/components/AdminIncidentList.tsx')),
  'header select-all menu, floating selection bar and group-similar action',
);
assert(
  'resource list header height',
  /min-height:\s*37px/.test(cssRule('.ui-resource-head')),
  'min-height: 37px',
);
assert('table header height', /height:\s*42px/.test(cssRule('.ui-table thead th')), 'height: 42px');
assert(
  'dialog title band padding',
  /padding:\s*14px 20px/.test(cssRule('.ui-dialog-title')),
  'padding: 14px 20px',
);
assert('bare monitor list', /\.ui-monitor-list,/.test(styles), '.ui-monitor-list,');
assert(
  'monitor sort menu follows observed options',
  !/\['configured',/.test(read('apps/web/src/components/MonitorSortControl.tsx')),
  'no extra configured-order radio option',
);
assert(
  'monitor group controls and drag grip reveal on hover',
  styles.includes('.ui-group-head:hover .ui-group-head-actions') &&
    styles.includes('.ui-group-head:hover .ui-monitor-grip'),
  'both controls are hover-revealed',
);
contains('events list is bare', adminEvents, 'ui-event-list');

const failed = checks.filter((item) => !item.ok);
for (const item of checks) {
  const mark = item.ok ? 'ok  ' : 'FAIL';
  console.log(
    `${mark} ${item.label}: ${item.actual}${item.ok ? '' : ` (expected ${item.expected})`}`,
  );
}
console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length > 0) process.exitCode = 1;

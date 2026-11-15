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
  /height:\s*37px/.test(cssRule('.ui-incident-table-head')),
  'height: 37px',
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

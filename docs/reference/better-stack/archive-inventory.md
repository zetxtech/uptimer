# Better Stack reference archive inventory

The existing archive at `/tmp/opencode/uptimer/bs-pages/` was collected through the signed-in desktop browser on 2026-11-09. It contains 55 HTML files, 55 corresponding JSON measurement files, six CSS files, and an `INDEX.md` with the captured destinations. The JSON records viewport, element text, geometry and computed styles for the captured state; they do not establish that every menu or dialog was opened. Some records stop at 600 nodes. The archive is local temporary data and can contain account-specific content; do not copy it wholesale into version control.

## Coverage available in the archive

| Area | Files / observed state |
| --- | --- |
| Monitors | `bs-monitors-groups`, `bs-monitors-all`, ten individual `bs-monitor-<id>` records, `bs-monitor-edit-5165793`, `bs-monitor-config-5165793`, `bs-monitor-calculate-modal` |
| Incidents | `bs-incidents`, `bs-incidents-new`, four `bs-incident-<id>` records, `bs-incidents-report-form` |
| Heartbeats | `bs-heartbeats`, `bs-heartbeats-new` |
| Reporting | `bs-reports`, five `bs-reporting-*` records |
| On-call and policies | `bs-oncalls`, `bs-policies`, `bs-policies-new`, `bs-oncalls-instructions-google` |
| Status pages | `bs-status-pages`, `bs-status-pages-new` |
| Settings | `bs-settings-account`, `api-tokens`, `billing`, `look-n-feel`, `organization`, `push-notifications`, `security`, `sso`, `teams`, `usage` |
| Integrations | `bs-integrations` and `apis`, `catalog`, `exporting-data`, `importing-data`, `meetings`, `zapier` |

Each name above corresponds to `.html` and `.json` files. `INDEX.md` gives exact destinations. The archived monitor creation, policy creation and status page creation entries resolve to billing, not the desired form; on-call is upgrade-gated; several reporting records also landed on a features page; test alerts returned a not-found page. Those entries cannot be used as evidence of the intended UI.

## Additional live capture

See `monitors-bulk-operations.md` for the selection toolbar, complete bulk-action menu, and two inspected configuration dialogs. That record was captured on 2026-11-12 and does not cover every bulk action or page.

Additional live notes: `heartbeat-create.md`, `incidents-list.md` and `reporting-overview.md`. Each distinguishes inspected states from outstanding checks.

## Remaining work

Reconnect the existing desktop browser session and continue recording each available page, dropdown, dialog, hover/focus state, navigation destination, transition properties and safely reproducible validation/error state as text. Record inaccessible or gated states explicitly. Do not claim complete coverage until each item has been inspected.

# Better Stack reference archive

Text captures of the signed-in reference workspace (`incidents.betterstack.com/team/t132878`, settings at `betterstack.com/settings`). Taken from live pages on 2026-11-12/13 and from the DOM snapshots saved while signed in (`/tmp/opencode/uptimer/bs-pages/`, 55 saved pages). No data was created, edited or deleted in the reference account.

| File | Covers |
| --- | --- |
| [design-tokens.md](design-tokens.md) | Font stack, type scale, neutral ramp, elevation surfaces, brand palette, radii, layout constants |
| [monitor-create.md](monitor-create.md) | Create monitor: frame, cards, every field and option, advanced sections, error state |
| [monitor-edit.md](monitor-edit.md) | Configure: header actions (test alert / pause / remove), per-type fields, Escalation steps, all advanced sections, environment variables, GitHub badge |
| [monitor-detail.md](monitor-detail.md) | Monitor detail: header, action strip, summary row, response-times chart, stats table, custom range row |
| [monitors-list.md](monitors-list.md) | Monitors page: toolbar, search, filter, sort, group menu, selection mode, measured row anatomy |
| [monitors-bulk-operations.md](monitors-bulk-operations.md) | Selection toolbar, bulk action menu, and each per-property bulk dialog |
| [incidents-list.md](incidents-list.md) | Incidents list, row anatomy, pagination, report form (banner, fields, attributes) |
| [incident-detail.md](incident-detail.md) | Incident header, summary card, request tabs, metadata, timeline, status-page composer |
| [heartbeat-create.md](heartbeat-create.md) | Create heartbeat: defaults, expanded sections, validation |
| [settings.md](settings.md) | Settings shell and all account/organization pages |
| [reporting-overview.md](reporting-overview.md) | Reporting rail and report list, plus its enable gate |
| [integrations-and-empty-states.md](integrations-and-empty-states.md) | Integrations cards, empty states (monitors, heartbeats, status pages, on-call, policies), 404 |

## Coverage status

Captured end to end (live, 2026-11-13): monitor list rows, selection bar, the 16-entry bulk menu and the bulk dialogs, the expanded status report composer, and the similar-incidents page. Earlier captures cover: create monitor, configure monitor (including every advanced section, per-type fields and the destructive action behaviour), monitor detail (header, actions, summary cards, chart toolbar, stats table, custom range), monitors list controls, row anatomy and selection mode, all 16 bulk dialogs, incidents list, incident detail (ongoing and resolved states, request tabs, timeline, status-page composer shell), incident report form, create heartbeat, all settings pages plus billing and SSO, reporting navigation, every integrations tab, empty states, design tokens.

Confirmed behaviours worth noting:

- Pause is a single POST with no confirmation; Remove uses the browser's native confirm ("Are you sure you want to remove <target>?") and swaps the label to "Removing…".
- "Batch edit" in the reference is not one form: the toolbar ellipsis lists 16 individual properties, each opening its own centered dialog that defaults every field to "Leave unchanged".
- Stats tables print the literal word **none** for empty cells and right-align every numeric column.

Still not capturable, with the reason:

- **Reporting widgets** — reporting is disabled ("Enable reporting").
- **On-call schedule editor, escalation policy editor, status page editor, test-alert page** — all redirect to `settings/billing/features` (plan gate) or 404 in the archived captures.
- **Heartbeat detail** — the account has no heartbeats.
- **Live site access** — the session briefly expired and now works again; the remaining gaps above are plan gates and missing data, not access.
- **Monitors list entry point** — `/monitors` shows the onboarding empty state for this team, while `/monitors?group_id=0` lists all monitors. That group view is the reference for row anatomy.

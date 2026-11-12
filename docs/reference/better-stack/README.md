# Better Stack reference archive

Text captures of the signed-in reference workspace (`incidents.betterstack.com/team/t132878`, settings at `betterstack.com/settings`), taken 2026-11-12/13. No data was created, edited or deleted in the reference account.

| File | Covers |
| --- | --- |
| [design-tokens.md](design-tokens.md) | Font stack, type scale, neutral ramp, elevation surfaces, brand palette, radii, layout constants |
| [monitor-create.md](monitor-create.md) | Create monitor: frame, cards, every field and option, advanced sections, error state |
| [monitors-list.md](monitors-list.md) | Monitors page: toolbar, search, filter, sort, group menu, selection mode |
| [monitors-bulk-operations.md](monitors-bulk-operations.md) | Selection toolbar, bulk action menu, and each per-property bulk dialog |
| [incidents-list.md](incidents-list.md) | Incidents list: header, search, columns, row anatomy, pagination, report form |
| [incident-detail.md](incident-detail.md) | Incident header, summary card, request tabs, metadata, timeline, status-page composer |
| [heartbeat-create.md](heartbeat-create.md) | Create heartbeat: defaults, expanded sections, validation |
| [settings.md](settings.md) | Settings shell and all account/organization pages |
| [reporting-overview.md](reporting-overview.md) | Reporting rail and report list, plus its enable gate |
| [integrations-and-empty-states.md](integrations-and-empty-states.md) | Integrations cards, empty states (monitors, heartbeats, status pages, on-call, policies), 404 |

## Coverage status

Captured: create-monitor (complete), monitors list controls (complete; row list was inspected on 2026-11-12 when the account still had monitors), bulk dialogs (all 16 entries inspected), incidents list and detail, create-heartbeat, settings, reporting navigation, integrations, empty states, design tokens.

Not capturable in this account state (recorded so it is not mistaken for missing work):

- **Monitor detail** — the Monitors page currently renders the empty state even though incidents reference monitors, so no monitor row exists to open. Row-level monitor metrics could not be re-measured.
- **Bulk dialogs with a live selection** — selection requires monitor rows; the dialogs themselves were already inspected on 2026-11-12 and are recorded in `monitors-bulk-operations.md`.
- **Reporting widgets** — reporting is disabled for the team ("Enable reporting").
- **On-call schedules, escalation policy editor, status page editor** — all gated behind an empty state or upgrade prompt.
- **Heartbeat detail** — no heartbeats exist in the account.

Anything above that becomes available later should be appended to the matching file rather than rewritten.

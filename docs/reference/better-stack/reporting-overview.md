# Better Stack: Reporting

Captured 2026-11-13 at `…/team/t132878/reports`. The account has reporting disabled, so the content area is an enable gate; the navigation tree is fully rendered and is the useful part.

## Layout

Page `h1` **Reporting**, 28 px / 600. A left rail (~200 px) holds the report tree; the content panel shows the selected report. In the disabled state the panel shows heading **Overview** (16/600) and the line "Get insights into your incidents." with an **Enable reporting** button.

## Report tree

- **Overview**
  - Incidents
  - Overview — metrics: Manual incidents, Started at, Resolved, MTTR, MTTA, Heatmap, Acknowledged
- **Organization**
  - Incidents
  - On-call schedules
  - Alerts — metrics: MTTR
  - Teams — metrics: Response effort
- **MTTR** / **MTTA** / **Incidents** / **Team alerts**
- **On-calls**
  - On-call details
- **Status pages**
  - Status updates
  - Subscribers
- **Monitors**
  - Compound SLA
  - MTTR per monitor
  - MTTA per monitor
  - Incident volume
  - Average SLA
- **Performance**

## Notes

- Each report leaf is a plain text row in the rail; the selected row uses white text while the rest are muted.
- Report pages are metric panels (kpi + chart), not forms. Because reporting is disabled in this account, widget styling could not be captured.

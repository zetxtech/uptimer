# Better Stack: Reporting

Captured 2026-11-13 at `/team/t132878/reporting/incidents-overview?rf=now-30d&rt=now&report_type=team_level`.

## What "Enable reporting" actually is

The report is **fully rendered**; what you see in the DOM is a transparent, full-panel link laid over it:

```html
<a class="absolute block inset-0 -right-6 z-2001 text-transparent" href="/team/t132878/reporting/team-features-redirect">Enable reporting</a>
```

- The overlay measured 672 × 2413 starting at the panel's top-left, i.e. it covers the whole report body.
- Because it is `inset-0` with `z-2001`, every click inside the panel (filters, range buttons, chart hover, table rows, CSV export, pagination) lands on the upsell link instead, which redirects to `team-features-redirect` (the plan/features page).
- Text is `text-transparent`, so the widget content stays visible and readable; only interaction is gated. Reporting itself is a paid feature for this team.
- Verified with a real (CDP) click on the **Day** granularity button: the browser navigated to `https://betterstack.com/settings/teams/132878/features`, which reads "**Please enable reporting first.** The reporting module is configured on a per-team basis. Please enable it below." and shows **Reporting → Unavailable**.
- A scripted `element.click()` on the same button still works (URL switches to `resolution=week`), which is why the widgets can be measured: the handlers are intact, only pointer input is hijacked by the overlay.
- Consequence for the port: layout, typography, data and control states are observable; real user interaction (filters, granularity, CSV export, pagination, drill-down) cannot be exercised in this account.

## Layout

- Left rail ~200 px: report tree (see below). Right panel starts at x=492 with `max-w-[calc(100vw-220px-220px-52px-20px)]`.
- Toolbar at the top right of the panel: **Last 30 days** range button, 137 × 32, radius 8, fill `rgb(41, 48, 64)`, 14 px.
- Filter bar: inline label/value pairs, 13 px, label `rgb(147, 157, 184)` 500, value white 500, 40 px row pitch:
  - Row 1: Monitors / All · Integrations / All · Escalation policy / All
  - Row 2: Acknowledged by / All · Resolved by / All
  - Row 3: Cause (`Status 500` input, 180 × 24) · Business hours from (time input)
  - Row 4: Business hours to · Weekdays / 5 days
  - Row 5: Incident metadata (`key1=value1 OR key2="value…"` input, 180 × 24)
- Granularity switch inside the chart card: **Hour / Day / Week / Month**, each 65 × 31, radius 8, active filled `rgb(41, 48, 64)`, inactive transparent, 13/500.
- Chart: `<canvas>` 566 × 230 inside the card (chart card spans the panel width).

## KPI block

Two metrics per row, columns at x=549 and x=840:

- Value 16 px / 600 white (e.g. "173", "3w 0d 2h", "2h 58m 47s").
- Delta chip next to it, 12 px / 500: regression `rgb(224, 104, 125)`, improvement `rgb(0, 175, 121)` (e.g. "165", "2w 6d 1h", "10m 17s").
- Label under the value, 12 px / 400 muted: Incidents, Total incident length, MTTR, MTTA.

## Incident table

- **Export CSV** action sits above the table, right-aligned, 12 px / 500.
- Header row 40 px tall, 12 px / 500 labels: ID (98), Monitor (149), Cause (199), Escalation policy (121), Started at (173), On-call (66), TTA (131), Acknowledged by (131), TTR (268), Resolved by (153), Off hour alerts (108), Metadata (274).
- Rows follow the shared table style; the table is wide and horizontally scrollable.
- Pagination at the bottom: 26 × 26 buttons, current page filled `rgb(47, 54, 71)`.

## Report tree

- **Overview**
  - Incidents
  - Overview — metrics: Manual incidents, Started at, Resolved, MTTR, MTTA, Heatmap, Acknowledged
- **Organization**
  - Incidents
  - On-call schedules
  - Alerts — MTTR
  - Teams — Response effort
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

Selected leaf uses white text; the rest are muted.

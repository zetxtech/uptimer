# Better Stack: monitor detail

Captured 2026-11-13 at `…/team/t132878/monitors/2498052` (a monitor that is currently down). Read-only.

## Header

- `h1` monitor name 28 px / 600 white at y=132, x=520.
- Status line 17 px below: status word **Down** 14 px / 500 `rgb(224, 104, 125)`, then `·`, then "Checked every 3 minutes" 14 px / 400 muted.
- Action strip at y=238, plain text buttons 14/400 muted (no borders, no fills): **Send test alert**, **Incidents**, **Pause**, **Configure**. Horizontal gaps ~48 px.

## Summary row

Three columns of 185 px at x=481, 724, 967 (same grid as the incident summary):

- **Currently down for** (14/400 muted) → "23 hours 50 mins" (20/600 white)
- **Last checked at** → "1 minute ago" (20/600)
- **Incidents** (14/400) with an inline **Ongoing incident** chip (13/500 muted) → "56" (20/600)

## Response times panel

- Section bar **Response times**: 711 × 42, radius 8, fill `rgb(34, 40, 56)`, label 13/500 muted. The bar doubles as the collapsed header of the chart card.
- Chart area: ~470 px tall inside the same card, with the axis labels at 11–12 px and no gridline-heavy styling.
- Below the chart sits the stats table:
  - Header row 41 px tall; labels 13/500 muted: Time period, Availability, Downtime, Incidents, Longest incident, Avg. incident. Column widths: 177 / 99 / 183 / 89 / 185 / 183.
  - Body rows ~42 px tall; first cell 13/400 white, availability 13/500 white, remaining cells 13/400 white. Numbers are not tabular-figure aligned; long durations wrap into two lines when needed.
  - Rows: Today, Last 7 days, Last 30 days, Last 365 days, All time (Last N days).
- Date range row below the table: **From** / **To** fields and a **Calculate** button.

## Notes

- There are no KPI tiles, no cards per metric, and no icon buttons in the header — everything is text.
- The only filled surfaces are the panel headers (42 px, radius 8) and the chart card itself.

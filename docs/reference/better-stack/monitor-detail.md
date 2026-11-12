# Better Stack: monitor detail

Captured 2026-11-13 at `…/team/t132878/monitors/2498052` (a monitor that is currently down). Read-only.

## Header

- `h1` monitor name 28 px / 600 white at y=132, x=520.
- Status line 17 px below: status word **Down** 14 px / 500 `rgb(224, 104, 125)`, then `·`, then "Checked every 3 minutes" 14 px / 400 muted.
- Action strip at y=238: icon + text links, 20 px icons, `px-2 py-1 rounded`, hover `text-primary` + `bg-elevation-4`: **Send test alert** (paper-airplane, POST), **Incidents** (shield-exclamation, → `/incidents?m=<id>`), **Pause** (pause, POST `/monitors/<id>/pause`, no confirm), **Configure** (cog, → `/monitors/<id>/edit`). Horizontal gaps ~48 px. On mobile the strip wraps (`flex-wrap`, `gap-2`, `-mx-2`).

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

## Table markup (from the archived DOM)

- Wrapper: `rounded border border-neutral-60 dark:border-neutral-600 overflow-x-auto text-dashboards-sm`.
- `<table class="w-full min-w-max">`; header row `text-secondary border-b bg-elevation-2`, each `<th class="px-4 font-medium text-left|text-right py-[14px]">` (only "Time period" is left-aligned, the rest right-aligned).
- Body rows `border-t border-neutral-60 dark:border-neutral-600 hover:bg-elevation-3`; cells `px-4 py-[14px]`, durations wrapped in `whitespace-nowrap`.
- Empty cells print the literal word **none** (not a dash) — e.g. "Today · 100.0000% · none · 0 · none · none".
- The availability cell carries a tooltip explaining the window start ("We have calculated the availability only since you have started monitoring with us: …").
- Custom range row: two PrimeVue date pickers (`form-control-v2 pl-9` with a 16 px calendar icon, `placeholder` = current date, hidden input `range-end`/`range-start` in ISO) labelled **From** and **To**, plus a **Calculate** button `ml-1 px-3 h-9 rounded border border-elevation-5 bg-white dark:bg-neutral-700`.
- The chart above the table is `#response-times-chart` with a fixed **466 px** height inside a bordered card with a 42 px header.

## Notes

- There are no KPI tiles, no cards per metric, and no icon buttons in the header — everything is text.
- The only filled surfaces are the panel headers (42 px, radius 8) and the chart card itself.

# Better Stack: monitor detail

Captured 2026-11-13 at `…/team/t132878/monitors/2498052` (a monitor that is currently down). Read-only.

## Header

- `h1` monitor name 28 px / 600 white at y=132, x=520.
- Status line 17 px below: status word **Down** 14 px / 500 `rgb(224, 104, 125)`, then `·`, then "Checked every 3 minutes" 14 px / 400 muted.
- Action strip at y=238: icon + text links, 20 px icons, `px-2 py-1 rounded`, hover `text-primary` + `bg-elevation-4`: **Send test alert** (paper-airplane, POST), **Incidents** (shield-exclamation, → `/incidents?m=<id>`), **Pause** (pause, POST `/monitors/<id>/pause`, no confirm), **Configure** (cog, → `/monitors/<id>/edit`). Horizontal gaps ~48 px. On mobile the strip wraps (`flex-wrap`, `gap-2`, `-mx-2`).

## Summary row

Three separate cards, not one grid: each is `flex-1 p-5 mb-5 rounded border border-neutral-60 dark:border-neutral-600 bg-elevation-2 shadow-2xs` inside a `flex-col md:flex-row md:space-x-4` row, so they are 185 px wide with 16 px gaps at this viewport (x=481, 724, 967).

- Label `h6`, 14 px / 400 muted → value `h2.mt-2.display-small`, 20 px / 600 white.
- **Currently down for** → "23 hours 50 mins"
- **Last checked at** → "1 minute ago" (a `time.timeago` element with a tooltip showing the absolute timestamp)
- **Incidents** (with an inline **Ongoing incident** chip 13/500 next to the label) → "56"

## Response times panel

- Card wrapper `mb-5 rounded border border-neutral-60 dark:border-neutral-600`. Header bar: `px-4 flex items-center bg-elevation-2 rounded-t border-b h-[42px] leading-none font-medium text-dashboards-sm` — label **Response times**.
- Chart body `#response-times-chart` fixed `h-[466px]`, containing a `h-[400px]` plot area with a 16 px spinner while loading.
- Chart toolbar (`px-6 pt-3 flex justify-between gap-4`):
  - Region selector: a flag icon (20 × 14, `rounded-[2px]`, 1 px border) overlaid inside a `<select class="form-control-v2 pl-[30px]">` with options Europe / North America / Asia / Australia; the select has no border (`border-none shadow-none bg-elevation-1`) and highlights on hover.
  - Range segmented control: buttons `py-2 w-16` (64 px), `-ml-px`, first `rounded-l`, last `rounded-r`, 1 px border; active button filled `bg-neutral-50 dark:bg-neutral-700 text-primary`, others transparent with `hover:bg-elevation-3 hover:text-primary`. Labels **Hour**, **Day**, **Week**, **Month**.
- Below the chart sits the stats table:
  - Header row 41 px tall; labels 13/500 muted: Time period, Availability, Downtime, Incidents, Longest incident, Avg. incident. Column widths: 177 / 99 / 183 / 89 / 185 / 183.
  - Body rows ~42 px tall; first cell 13/400, availability cell `text-right font-medium`, remaining cells `text-right`, durations `whitespace-nowrap`.
  - Rows: Today, Last 7 days, Last 30 days, Last 365 days, All time (Last N days).
- Date range row below the table: **From** / **To** date pickers and a **Calculate** button, which appends a computed row ("Since 1 Nov 2026 until today").

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

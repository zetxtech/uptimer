# Better Stack: monitors list

Observed in the signed-in browser on 2026-11-12. This is a partial record of the list, filter and sort controls. Account-specific monitor names and team identifiers are omitted.

## List controls

The page heading is **Monitors**, with the description “Uptime monitoring for websites, applications, APIs, and servers”. The toolbar includes a **Search** input, **Filter monitors**, and a **Create monitor** link. Below it are **Groups** and **All monitors** views. Rows show a monitor name, status and elapsed time, and check frequency. Monitors associated with a status page can also show a status-page link; a down monitor can show an **Ongoing incident** link.

## Filter

**Filter monitors** opens a panel whose observed filter field is **Status**. Its combobox defaults to **Any status** and offers **Up**, **Down**, **Paused**, **Pending**, and **Maintenance**. The measured combobox was approximately 325 × 34 px; its open options list was approximately 325 × 190 px at the observed viewport.

Applying **Down** closed the panel, changed the toolbar button to **1 filter**, filtered the list to down monitors and added `status[]=down` to the URL. Clearing the filter removed the query parameter and restored the unfiltered list.

## Sort

The **Sort** popover offers radio choices in this order: **Name**, **Created at**, **Last updated at**, **Check frequency**, **Status**, and **Last incident started at**. A separator follows, then **Ascending** and **Descending** controls. The observed radio rows were approximately 190 × 34 px.

Selecting **Name** checked its radio; the URL was still `/monitors` immediately afterward. On a later visit to `/monitors`, the URL changed to include `gs[0]=name`. Initially no sort-field radio was checked. Whether the list reordered could not be verified while its data was loading. The sorting direction's default, persistence across sessions and behavior of other choices have not been verified.

## Default group menu and selection

In the observed account, the default group is titled **Monitors**. Its header has separate sort, add-monitor and ellipsis controls. The add link opens the monitor creation page with the default group selected (`group_id=0`). The ellipsis opens a bottom-end-aligned menu, approximately 190 px wide, with 6 px corner radius. Its items are **Create monitor**, a separator, **Select**, **Select all**, **Rename**, another separator, and **Remove**. In this default group, **Rename** and **Remove** were disabled; this does not establish their behavior for named groups.

Choosing **Select** enters selection mode with **0 selected**: a square selection control appears in the group header and in place of each row's status icon. The bottom action bar is visible even with no items selected; in that state it showed **Create group** and **Unpause**. Clicking the group selection control selected all nine monitors in that group, updated the count to **9 selected**, and changed the action to **Pause**. No bulk action was submitted. See the separate bulk-operations record for the available actions and dialogs.

For selection mode and bulk actions, see [monitors-bulk-operations.md](monitors-bulk-operations.md).

## Row anatomy (re-measured live 2026-11-13 on the group view)

The default `/monitors` URL renders an empty onboarding state for this team, but `/monitors?group_id=0` renders the real list (9 monitors, 831 px column at a 1152 px viewport):

- Row: 831 × 57, `padding: 0 20px`, **1 px top border `rgb(47, 54, 71)`**, no radius, transparent background; the whole row is one link.
- Status marker: 40 × 40 box at x = row + 20, containing three stacked 10 px animated circles (`circle-main` / `circle-secondary` / `circle-tertiary`), colour by state (`status-indicator--success` / `--danger`).
- Text block starts 76 px from the row edge: name `13px / 600`, `leading-[120%]`, white, `truncate`, 18 px line box, `pb-0.5`.
- Second line `mt-1 pb-1 text-dashboards-xs`: state word 12 px (Up `rgb(100, 194, 141)`, Down `rgb(224, 104, 125)`), then 10 px gap, then the elapsed time 12 px `rgb(147, 157, 184)`; no separator.
- Trailing block `flex items-center gap-6` at x = row right − 160: frequency cell fixed `w-[90px]` (13 px, with a tooltip wrapper), then a `w-[26px]` cell holding a 26 × 26 row menu button (radius 6).
- Down rows additionally show a status-page link pill: 182 × 30, 1 px border, radius 8, placed left of the frequency cell.
- Group header: `h-[42px] flex justify-between items-center cursor-pointer`, title 13 px / 500 `rgb(147, 157, 184)` at x = row + 34, trailing control cluster 108 × 26 at the right edge (sort, add, ellipsis as 26 × 26 buttons).
- Group ellipsis menu: 190 × 190, radius 6, fill `rgb(34, 40, 56)`, items 33 px tall / 13 px: **Create monitor**, separator, **Select**, **Select all**, **Rename** (disabled), **Remove** (disabled).
- Selection mode: bottom bar 377 × 32 at y = viewport − 60, buttons 32 px tall — `N selected`, **Create group** (131), **Pause**/**Unpause** (105), ellipsis (32); the state word flips from "Unpause" to "Pause" once rows are selected.

## Earlier measurements (2026-11-12)

Measured against the reference list before the page degraded to its onboarding empty state:

| Item | Better Stack | Notes |
| --- | --- | --- |
| Row height | 57 px | row pitch 57, no divider between rows |
| Row padding | 20 px left/right | content starts at x = row.x + 20 |
| Status marker | 40 × 40 animated circle | sits 20 px from the row's left edge |
| Name | 13 px / 600, 18 px line box | starts 76 px from the row's left edge |
| Second line | 12 px / 400 | status word (green `rgb(100, 194, 141)` when up) then the elapsed time in `rgb(147, 157, 184)`, 10 px gap, **no separator dot** |
| Trailing block | fixed 140 px | check frequency on top, action area below |
| Row action buttons | 26 × 26 | 24 px gap from the data columns |
| Selection mode | checkbox replaces the status marker | 16 px square, only while selection mode is active |
| Group header | separate row above its monitors | title + count, actions (sort / add / ellipsis) appear on hover, drag handle appears only on group hover |
| Bottom action bar | floats over the list | `N selected · Create group · Pause · ⋯ · ✕` |

The toolbar search field measured 265 × 36 with a `bg-elevation-2` fill; the filter button is the same height with a border. The list column is narrower than the content area and left-aligned with the page title.

## Row menu (live 2026-11-13)

The 26 × 26 button at the right edge of each row opens a menu measured **190 × 297**, radius 6, fill `rgb(34, 40, 56)`. Items are 33 px tall at 13 px, in this order:

1. **View incidents** → `/incidents?m=<monitorId>`
2. **Configure** → `/monitors/<monitorId>/edit`
3. **Pause** (POST, no confirm)
4. **Duplicate**
5. **Send test alert**
6. **Select** (enters selection mode with this monitor checked)
7. **Create group**
8. **Remove** (native confirm, `_method=delete`)

The menu opens bottom-end aligned to the button.

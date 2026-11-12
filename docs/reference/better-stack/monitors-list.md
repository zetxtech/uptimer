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

## Row anatomy (measured live on 2026-11-12, when the team still listed monitors)

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

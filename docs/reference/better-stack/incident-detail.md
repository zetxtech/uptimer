# Better Stack: incident detail

Captured 2026-11-13 from `…/team/t132878/incidents/1050676377` (an ongoing monitor incident). Read-only; nothing was changed.

## Header

- `h1` is the monitor name: 28 px / 600 white, 34 px line box at y=132, x=518.
- Second line: status word **Ongoing** in `rgb(224, 104, 125)` + separator + date `Nov 11, 2026 at 7:53pm GMT+8`, 14 px / 400, `rgb(147, 157, 184)`, y=168.
- Right side actions: **Escalate** button 96 × 36, radius 8, fill `rgb(41, 48, 64)`, 14/500; **Acknowledge** 115 × 44, transparent, 14/500.

## Tab strip under the header

Items, 14 px / 400 `rgb(147, 157, 184)`, y=236, 17 px line: **Response**, **Screenshot**, **Monitor**, **Rename**, **Remove**. Right-aligned pill **Not acknowledged yet** — 149 × 24, radius 9999, background `rgb(34, 40, 56)`, 1 px border, 12 px text white, wraps onto two lines.

## Summary card

Three equal columns of 185 px with 58 px gaps (x=481, 724, 967):

- **Cause** label 14/400 muted; value 20 px / 600 white, 28 px line box (e.g. "Status 525").
- **Started at** → relative time ("23 hours ago") 20/600.
- **Length** → "Ongoing" 20/600.

Then full-width rows:

- **Checked URL** label 14/500 muted. Value row 671 × 39, radius 8, background `rgb(41, 48, 64)`, 1 px border, containing a `GET` pill and the URL in 14 px muted text.
- **Escalation** label 14/400; value **Entire team** 14/500 white.
- Request tabs: **Resolved IPs**, **Request timing**, **Response headers**, **Replay** — each 46 px tall, 13 px text, radius 8; active tab white text, inactive `rgb(147, 157, 184)`; active tab has an underline/indicator and no fill.
- Tab body line (e.g. `163.181.214.1`) 12 px muted.

## Metadata

A single row strip: 711 × 42, radius 7, background `rgb(34, 40, 56)`, label **Metadata** 13/500 muted.

## Timeline

- Section heading **Timeline** 16/600 white (713 wide, 24 px line), y=1274.
- Composer row: textarea/placeholder bar 585 × 42 radius 8 background `rgb(34, 40, 56)` 1 px border, plus **Post** 64 × 40 radius 8 fill `rgb(47, 54, 71)`.
- Entries are newest-first, each with a leading avatar/icon column and a body. Entry text 13 px; timestamps 12 px muted; region chips (Asia / Europe / North America) are small pills next to the message.
- Observed entries in order: "The incident e-mail sent to … was loaded.", "Sent an email to Jack Zhou …", "Notifying the entire team.", "Incident started.", "Waiting for 10 minutes before starting the incident.", then one "Received a status 525 error … when checked from <ip>." entry per region.

## Status page composer

Below the timeline, a card block headed **Status page (status.zetx.tech)** (14/700 white):

- Collapsed row **Create status report** 671 × 49 radius 8 background `rgb(34, 40, 56)`, 13/500.
- Expanded fields: **What's going on?** (12/500 label) with help "Concise summary of the incident."; **Description** textarea prefilled "protactmapi.zetx.tech went down." (623 × 98, radius 8); help "You can use markdown. View recommended templates".
- **Affected services** list: each row is monitor name 14/500 white with a right-aligned state (**Downtime** / **Not affected**) 14/500; 53 px row pitch.
- **Published at** and **Notify status page subscribers** ("We won't notify anyone") below, then the primary action **Create status report**.

## Notes for the Uptimer port

- Summary values are 20/600 — larger than labels, and the page title is 28/600, so hierarchy is title → 20 px values → 16 px section headings → 14 px labels → 13 px body.
- Actions live in a text tab strip, not icon buttons; the only filled button in the header is Escalate, and Acknowledge is a plain text action.

## State variants (archived resolved incident)

- Header line for a resolved incident: **Resolved** in the neutral text colour, then `·`, then the absolute start time ("Nov 8, 2026 at 3:45pm GMT+8"). The acknowledgement pill reads **Not acknowledged** when nobody acknowledged, "Not acknowledged yet" while ongoing.
- The action strip gains **Reopen** as its first item when the incident is resolved; the rest stay **Response**, **Screenshot**, **Monitor**, **Rename**, **Remove**.
- The AI summary block renders a **Summarizing…** placeholder inside the summary card until the postmortem is ready.

## Request detail tabs, populated

With an incident selected the tabs show real data:

- **Resolved IPs** — one IP per line (e.g. `163.181.214.1`).
- **Request timing** — key/value rows, label left, value right, 12 px text: Effective URL, Redirect count, Name lookup time, Connect time, Pre-transfer time, Start-transfer time, App connect time, Redirect time, Total time, Response code, Return keyword (e.g. "ok").
- **Response headers** — status line then raw headers (`HTTP/2 525`, `server: ESA`, `content-length: 0`, …) rendered as plain monospace-ish lines, not a table.
- **Replay** — the playback surface for the captured request.

## Status report composer, expanded (live 2026-11-13)

Clicking the collapsed **Create status report** row expands it in place (no modal). Measured at a 1152 px viewport:

- Card block inside the timeline column; content padding 24 px (fields start at x = card + 24).
- **What's going on?** label 12/500, then a 743 × 36 text input prefilled with "<monitor> is down"; help "Concise summary of the incident." 12/400 under it.
- **Description** label 12/500, textarea 743 × 98 (radius 8, fill `rgb(34, 40, 56)`), prefilled "<monitor> went down."; help "You can use markdown. View recommended templates".
- **Affected services** label 12/500, then one row per service: name 14/500 white (truncated with ellipsis) and a right-aligned status multiselect 192 × 36 (radius 8, 1 px `rgb(59, 66, 84)` border, `rgb(34, 40, 56)` fill) showing **Downtime** / **Not affected** / etc. Row pitch 53 px.
- **Published at** label 12/500 with a datetime control.
- **Notify status page subscribers** — 16 px checkbox (radius 4, `rgb(47, 54, 71)` unchecked fill) plus label 12/500; the collapsed value reads "We won't notify anyone".
- Submit **Create status report**: 151 × 32, radius 8, fill `rgb(91, 99, 211)`, left-aligned at the bottom of the block.
- Submitted values are carried in hidden inputs: status text, description, one status code per service (`not_affected` / `downtime`), publication timestamp (`YYYY-MM-DDTHH:mm`), timezone name, notify flag.

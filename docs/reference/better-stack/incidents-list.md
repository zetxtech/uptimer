# Better Stack: incidents list

Observed in the signed-in browser on 2026-11-12. This record covers the list and the opened filter, not every available interaction.

## List

The page has an **Incidents** heading, a search box showing the `/` keyboard hint, a **Filter incidents** icon button and a **Report a new incident** link. The table columns are **Incident**, **Team**, **Length** and **Acknowledged**. Incident rows are links to individual incident details; the first column shows a resource name, a short cause and relative start time. A row can represent similar incidents and shows the number of ongoing and resolved incidents. The Length column shows **Ongoing** for active incidents. Pagination is numeric, with previous/next controls and an ellipsis for omitted pages.

## Filter

Clicking the filter icon reveals a panel headed **Filters**, with fields in this order: **Status**, **Escalation policy**, **On-call person**, **Resource**, **Cause**, **Metadata**, **Comments**, **Post-mortems**, **Longer than**, **Shorter than**, **Start between**, **And**. Cause and Metadata are text inputs. Status, Comments, Post-mortems and the duration fields have comboboxes; escalation policy, on-call person and resource also use interactive selection controls. The **Filter incidents** submit button was disabled before changes.

On opening the individual comboboxes:

- Status defaults to **Any status**; options are **Ongoing**, **Acknowledged**, **Resolved**.
- Comments defaults to **Any incident**; options are **With comments**, **Without comments**.
- Post-mortems defaults to **Any incident**; options are **With post-mortems**, **Without post-mortems**.
- Longer than and Shorter than default to **Any length**; each offers 15 minutes, 30 minutes, 1 hour, 2 hours, 4 hours, 8 hours, 1 day, 2 days, 4 days, 8 days, 16 days and 1 month.
- Escalation policy, On-call person and Resource show **Any policy**, **Any team member** and **Any monitor, heartbeat, or integration**, respectively, before selection.

The Escalation policy and On-call person selectors showed **The list is empty** for this account; this is account-dependent, not a universal option list. Resource opens a searchable list of this account's monitors; the resource names are account data and are not reproduced here. Applying Status = Ongoing, Comments = Without comments and Longer than = 15 minutes closed the panel, changed the filter control to **3 filters**, and added `is=["ongoing"]`, `c=wc`, `lt=15` to the URL query. After loading, two ongoing entries remained. Reopening the panel showed a **Clear** button and a disabled **Filter incidents** button until changes were made; clicking Clear closed the panel and removed the query parameters.

The open panel was measured in dark mode at 360 px wide with a 12 px radius, a thin border and a subtle shadow. Its body has 16 px padding and scrolls independently; field labels are 12 px and each observed field occupies 58 px vertically, with 16 px gaps within a section. The panel has a fixed heading and footer around the scrollable body; its height is constrained by the viewport.

The current account's team names, monitored hosts and incident values are examples, not fixed interface content.

## Report a new incident

The list's **Report a new incident** link navigates to a separate report page at `/report/<share-token>`; the token and URL are account-specific and are deliberately omitted here. The page offers a shareable URL above the form, then the **Report new incident** heading.

The form contains, in order:

1. **What's going on?**: required **Brief description** (placeholder `Example: New users can't sign up`), required **In-depth description**, and **Attach files or screenshots**, with a drag-and-drop area and **Choose files** button.
2. **Your contact details**: **Your e-mail**, prefilled and disabled in this signed-in session.
3. **Who should we notify?**: **Report to**, a team or escalation-policy selector.
4. **Notification channels**: Call, SMS, E-mail, Push notification and Critical alert. In this account E-mail was checked; Call, SMS and Push notification were disabled with upgrade links, and Critical alert had an upgrade link. A message below described the lack of a primary responder and linked to schedule setup. Availability and selected team are account-dependent.
5. **Create new incident** submits the form.

## Measured list anatomy (2026-11-13)

Re-measured with the list populated (22 pages of incidents, 1056 px column at a ~1550 px viewport):

- Header row: `h1` "Incidents" 28/600, breadcrumb chip `/` 22 × 22 radius 4 fill `rgb(47, 54, 71)`, primary **Report a new incident** 172 × 36 radius 8 fill `rgb(91, 99, 211)` 14/500.
- Search input: 265 × 36, radius 8, fill `rgb(34, 40, 56)`, 13 px, placeholder **Search**, right-aligned before the primary button.
- Column header band 37 px tall, labels 13/400 muted: Incident (left), Team (~52 % offset), Length, Acknowledged; the right columns carry 26 × 26 sort buttons.
- Data rows: 82 px tall (two-line rows), full width; single-line rows are shorter (57 px). The row link wraps the whole row; there is no border or card fill, only a hover tint.
- Row content: monitor name 13/600 white, 17 px line box, 2 px gap to the second line; second line "Status 525 / Started 23 hours ago" at 13/400 muted. Grouped rows prefix "2 similar incidents". Right columns: team avatar + name, length, acknowledged dash.
- Pagination: 26 × 26 buttons radius 6; current page filled `rgb(47, 54, 71)` with white text, others transparent and muted, with an ellipsis before the last pages.

## Report form (archived DOM, `…/report/<token>`)

- Informational banner above the title: `flex space-x-3 border rounded-lg px-3 pt-3 pb-4 bg-neutral-50 dark:bg-neutral-800 border-neutral-40 dark:border-neutral-700` with a 16 px solid `information-circle` icon, bold title **Share this URL with your team**, body "Let your colleagues report issues directly to the on-call person. Share the following URL on your team's Slack or wiki.", and a readonly monospace input (`font-mono text-sm rounded-sm p-1.5`) containing the public report URL.
- `h1` **Report new incident** (`display-large mt-12 mb-10`).
- Section copy: **What's going on?** — "Please describe what's going on including steps to reproduce the issue. The more specific you are, the easier it's going to be for your colleagues to locate the issue and resolve the incident."
  - **Brief description \*** (required text input, `placeholder="Example: New users can't sign up"`, `maxlength=100`, autofocus).
  - **In-depth description \*** (required `textarea rows=5`).
  - **Attach files or screenshots** with a drag-and-drop area ("Drag & drop files or screenshots" / "Drop it here") and a **Choose files** button backed by a visually hidden file input.
- **Your contact details** — **Your e-mail**, prefilled and `disabled`, italic, dimmed background.
- **Who should we notify?** — **Report to** (team or escalation policy).
- **Notification channels** — intro "Please configure how urgent this incident is." then checkboxes Call, SMS, E-mail (checked), Push notification, Critical alert; disabled ones carry upgrade links. Note under them: "<team> currently has no primary responder. Set up primary schedule to always have a specific team member to notify."
- Submit button: `h-10 rounded px-3.5 font-medium text-white bg-brand-primary-200`, label **Create new incident**.

Submitting both description fields empty triggers native browser required-field validation on the brief description first; both description controls have `required`. No incident was created. At a 1208 × 958 viewport the heading measured 28 px / 600 weight, the content/form width 1000 px, text inputs 36 px high with 8 px radius, the textarea 118 px high, and the submit button 40 px high. Dimensions reflect this viewport and account state.

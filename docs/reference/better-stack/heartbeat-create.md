# Better Stack: create heartbeat

Observed in the signed-in browser on 2026-11-12 at `/team/<team-id>/heartbeats/new`. This is a partial record of the dark theme at the current viewport; account-specific options and timezones can differ. No heartbeat was created.

## Page and default fields

- Breadcrumb and heading: **Create heartbeat**. The page heading is 28px, weight 600, line-height 33.6px. Section headings are 16px, weight 600, line-height 24px.
- **What should we monitor?** contains a required name input, placeholder `Example: Daily database backup`, followed by the heartbeat period and grace period. Default period: 1 day; available units: second, minute, hour, day. Default grace: 5 minutes; units: seconds, minutes, hours, days. The grace tooltip recommends adding a 20% reserve above expected execution time.
- The number inputs are 64 × 36px and unit selects 120 × 36px, separated by 8px. At the observed viewport the name input was 831 × 36px. Fields use 14px text, 8px radius, a 0.8px `rgb(59, 66, 84)` border, `rgb(34, 40, 56)` background and a subtle `0 2px 2px rgba(0,0,0,.18)` shadow.
- **How should we escalate incidents?** explains that rules determine whom to notify and how. **Notify the primary responder** is selected by default and links to the primary on-call schedule. Call, SMS and push notification are disabled on the observed account with upgrade links; E-mail is selected. Critical alert is presented with an upgrade link and tooltip.
- **If the primary responder doesn't acknowledge the incident** options: Do nothing; immediately alert all other team members; alert them within 3, 5 or 10 minutes. Default: 3 minutes.

## Expandable sections

- **Advanced settings** expands in place and exposes **Location timezone** and **Maintenance**. Server timezone defaults to None and is described as effective only for periods of at least one hour. Maintenance contains start and end time controls, a timezone selector, a local-time explanation, a team-wide maintenance link and weekday choices Mon–Sun. The observed account timezone was Asia/Singapore; this is account data, not a universal default.
- **Metadata** expands separately in place. It describes custom key-value pairs for escalation and reporting, links to documentation and presents Key and Value inputs. The key control displayed the example `DATACENTER`.
- The bottom **Create heartbeat** button measured 144 × 40px, 14px/500, radius 8px, with `rgb(91, 99, 211)` fill and `rgb(124, 135, 247)` border.

## Validation and gaps

Clicking Create heartbeat with the name empty kept the page in place and invoked the browser's native required-field validation on the name input. With the browser's Chinese locale the validation message was `请填写此字段。`; no `role=alert` was present. This does not establish server-side error formatting. Other escalation-policy branches, timezone dropdown contents, submission and post-create behaviour remain to be observed.

## Structure from the archived DOM

- The form uses a **two-column section layout**: left column `flex-1` holds the `h3.heading` + description, right column `flex-2 rounded-lg bg-elevation-2 border p-6 xl:rounded xl:border xl:max-w-[612px]` holds the controls. This is different from Create monitor, where each section is a full-width card.
- Section 1 copy: "Configure the name and schedule for the CRON job or a worker you want to monitor." Field label **What service will this heartbeat track?** (with the **Billable** badge), then the sentence row: "Expect a heartbeat every `[n]` `[unit]` with a grace period of `[n]` `[unit]`".
  - `heartbeat[period_type]` options: second, minute, hour, day.
  - `heartbeat[grace_type]` options: seconds, minutes, hours, days.
- Section 2 is the shared escalation block (primary responder radio, escalation policy radio, notification checkboxes, acknowledgement select with the same five options), followed by **Escalation steps**.
- **Advanced settings** contains **Location timezone**: "Set your server location to count in local timezone changes." The select is a searchable multi-select; each option renders as `GMT±hh:mm` + `Area/City` + local time, e.g. `GMT+08:00 Asia/Singapore`, `GMT-05:00 America/New York`. Hidden input `heartbeat[server_timezone]`; empty means None.
- **Maintenance** card (`#maintenance-form.vue-maintenance`, `p-6`, radius 8/12, `xl:max-w-[612px]`):
  - Label **Maintenance window between**, two `<input type="time" step="60">` fields (`maintenance_from`, `maintenance_to`).
  - Timezone picker: 36 px chip `rounded border border-elevation-5 bg-elevation-2 shadow-button`, globe icon 16 px, then `GMT+08:00` in primary text and `Asia/Singapore` in tertiary text truncated with ellipsis; click opens a searchable list.
  - Weekday chips Mon–Sun bound to `maintenance-days` (all seven enabled by default).

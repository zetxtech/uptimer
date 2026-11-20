# Better Stack: monitor edit (Configure)

Sources: live page `…/team/t132878/monitors/2498052/edit` on 2026-11-13, plus the archived DOM of `…/monitors/5165793/edit` (saved while signed in) for the expanded form and control markup.

## Header

- No page title. The monitor name is the `h1` (28/600).
- Action strip directly under the title, items are icon + text links (`px-2 py-1 rounded`, 20 px icon, `gap-2`, hover `text-primary` + `bg-elevation-4`):
  - **Send test alert** — `POST /test-alerts?subject_id=<id>&subject_type=Endpoint`, icon `paper-airplane`.
  - **Incidents** — link to `/incidents?m=<id>`, icon `shield-exclamation`.
  - **Pause** — `POST /monitors/<id>/pause`, icon `pause`, no confirmation dialog; label swaps to the submitting state while the request runs.
  - **Configure** — link to `/monitors/<id>/edit`, icon `cog`.
- On the edit page the strip becomes **Send test alert**, **Pause**, **Remove**:
  - **Remove** — `DELETE /monitors/<id>` with a **native browser confirm**: "Are you sure you want to remove <monitor target>?" Label swaps to "Removing..." with the trash icon while submitting.
  - Text weight: Pause/Remove use `font-medium`; test alert uses normal weight.

## Form body

Same two cards as Create monitor, then collapsible **Advanced settings** and **Metadata**, then **Save changes** (40 px primary, bottom-left of the column).

### Section 1 field sets

The "What should we monitor?" card swaps its fields by monitor type. Observed labels:

- URL types: **URL to monitor**, **Expected HTTP status codes**, **Keyword to find on the page**, **Keyword to find in response**, **Keyword to find in the DNS response** (help: "We use case insensitive matching.").
- Expected status codes are a multi-select of every code: 100–103, 200–208, 300–308, 400–418, 421–429, 431, 451, 500–511.
- Host types: **Host to monitor**, **TCP port**, **UDP port**, **Send data to port** (upgrade), **Ping timeout**.
- Mail types: **SMTP ports**, **POP3 ports**, **IMAP ports**.
- DNS type: **DNS server to monitor**, **Domain to query the DNS server with**.
- Playwright type: **Scenario name**, **Playwright scenario**, **Playwright scenario timeout** (upgrade).

### Section 2 and "Escalation steps"

- "How should we escalate incidents?" is identical to create: primary responder radio, escalation policy radio, notification checkboxes (Call/SMS locked, E-mail checked, Push/Critical locked), acknowledgement select.
- A separate **Escalation steps** section follows it: "Escalate to on-call schedules, post todo-lists, route incidents by metadata or resolve incidents automatically." (feature-gated; no editable step list in this account).

### Advanced settings inventory

Order: Pronounceable monitor name · Recovery period / Confirmation period · (Ping timeout / Response timeout for host types; Playwright scenario timeout for Playwright) · Check frequency / Internet Protocol (IP) version · SSL & domain verification · Request parameters · Request headers · HTTP authentication · Environment variables · Maintenance · Regions · GitHub badge.

- **Recovery period**: Immediate recovery, 1, 3, 5, 15, 30 minutes, 1 hour, 2 hours.
- **Confirmation period** (HTTP): Immediate start, 5, 10, 15, 30 seconds, 1, 2, 3, 5, 10, 15, 30 minutes, **Other** → numeric input + "seconds".
- **Confirmation period** (host/response variant) adds an **8 minutes** step.
- **Ping timeout** / **Response timeout**: 5 seconds, 3 seconds, 2 seconds, 1 second, 500 milliseconds.
- **Check frequency**: 30, 45 seconds, 1, 2, 3, 5, 10, 15, 30 minutes.
- **IP version**: Both IPv4 and IPv6, IPv4 only, IPv6 only.
- **SSL & domain verification**: SSL/TLS verification On/Off; SSL expiration thresholds (1/2/3/7/14 days, 1/2 months, upgrade to use); "How should we alert you about expiration?" (E-mail entire team); Domain expiration thresholds (same list).
- **Request parameters**: method (HEAD, GET, POST, PATCH, PUT, OPTIONS), request timeout (3 min … 2 s), body textarea with `{timestamp}` cache-busting help, **Follow redirects**, **Keep cookies when redirecting**.
- **Request headers**: Header name / Header value rows.
- **HTTP authentication**: username, password ("We store it in an encrypted form."), Proxy host, Proxy port.
- **Environment variables**: "Store passwords, secrets, and tokens securely using environment variables. We store the variables in an encrypted form. Access the variables in the scenario code using e.g. `process.env.PASSWORD`. Paste your whole .env file into any variable field and we'll expand it." Rows: **Variable** / **Value**.
- **Maintenance**: heading + "We'll ignore all incidents during the daily recurring maintenance window." — no controls rendered in this account.
- **Regions**: Europe, North America, Asia, Australia checkboxes.
- **GitHub badge**: "Embed this badge at the top of README.md in your GitHub repository." Three snippets, each followed by a **Copy** action that flips to **Copied!**:
  - `[![Better Stack Badge](https://incidents.betterstack.com/status-badges/v1/monitor/<id>.svg)](https://incidents.betterstack.com/?utm_source=status_badge)`
  - same with `v2`, same with `v3`.

### Metadata

"Attach custom key-value pairs to incidents for more granular escalation rules and reporting." + **Read the documentation** link. No rows in this account.

## Notes for the Uptimer port

- Delete/remove uses the browser's native confirm, not a styled dialog; only destructive submits swap the button label.
- Pause has no confirmation at all — it is a single POST link.
- The action strip is icon + label, 20 px icons, hover tinted; the page title is the monitor name, not "Monitor detail".

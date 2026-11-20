# Better Stack: Create monitor

Captured from the signed-in reference session on 2026-11-12 and 2026-11-13. Everything here is observed, not inferred. Nothing was saved to the reference account.

## Page frame

- Sidebar is 272 px wide (expanded) and the workspace top bar is 52 px tall.
- `main` is `mx-auto px-5 pt-20 pb-8 max-w-[1040px] h-[calc(100%-52px)]`. At a 1193 px viewport the rendered `main` was 753 × 1624 at x=440, and the content column measured **713 px** wide at x=460.
- `h1` "Create monitor": 28 px / 600, white, 34 px line box at y=132.
- Section heading `h3`: 16 px / 600, white, 24 px line box.
- Section description: 14 px / 400, `rgb(147, 157, 184)`, 21–22 px line box.
- Vertical rhythm: title 132, first section heading 220, first card top 424, next section heading 677 → sections are separated by ~40 px; a section is always "heading + description + card".

## Card surface

Classes: `flex-2 rounded-lg shadow-2xs dark:shadow bg-elevation-2 border border-neutral-60 dark:border-neutral-600 xl:max-w-[612px]`.

Measured at this viewport: 713 × 282, x=460, y=424. In dark mode:

- background `rgb(34, 40, 56)`
- border 1 px `rgb(47, 54, 71)`
- corner radius 12 px
- padding 24 px (content starts at x=485; card left edge is 460)

## Field primitives

| Element | Height | Radius | Border | Background | Text |
| --- | --- | --- | --- | --- | --- |
| `input.form-control-v2`, `select.form-control-v2` in main card | 36 px | 8 px | 1 px `rgb(59, 66, 84)` | `rgb(34, 40, 56)` | 13 px / 400 white |
| Same controls inside Advanced settings | 34 px | 8 px | same | same | same |
| Field label | 16 px line box | — | — | — | 12 px / 500 `rgb(147, 157, 184)` |
| Help text under a field | 17–21 px | — | — | — | 12 px / 400 `rgb(147, 157, 184)` |
| Checkbox / radio | 15–16 px | 4 px (checkbox), 9999 px (radio) | — | unchecked `rgb(47, 54, 71)`, checked `rgb(91, 99, 211)` | — |
| Primary button ("Create monitor") | 40 px | 8 px | none | `rgb(91, 99, 211)` | 14 px / 500 white |

Selects are native `<select>` elements styled with `form-control-v2`; the more complex pickers (region/monitor pickers) are Select2 (`select2-selection--multiple`) with a floating list. Compact selects cap at 280 px (`sm:max-w-[280px]`) and sit left-aligned; text inputs span the full card width (663 px inside the card).

## Section 1 — "What should we monitor?"

Description: "Configure the target website you want to monitor. You'll find the advanced configuration below, in the advanced settings section."

1. **Alert us when** — select, 280 × 36 at x=485, y=378. Options in order:
   - URL becomes unavailable (default)
   - URL doesn't contain keyword
   - URL contains a keyword
   - URL returns HTTP status other than
   - Host doesn't respond to ping
   - Host doesn't respond at a TCP port (upgrade to use)
   - Host doesn't respond at an UDP port (upgrade to use)
   - SMTP server doesn't respond (upgrade to use)
   - POP3 server doesn't respond (upgrade to use)
   - IMAP server doesn't respond (upgrade to use)
   - DNS server doesn't respond (upgrade to use)
   - Playwright scenario fails (upgrade to use)
2. A **Billable** badge (`inline-flex h-4 px-1 rounded-[4px] text-[11px] text-white bg-neutral-400 dark:bg-neutral-300`, 45 × 16) appears next to the label once the field is interacted with. It was absent on first paint.
3. Conditional field block, rendered directly under the select:
   - Keyword mode: label **Keyword to find on the page** (12/500) + full-width text input, help "We use case insensitive matching."
   - Status mode: label **Expected HTTP status codes** + control.
   - The keyword modes are followed by a 12 px note: "We recommend the keyword matching method. **Upgrade your account** to enable more options."
4. **URL to monitor** — label 12/500; input 663 × 36 with placeholder `https://`, 13 px text.
5. Help line under URL: "You can import multiple monitors **here**." (12 px, the link is 12 px with radius 6 and no underline).

Spacing inside the card: label→control 6 px, control→help 10 px, control group→next label ~53 px.

## Section 2 — "How should we escalate incidents?"

Description: "Set up rules for who should be notified and how when an incident occurs."

- **Notify the primary responder** radio row (663 × 58, radio 16 px checked). Sub-line: "Configurable in the primary on-call schedule." (12 px, link styled inline).
- **Escalation policy** radio row (663 × 77, unchecked; filled `rgb(47, 54, 71)`). Sub-line describes escalation policies. Disabled for this account.
- **How should we notify the primary responder?** label (14/500 white) then a single row of checkbox+label pairs:
  - Call — locked, upgrade link sits on top of the label with a 40 % opacity plate
  - SMS — locked, same treatment
  - E-mail — checked (16 px box, radius 4, fill `rgb(91, 99, 211)`)
  - Push notification — locked
  - Critical alert — locked
- **If the primary responder doesn't acknowledge the incident** — full-width select (663 × 36), options: **Do nothing**, **Immediately alert all other team members**, **Within 3 minutes…**, **Within 5 minutes…**, **Within 10 minutes…**.

## Collapsible rows

Below the cards, two toggle rows, each 713 × 31, radius 8, 14 px / 400 `rgb(147, 157, 184)`:

- **Advanced settings**
- **Metadata**

Expanding "Advanced settings" reveals one continuous panel (no per-section cards). Its intro reads: "If you need something extra you can't configure here, please let us know at hello@betterstack.com and we'll make it happen!" and "Have questions? Let us know or check out the frequently asked questions." Section headings inside are `h3` 16/600 with 677 px width, content field width 630 px, two-column grid of 306 px columns with a 20 px gutter.

### Advanced: Pronounceable monitor name
Label + help "We'll use this name when we call you." Input 630 × 34.

### Advanced: Recovery period / Confirmation period (two columns)
- **Recovery period** select 306 × 34: Immediate recovery, 1 minute, 3 minutes, 5 minutes, 15 minutes, 30 minutes, 1 hour, 2 hours. Help: "How long the monitor must be up to automatically mark an incident as resolved."
- **Confirmation period** select 306 × 34: Immediate start, 5 s, 10 s, 15 s, 30 s, 1 minute, 2, 3, 5, 10, 15, 30 minutes, **Other**. Help: "How long to wait after observing a failure before we start a new incident." Choosing Other adds a numeric input plus a "seconds" suffix.

### Advanced: Check frequency / IP version (two columns)
- **Check frequency** select: 30 s (disabled), 45 s (disabled), 1 minute, 2, 3, 5, 10, 15, 30 minutes. Help: "How often should we check your monitor?"
- **Internet Protocol (IP) version** select: Both IPv4 and IPv6, IPv4 only, IPv6 only.

### Advanced: SSL & domain verification
- **SSL/TLS verification** select: On / Off. Help: "Should we check your security certificates?"
- **SSL expiration** select: Don't check for SSL expiration + "Alert 1/2/3/7/14 days before (upgrade to use)" + 1/2 months (upgrade). Below: "Upgrade your account to check for SSL expiration."
- **How should we alert you about expiration?** select: E-mail entire team.
- **Domain expiration** select: Don't check for domain expiration + same thresholds (upgrade). Below: "Upgrade your account to check for domain expiration."

### Advanced: Request parameters
- **HTTP method used to make the request** select: HEAD, GET, POST, PATCH, PUT, OPTIONS.
- **Request timeout** select: 3 minutes, 2 minutes, 1.5 minutes, 1 minute, 45 s, 30 s, 15 s, 10 s, 5 s, 3 s, 2 s. Help: "This includes both open and read timeout."
- **Request body for POST, PUT, and PATCH requests** textarea 630 × 82, placeholder `parameter1=first_value&parameter2=another_value`. Help: "You can use {timestamp} in the body to bust the cache. Example: {\"t\": {timestamp}}".
- Two checkboxes side by side, both checked: **Follow redirects**, **Keep cookies when redirecting**.

### Advanced: Request headers
Two columns: **Header name** (placeholder `Authorization`) and **Header value** (placeholder `Bearer 12345678abcdef==`). Only one empty row is shown initially.

### Advanced: HTTP authentication
Intro: "Add basic authentication credentials to access protected endpoints." then a link "Monitor HTTP endpoints on private networks using the Squid HTTP proxy and basic authentication."
- **Basic HTTP authentication username** / **Basic HTTP authentication password** (help: "We store it in an encrypted form.")
- **Proxy host** (placeholder `myuser:mypassword@1.1.1.1`) / **Proxy port** (placeholder `3128`)

### Advanced: Maintenance
Heading plus "We'll ignore all incidents during the daily recurring maintenance window." No controls were rendered in this account state; the section is heading + description only.

### Advanced: Regions
"What locations should we check your website from?" Four checkboxes in two rows: Europe (`eu`), North America (`us`), Asia (`as`), Australia (`au`). Row 1 y=3433, row 2 y=3464 (31 px pitch), column 1 x=501, column 2 x=623/608.

### Advanced: GitHub badge
"Embed this badge at the top of README.md in your GitHub repository." Body: "Available after you create the monitor. Please come back later."

## Submit and error state

- Primary button **Create monitor** 130 × 40 at x=460, pressed with empty fields produced an inline error card at the top of the form column (`print:hidden mb-5 xl:mb-10`, 713 × 72 at y=188):
  - container `flex space-x-3 border rounded-lg px-3 py-3 bg-brand-red-100/15 dark:bg-brand-red-100/10 border-brand-red-100/15 dark:border-brand-red-100/10`, radius 12
  - title **Monitor couldn't be created.** 14 px / 600 white
  - body **Pronounceable name can't be blank and URL is invalid.** 14 px / 400 white
  - fields are not marked individually; no red border was applied to the URL input
- No modal was used; validation never opens a dialog.

## Fidelity notes for the Uptimer port

- Better Stack controls are native selects; a custom dropdown cannot match their popup rendering.
- Cards are one surface per section, not a stack of bordered rows.
- The advanced panel is a single flat region; its headings are plain text, not accordions.
- Section headings are 16 px, not 20+; page title is 28 px.

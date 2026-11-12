# Better Stack: settings pages

Captured 2026-11-13 at `betterstack.com/settings/*`. Read-only.

## Shell and rhythm

The settings area uses the same page frame as the incident product:

- `h1` 28 px / 600 white at y=84.
- Section headings `h3` 16 px / 600 white, 24 px line box, 60 px below the previous block.
- Section description 14 px / 400 `rgb(147, 157, 184)`, 22 px line box.
- Cards: 713 px wide, radius 12 px, 1 px border, dark fill `rgb(34, 40, 56)`, padding 24 px. Card heights observed: 587, 175, 126.
- Field label 12 px / 500 muted; input 36 px high, radius 8; two-column rows use two 328 px fields with a 24 px gutter (x=489 and 813).
- Primary action **Save changes** 40 px high, radius 8, fill `rgb(91, 99, 211)`, placed at the bottom of the page rather than per card.
- Destructive action **Permanently remove my account** 36 px high, radius 8, fill `rgb(224, 104, 125)`, followed by a 12 px warning line.

## Navigation

Sidebar groups:

- **Account**: Account settings, Security, Look & Feel, Alerts
- **Organization**: Organization, Teams, Usage, Billing, Single Sign-On, API tokens

## Account settings (`/settings/account`)

Cards in order:

1. **Basic account information** — note "We'll ask you to click a magic link in your email everytime you sign in."; note "You can configure your profile picture here or at Gravatar." with a **Remove picture** text action (11 px) under the avatar.
   - First name / Last name (two columns, 259 px each), E-mail, Phone, Phone 2 (single column, 328 px with a **Verified** area to the right), Timezone (full-width selector showing `GMT+08:00` + `Asia/Singapore` + "Current time: 7:43pm").
2. **Holiday mode** — "Suspend all alerts & notifications until a specific date." plus a date control and toggle.
3. **Permanently remove your account** — destructive button + warning.

## Security (`/settings/security`)

1. **Sign in using password** — "Set your password if you want to be able to sign in using password."; **New password** field (36 px) with help "Leave blank to keep your current password unchanged."
2. **Two-factor authentication** — "Use Google Authenticator, 1Password, or any other OTP client."; button **Enable two-factor authentication**; status line "Two-factor authentication is not enabled."
3. **Active sessions** — list rows: browser name + version (e.g. "Chrome 152"), "Last active Nov 12 at 11:32am UTC", OS · city: "Windows · Hangzhou, CN"; current session is annotated "Your current session"; other rows have a 32 px **End session** button.

## Look & Feel (`/settings/look-n-feel`)

Single card **Appearance** — "Personalize the in-app experience." — with three preview tiles: **Light mode**, **Dark mode**, **System**. No form controls beyond the tiles.

## Alerts (`/settings/push-notifications`)

1. Card **Push notifications** — "Receive push notifications about new incidents, on-call shift changes and more."; est. time 3 minutes; text "Install the Better Stack On‑call mobile app…"; two store buttons (**Download from App Store**, **Download from Google Play**).
2. **Notification previews** — "Preview incoming notifications when using the dashboard." + toggle (24 px).

## Organization (`/settings/organization/edit`)

- Sub-navigation: Settings · Security.
- **Organization details** — "Use a name your team members will recognize."; **Organization name** (36 px); **Default data region** with help "New Telemetry sources are created in your default data region…"; select with note "Leave it empty and we'll pick a region for you."
- **Early feature access** — "Enroll in beta testing…" + toggle.
- **Save changes**.

## Teams (`/settings/teams`)

Tabs: **Teams**, **Members**, **Roles & Permissions**. Primary **Create team** button. List shows "IAIR" and "1 team member". Table-style rows, no cards.

## Usage (`/settings/usage`)

Left rail with two groups and many entries:

- **Responders** — Incident management (Responders, AI SRE, Monitors, Heartbeats, Transaction monitoring, Slack & Microsoft Teams, Silenced incidents, Call routing)
- **Observability** — Bundles, Logs, Traces, Metrics, Query boost, Own S3 buckets, AWS Direct Connect, Errors, Session replays, Web events, Status pages (Status pages, Custom CSS & JavaScript, White-labeled, Password-protected, IP address restricted, Single Sign-On protected, Custom e-mail domain, Subscribers), Enterprise, Reporting, Single Sign-On, Audit logs

Body example (Responders): explanatory paragraph, **Manage responders** button, "1 out of 1 license used".

## API tokens (`/settings/global-api-tokens`)

Card **Global API tokens** — "Global tokens are shared among all teams throughout Better Stack." Links: Incidents API documentation, Telemetry API documentation. Tabs **Global tokens** / **Team-based tokens**. Form: **Token name**, scope radios **Read & write** / **Read only**, **Create** button. Empty state: "Create an API token to be able to use the API."

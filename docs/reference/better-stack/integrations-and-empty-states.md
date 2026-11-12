# Better Stack: integrations and empty states

Captured 2026-11-13. Read-only.

## Integrations (`…/team/t132878/integrations`)

- `h1` **Integrations** 28/600.
- Group label **Popular** (13 px muted) above a single-column stack of cards.
- Card: 728 × 109, radius 8, fill `rgb(34, 40, 56)`, 1 px border `rgb(59, 66, 84)`, padding 20, horizontal gap 20 between icon, text block and action.
- Card content: 40 px logo tile, title 14/600 white, description 13/400 muted (max two lines), right-aligned **Add** button 51 × 36 radius 8 fill `rgb(91, 99, 211)`, vertically centered. Some cards instead show a text link (**View status pages**).
- Observed entries and copy:
  - **AI SRE** — "Investigate incidents with an AI SRE agent and post findings to the incident timeline and Slack"
  - **Slack** — "Create, acknowledge, and resolve Better Stack incidents from Slack"
  - **Status page** — "Create public status page on status.yourdomain.com" → View status pages
  - **Google Calendar** — "Schedule on-call duties from Google Calendar"
  - **Heartbeats** — "Monitor your workers and CRON jobs with heartbeat monitoring"
  - **Datadog** — "Automatically create Better Stack incidents from Datadog"
  - **New Relic** — "Automatically create Better Stack incidents from New Relic"

## Monitors list, empty state

When the team has no monitors the list area is replaced by an onboarding card:

- `h1` **Monitors** + primary **Create monitor**, tabs **Groups** and **All monitors**.
- Empty column area above a card headed **Get the most out of Better Stack** with a right-aligned "**5** out of **7** steps left" counter.
- Step rows: 14/600 title (completed steps use the brand violet `rgb(124, 135, 247)`), 14/400 description, action link/button (`Add monitor`, `Integrations`, `Invite colleagues`, `Create status page`, `Install the app`, `Enter a credit card`, `Book a demo`).
- Footer: "Need help? Let us know at hello@betterstack.com".

## Heartbeats list, empty state

- No page title; the content area is a centered empty state: **Create your first heartbeat** (16/600), one 14/400 line "Track your CRON jobs and serverless workers and get alerted if they don't run correctly. Never lose a database backup!", a primary **Create heartbeat** button and a **Documentation** link.
- Above it a video thumbnail with a **Play video** control.

## Status pages list, empty state

- `h1` **Status pages**, breadcrumb chip `/`, primary **Create status page**.
- Empty card: **Introduction to status pages** (16/600), "Communicate incidents to your customers." (14/400), duration "3 minutes".
- Same onboarding card as the monitors empty state below it.

## Who's on-call (`…/oncalls`)

- **Please upgrade your account** banner first: "Right now everyone on your team gets notified in case of an incident. Invite colleagues and upgrade your account to schedule on-call duties." with **Configure on-call schedule** primary and **View documentation** link.
- Card **Get started with on-call** with "2 out of 2 steps left": step **Invite colleagues** → Invite colleagues button.
- Section **Who's currently on-call?** — "Schedule a primary responder so we alert one person before the entire team." + **Configure on-call schedule**.

## Escalation policies (`…/policies`)

- Centered empty state: **Create your first escalation policy** (16/600), "Configure detailed escalation rules and fallbacks to keep everyone in the loop.", primary **Create escalation policy**.

## 404 page

Plain centered page: `404` large, **Page not found**, explanatory paragraph, links Terms of Use · Privacy Policy · GDPR. Uses the marketing site shell, not the workspace shell.

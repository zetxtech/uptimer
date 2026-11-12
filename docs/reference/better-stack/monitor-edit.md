# Better Stack: monitor edit (Configure)

Captured 2026-11-13 at `…/team/t132878/monitors/2498052/edit`. Read-only.

## Differences from Create monitor

- No page `h1` "Create monitor". The header is the monitor name (28/600) followed by a text action strip: **Send test alert**, **Pause**, **Remove** (14/400 muted, no borders).
- The two main sections are identical to Create monitor: "What should we monitor?" and "How should we escalate incidents?" with the same fields, option order and copy. The only copy difference is the keyword recommendation line: "Upgrade your account to enable more options." (no "We recommend…" sentence on edit).
- The primary action is **Save changes** (40 px, radius 8, fill `#5b63d3`), placed at the bottom of the form column.
- **Advanced settings** and **Metadata** are collapsed by default; values are already populated.

## Advanced settings on edit

Same section order and copy as create:

Pronounceable monitor name · Recovery period / Confirmation period · Check frequency / IP version · SSL & domain verification (SSL/TLS verification, SSL expiration, expiration alert recipient, Domain expiration) · Request parameters · Request headers · HTTP authentication · Maintenance · Regions · GitHub badge.

- **Maintenance** still renders as heading + "We'll ignore all incidents during the daily recurring maintenance window." with no controls in this account.
- **GitHub badge** now shows the live badge instead of the "Available after you create the monitor" note: "Embed this badge at the top of README.md in your GitHub repository." with three **Copy** actions (badge image, Markdown, HTML variants).

## Metadata panel

Heading **Metadata**, description "Attach custom key-value pairs to incidents for more granular escalation rules and reporting.", link **Read the documentation**. In this account the panel shows no rows and no add button until an entry exists.

## Notes for the Uptimer port

- Edit is the same two-card form as create with a different action row at the top and a single "Save changes" at the bottom; it is not a settings sidebar layout.
- All destructive or immediate actions (test alert, pause, remove) are plain text, not buttons with fills.

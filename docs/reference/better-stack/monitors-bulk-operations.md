# Better Stack: monitor bulk operations

Captured from the signed-in Better Stack browser session on 2026-11-12. This is a partial capture, not a complete visual specification. No changes were saved to the reference account.

## Selection mode

The group header's ellipsis menu contains **Select** and **Select all**. Choosing Select enters selection mode; choosing a monitor then reveals a bottom floating toolbar showing the selected count, **Create group**, **Pause**, an ellipsis button, and a close button. Closing the toolbar exits selection mode. Monitors use a 16 px square selection indicator in place of their ordinary status marker; a selected row has a lightly tinted background.

## Bulk action menu

The toolbar ellipsis opens a menu with individual actions, in this order:

1. Configure on-call escalation
2. Configure recovery period
3. Configure check frequency
4. Configure confirmation period
5. Configure response timeout (disabled in the observed selection)
6. Configure Playwright scenario timeout (disabled in the observed selection)
7. Configure IP version
8. Configure domain expiration
9. Configure SSL verification
10. Configure expiration alerts
11. Configure request parameters
12. Configure request headers
13. Configure HTTP authentication
14. Configure maintenance
15. Configure regions
16. Configure metadata
17. Separator, then Remove

At the observed viewport, each menu item measured approximately 340 × 32.6 px. Which entries are enabled can depend on the selection; this was not exhaustively tested.

## Configuration dialogs

Each inspected action opens its own centered dialog rather than a generic bulk edit form. The dialog has a translucent full-screen backdrop and an independently scrollable body, `max-width: 612px`, 16 px outer horizontal margin, a bordered and shadowed rounded panel, a padded header with a close icon, and a footer containing **Cancel** and **Save**. Header padding is 20 px horizontally and 16 px vertically; body padding is 20 px horizontally and 24 px vertically; footer padding is 8 px. Both footer buttons are 32 px high.

### Configure on-call escalation

The observed form selects **Notify the primary responder** and links to the primary on-call schedule. **Escalation policy** is present but disabled for this account. Notification options are Call, SMS, E-mail, Push notification and Critical alert; E-mail was checked, while Call, SMS and Push were disabled with upgrade links. The select **If the primary responder doesn't acknowledge the incident** defaults to **Leave unchanged**, with **Do nothing**, immediately alert all other team members, and alert all other team members within 3, 5 or 10 minutes. Availability and checked states may depend on the account and selected monitors.

### Configure recovery period

The dialog contains a **Recovery period** select and explanatory text: “How long the monitor must be up to automatically mark an incident as resolved.” Options are **Leave unchanged** (default), Immediate recovery, 1 minute, 3 minutes, 5 minutes, 15 minutes, 30 minutes, 1 hour, and 2 hours.

### Configure check frequency

The **Check frequency** select defaults to **Leave unchanged**. Options are 30 seconds, 45 seconds, 1, 2, 3, 5, 10, 15 and 30 minutes. The first four were disabled for the observed account. Help reads “How often should we check your monitor?”

### Configure confirmation period

The **Confirmation period** select defaults to **Leave unchanged**. Options are Immediate start, 5, 10, 15 and 30 seconds, 1, 2, 3, 5, 10, 15 and 30 minutes, and **Other**. Selecting Other reveals a number input labeled **Confirmation period in seconds** followed by “seconds”. Help reads “How long to wait after observing a failure before we start a new incident.”

### Configure request parameters

The body has a two-column row: **HTTP method used to make the request** and **Request timeout**. Both default to **Leave unchanged**. Method options are HEAD, GET, POST, PATCH, PUT and OPTIONS. Timeout options are 3 minutes, 2 minutes, 1.5 minutes, 1 minute, 45 seconds, 30 seconds, 15 seconds, 10 seconds, 5 seconds, 3 seconds and 2 seconds. Timeout help reads “This includes both open and read timeout.”

Below are a multiline **Request body for POST, PUT, and PATCH requests** field, help describing `{timestamp}` cache busting, and side-by-side **Follow redirects** and **Keep cookies when redirecting** checkboxes. The observed checkboxes were checked.

### Configure IP version

The **Internet Protocol (IP) version** select defaults to **Leave unchanged**. Its other options are **Both IPv4 and IPv6**, **IPv4 only**, and **IPv6 only**.

### Configure domain expiration

The **Domain expiration** select defaults to **Leave unchanged**. The next option is **Don't check for domain expiration**. The remaining options are alerts 1, 2, 3, 7, or 14 days, or 1 or 2 months before expiration. In the observed account, those alert options were disabled and marked “upgrade to use”; a link below says “Upgrade your account to check for domain expiration.”

### Configure SSL verification

The dialog contains two selects. **SSL/TLS verification** defaults to **Leave unchanged**, with **On** and **Off** alternatives; its help asks “Should we check your security certificates?” **SSL expiration** defaults to **Leave unchanged**, offers **Don't check for SSL expiration**, and has the same alert thresholds and observed upgrade restrictions as domain expiration. A link below says “Upgrade your account to check for SSL expiration.”

### Configure expiration alerts

The select labeled **How should we alert you about expiration?** defaults to **Leave unchanged**; the only other option visible for this account was **E-mail entire team**. Available recipients may depend on account configuration.

### Configure request headers

The observed initial form has empty **Header name** and **Header value** text fields. The effect of saving or adding multiple headers was not tested.

### Configure HTTP authentication

The form contains **Basic HTTP authentication username** and **Basic HTTP authentication password** fields. The help beneath the password reads “We store it in an encrypted form.”

### Configure maintenance

The form shows **Maintenance window between** with two time inputs, a timezone selector and current time in that timezone, a **team wide maintenance** link, and weekday controls from **Mon** to **Sun**. Saving and the behavior of individual weekday controls were not tested.

### Configure regions

Four checkboxes are displayed in two rows: **Europe**, **North America**, **Asia**, and **Australia**. All four were checked in the observed selection; this is an observed state, not necessarily the default for every selection.

### Configure metadata

The form warns: **Bulk editing will overwrite existing metadata.** It exposes two editable combobox inputs in the observed initial state. Their selection and save behavior were not tested.

## Capture limitations

The remaining dialogs, pages, motion and error states still need to be inspected and recorded as text. The desktop browser disconnected during collection; no changes were saved to the reference account. Measurements above are specific to the observed viewport and are not a responsive specification.

## Live verification (2026-11-13, `/monitors?group_id=0`)

- Selection bar: 377 × 32 at the bottom of the viewport, controls 32 px tall: `10 selected`, **Create group** (131 px), **Pause** (105 px), ellipsis (32 px).
- Ellipsis menu: **350 × 633**, radius 6, fill `rgb(34, 40, 56)`, every row 33 px tall at 13 px; exactly the 16 `Configure …` entries listed above followed by **Remove**, with no "resume/enable" or generic "Edit" entry.
- Dialog frame: `relative rounded-lg overflow-hidden grow max-w-[612px] mx-4`, measured 581 wide, radius 12, fill `rgb(34, 40, 56)`; header `px-5 py-4 bg-elevation-3` (46 px, 14 px medium label), body `px-5 py-6 border-y border-elevation-4 max-h-[80vh] overflow-y-auto`, footer `p-2 flex justify-end gap-2` (46 px).
- Footer buttons: **Cancel** 68 × 30 (fill `rgb(41, 48, 64)`), **Save** 55 × 30 (fill `rgb(91, 99, 211)`), both radius 8 / 14 px / 500; close button 23 px, radius 6.
- **Configure check frequency** dialog measured 581 × 219: one full-width select (Leave unchanged, 30 s, 45 s, 1, 2, 3, 5, 10, 15, 30 minutes) plus help "How often should we check your monitor?".
- **Configure request parameters** dialog measured 581 × 413: two 261 × 34 selects side by side (method, timeout), textarea 542 × 82, two 15 px checkboxes (Follow redirects, Keep cookies when redirecting).

# Better Stack: design tokens (dark theme)

Read from the live stylesheet on 2026-11-13 via `getComputedStyle(document.documentElement)`.

## Typography

- Family: `Inter, "SF Pro Text", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif`.
- Base: 14 px / 1.55 (21.7 px line box), color `#939db8` on the workspace surfaces.
- Scale in use: 11, 12, 13, 14, 16, 20, 28 px. Headings 28/600 (page), 16/600 (section), 14/600 (card title), 13/600 (list row title). Values inside summary cards are 20/600. Labels are 12/500. Body copy is 13–14/400.

## Neutral ramp

| Token | Hex |
| --- | --- |
| neutral-20 | `#f9fafb` |
| neutral-30 | `#f8f9fc` |
| neutral-40 | `#f4f5f8` |
| neutral-50 | `#eaecf1` |
| neutral-60 | `#dfe3ea` |
| neutral-70 | `#dfe3ea` |
| neutral-80 | `#d5d9e3` |
| neutral-100 | `#b8bfd1` |
| neutral-200 | `#939db8` |
| neutral-300 | `#646e87` |
| neutral-400 | `#4e576e` |
| neutral-500 | `#3b4254` |
| neutral-600 | `#2f3647` |
| neutral-700 | `#293040` |
| neutral-800 | `#222838` |
| neutral-900 | `#121826` |

## Surfaces (elevation)

| Token | Hex | Used for |
| --- | --- | --- |
| page canvas | `#1f2433` | `html` background |
| elevation-1 | `#1f2433` | app shell |
| elevation-2 | `#222838` | cards, inputs, table surfaces |
| elevation-3 | `#293040` | secondary buttons, segmented controls |
| elevation-4 | `#2f3647` | hover fill, tertiary buttons, borders on hover |

Sidebar is `#222838`; content column sits on the canvas `#1f2433`; cards are `#222838` with 1 px `#2f3647` border.

## Brand colors

| Token | Hex |
| --- | --- |
| primary-60 | `#f6f8fe` |
| primary-70 | `#e3ebfd` |
| primary-80 | `#beccfb` |
| primary-90 | `#98a4f7` |
| primary-100 | `#7c87f7` |
| primary-200 | `#5b63d3` |
| primary-300 | `#4449a9` |
| red-60 | `#fff6f4` |
| red-90 | `#ed8b92` |
| red-100 | `#e0687d` |
| red-200 | `#c03a5a` |
| red-300 | `#982542` |
| red-400 | `#6c1e30` |
| red-500 | `#511522` |
| green-90 | `#64c28d` |
| green-100 | `#00af79` |
| green-200 | `#00885d` |
| yellow-90 | `#dd9c51` |
| yellow-100 | `#d57b16` |
| orange-90 | `#ec9070` |
| orange-100 | `#e56a4e` |
| blue-90 | `#4bb9e8` |
| blue-100 | `#009fe3` |
| cyan-100 | `#55bfc1` |
| violet-100 | `#a579e9` |

Usage observed: primary button fill `#5b63d3`; links and completed-step titles `#7c87f7`; "Ongoing" incident text `#e0687d`; error banner `bg-brand-red-100/10` + `border-brand-red-100/10`; destructive button fill `#e0687d`.

## Radii and shadows

- 4 px: chips/badges (`rounded-[4px]`), small pagination buttons 6 px.
- 8 px: inputs, selects, buttons, menu items, integration cards.
- 12 px: section cards, dialogs, banners.
- 9999 px: pills, avatars.
- Cards: `shadow-2xs` (very light), dark theme adds a 1 px `#2f3647` border instead of a stronger shadow.

## Layout constants

- Workspace top bar: 52 px tall.
- Sidebar: 52 px collapsed rail, 272 px expanded; nav items 36 px tall, 8 px radius, 16 px icons; active item filled `#293040` with a 2 × 15 px `#7c87f7` indicator on the left edge.
- Content `main`: `mx-auto px-5 pt-20 pb-8 max-w-[1040px]`, i.e. 80 px top padding, 20 px side padding.
- Section rhythm: 40 px between sections, 60 px in settings pages.
- Field pitch: label → control 6 px; control → help 10 px; group → next label ~53 px.

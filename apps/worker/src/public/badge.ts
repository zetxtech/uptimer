/**
 * Shields.io-style SVG status badge, meant to be embedded in a README or any Markdown page:
 *
 *   [![Uptimer](https://uptimer.example.com/api/v1/public/badge/42.svg)](https://uptimer.example.com/)
 *
 * The badge reuses the monitor's public status-page visibility, so hidden monitors stay hidden.
 */

const STATUS_BG: Record<string, string> = {
  up: '#2f9e44',
  down: '#d64545',
  unknown: '#8a8f9c',
  maintenance: '#2f7fc1',
  paused: '#b7791f',
};

const STATUS_LABEL: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  unknown: 'Unknown',
  maintenance: 'Maintenance',
  paused: 'Paused',
};

const LABEL_BG = '#4a4f5c';
const URI_BG = '#2b2f38';
const HEIGHT = 20;
const FONT_SIZE = 11;
const CHAR_WIDTH = 6.2;
const PADDING = 6;
const MAX_NAME_CHARS = 26;

/** Escapes the five XML entities that can appear in text content. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function textWidth(value: string): number {
  return Math.max(6, Math.round(value.length * CHAR_WIDTH + PADDING * 2));
}

export type BadgeSegment = { text: string; background: string; color?: string };

export function renderStatusBadgeSvg(segments: BadgeSegment[], title: string): string {
  const widths = segments.map((segment) => textWidth(segment.text));
  const totalWidth = widths.reduce((sum, width) => sum + width, 0);

  let offset = 0;
  const rects: string[] = [];
  const labels: string[] = [];

  segments.forEach((segment, index) => {
    const width = widths[index]!;
    rects.push(
      `<rect x="${offset}" y="0" width="${width}" height="${HEIGHT}" fill="${segment.background}"/>`,
    );
    labels.push(
      `<text x="${offset + width / 2}" y="14" fill="${segment.color ?? '#ffffff'}" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" font-size="${FONT_SIZE}">${escapeXml(
        segment.text,
      )}</text>`,
    );
    offset += width;
  });

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${totalWidth}" height="${HEIGHT}" role="img" aria-label="${escapeXml(
      title,
    )}">`,
    `<title>${escapeXml(title)}</title>`,
    `<clipPath id="r"><rect width="${totalWidth}" height="${HEIGHT}" rx="3"/></clipPath>`,
    '<g clip-path="url(#r)">',
    ...rects,
    ...labels,
    '</g>',
    '</svg>',
  ].join('');
}

export function statusBadgeSegments(args: {
  name: string;
  status: string;
  uptimePct: number | null;
}): BadgeSegment[] {
  const name =
    args.name.length > MAX_NAME_CHARS ? `${args.name.slice(0, MAX_NAME_CHARS - 1)}…` : args.name;
  const segments: BadgeSegment[] = [
    { text: name.length > 0 ? name : 'uptime', background: LABEL_BG },
    {
      text: STATUS_LABEL[args.status] ?? args.status,
      background: STATUS_BG[args.status] ?? STATUS_BG.unknown!,
    },
  ];

  if (args.uptimePct !== null) {
    segments.push({
      text: `${args.uptimePct.toFixed(2)}%`,
      background: URI_BG,
    });
  }

  return segments;
}

import { describe, expect, it } from 'vitest';

import { escapeXml, renderStatusBadgeSvg, statusBadgeSegments } from '../src/public/badge';

describe('public/badge', () => {
  it('escapes XML special characters', () => {
    expect(escapeXml(`<a & "b" 'c'>`)).toBe('&lt;a &amp; &quot;b&quot; &apos;c&apos;&gt;');
  });

  it('renders three segments with the uptime when available', () => {
    const svg = renderStatusBadgeSvg(
      statusBadgeSegments({ name: 'API', status: 'up', uptimePct: 99.912 }),
      'API: up',
    );

    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('<title>API: up</title>');
    expect(svg).toContain('>API</text>');
    expect(svg).toContain('>Up</text>');
    expect(svg).toContain('>99.91%</text>');
    expect(svg).toContain('#2f9e44');
  });

  it('maps every status to its own colour and label', () => {
    const expectations: Array<[string, string]> = [
      ['down', 'Down'],
      ['unknown', 'Unknown'],
      ['maintenance', 'Maintenance'],
      ['paused', 'Paused'],
    ];

    for (const [status, label] of expectations) {
      const svg = renderStatusBadgeSvg(
        statusBadgeSegments({ name: 'API', status, uptimePct: null }),
        `API: ${status}`,
      );
      expect(svg).toContain(`>${label}</text>`);
      expect(svg).not.toContain('%');
    }
  });

  it('truncates long monitor names and falls back to "uptime" when empty', () => {
    const long = renderStatusBadgeSvg(
      statusBadgeSegments({
        name: 'very-long-monitor-name-that-overflows',
        status: 'up',
        uptimePct: null,
      }),
      'x',
    );
    expect(long).toContain('…');
    expect(long).not.toContain('overflows');

    const empty = renderStatusBadgeSvg(
      statusBadgeSegments({ name: '', status: 'up', uptimePct: null }),
      'x',
    );
    expect(empty).toContain('>uptime</text>');
  });

  it('escapes the monitor name inside the SVG', () => {
    const svg = renderStatusBadgeSvg(
      statusBadgeSegments({ name: 'a&b<c', status: 'up', uptimePct: null }),
      'title',
    );
    expect(svg).toContain('a&amp;b&lt;c');
    expect(svg).not.toContain('a&b<c');
  });
});

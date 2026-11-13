const DEFAULT_ADMIN_PATH = '/admin';

function normalizeAdminPath(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_ADMIN_PATH;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_ADMIN_PATH;

  // Accept either "/admin" or "admin".
  let path = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;

  // Strip query/hash if someone accidentally passes a full URL-ish value.
  try {
    path = new URL(path, 'https://example.com').pathname;
  } catch {
    return DEFAULT_ADMIN_PATH;
  }

  // Avoid routing the entire app under "/".
  if (path === '/' || path === '') return DEFAULT_ADMIN_PATH;

  // Trim trailing slash for consistent route building.
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);

  return path;
}

// Build-time configurable admin path.
//
// Example (Cloudflare Pages env var): VITE_ADMIN_PATH=/37dh3hi2
export const ADMIN_PATH = normalizeAdminPath(import.meta.env.VITE_ADMIN_PATH);
export const ADMIN_LOGIN_PATH = `${ADMIN_PATH}/login`;
export const ADMIN_ANALYTICS_PATH = `${ADMIN_PATH}/analytics`;
export const ADMIN_PROBES_PATH = `${ADMIN_PATH}/probes`;
export const ADMIN_EVENTS_PATH = `${ADMIN_PATH}/events`;
export const ADMIN_HEARTBEATS_PATH = `${ADMIN_PATH}/heartbeats`;
export const ADMIN_REPORTING_PATH = `${ADMIN_PATH}/reporting`;
export const ADMIN_MONITOR_DETAIL_ROUTE = `${ADMIN_PATH}/monitors/:id`;
export const ADMIN_INCIDENT_DETAIL_ROUTE = `${ADMIN_PATH}/incidents/:id`;
export const ADMIN_EVENT_DETAIL_ROUTE = `${ADMIN_PATH}/events/:id`;

export function adminMonitorDetailPath(monitorId: number): string {
  return `${ADMIN_PATH}/monitors/${monitorId}`;
}

export function adminIncidentDetailPath(incidentId: number): string {
  return `${ADMIN_PATH}/incidents/${incidentId}`;
}

export function adminEventDetailPath(eventId: number): string {
  return `${ADMIN_PATH}/events/${eventId}`;
}

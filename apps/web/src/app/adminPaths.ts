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

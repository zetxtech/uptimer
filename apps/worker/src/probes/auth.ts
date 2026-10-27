import type { ProbeKind, ProbeScope } from '@uptimer/db/schema';

export type AuthenticatedProbe = {
  id: string;
  name: string;
  kind: ProbeKind;
  scope: ProbeScope;
  region: string;
  isRequired: boolean;
  configVersion: number;
};

type ProbeAuthRow = {
  id: string;
  name: string;
  kind: ProbeKind;
  scope: ProbeScope;
  region: string;
  is_required: number | boolean;
  config_version: number;
};

const AUTH_PROBE_SQL = `
  SELECT id, name, kind, scope, region, is_required, config_version
  FROM probes
  WHERE token_sha256 = ?1 AND is_enabled = 1
  LIMIT 1
`;

const authProbeStatementByDb = new WeakMap<D1Database, D1PreparedStatement>();

export function readBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const bytes = new Uint8Array(digest);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}

/**
 * Resolves the calling probe from its bearer token.
 *
 * The token is hashed before lookup so the database never stores a usable credential, and
 * the lookup itself is an equality match on the hash (no secret comparison in application code).
 */
export async function authenticateProbe(
  db: D1Database,
  request: Request,
): Promise<AuthenticatedProbe | null> {
  const token = readBearerToken(request.headers.get('authorization'));
  // Probe tokens are generated with 32 random bytes; reject obviously malformed values early.
  if (!token || token.length < 24 || token.length > 200) {
    return null;
  }

  const tokenSha256 = await sha256Hex(token);
  const cached = authProbeStatementByDb.get(db);
  const statement = cached ?? db.prepare(AUTH_PROBE_SQL);
  if (!cached) {
    authProbeStatementByDb.set(db, statement);
  }

  const row = await statement.bind(tokenSha256).first<ProbeAuthRow>();
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    scope: row.scope,
    region: row.region,
    isRequired: row.is_required === 1 || row.is_required === true,
    configVersion: row.config_version,
  };
}

export function generateProbeToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  const base64Url = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/u, '');
  return `upt_probe_${base64Url}`;
}

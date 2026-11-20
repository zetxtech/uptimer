import type { Env } from '../env';

export interface ScreenshotRow {
  outageId: number;
  contentType: string;
  width: number | null;
  height: number | null;
  bytes: Uint8Array | null;
  capturedAt: number;
}

/**
 * D1 hands BLOBs back as ArrayBuffer on the deployed runtime and as a numeric
 * array through the local driver, so normalise both into one shape.
 */
function toBytes(value: unknown): Uint8Array | null {
  if (!value) return null;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (Array.isArray(value)) return Uint8Array.from(value as number[]);
  if (typeof value === 'string') {
    const binary = atob(value);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
    return out;
  }
  return null;
}

export interface CaptureOptions {
  outageId: number;
  target: string;
  /** Overridable for tests; defaults to the real Browser Rendering launcher. */
  launcher?: BrowserLauncher;
}

export type BrowserLauncher = (binding: unknown) => Promise<BrowserSession>;

export interface BrowserSession {
  newPage: () => Promise<BrowserPage>;
  close: () => Promise<void>;
}

export interface BrowserPage {
  setViewport: (viewport: { width: number; height: number }) => Promise<void>;
  goto: (url: string, options?: { waitUntil?: string; timeout?: number }) => Promise<unknown>;
  screenshot: (options: { type: 'jpeg'; quality: number }) => Promise<Uint8Array>;
}

const VIEWPORT = { width: 1280, height: 800 };
const NAVIGATION_TIMEOUT_MS = 20_000;

/** Records the attempt so a failing target is not re-rendered on every cron tick. */
export async function markScreenshotAttempt(env: Env, outageId: number): Promise<void> {
  await env.DB.prepare(
    `
      INSERT INTO outage_screenshots (outage_id, content_type, width, height, bytes, captured_at)
      VALUES (?1, 'image/jpeg', NULL, NULL, NULL, ?2)
      ON CONFLICT(outage_id) DO NOTHING
    `,
  )
    .bind(outageId, Math.floor(Date.now() / 1000))
    .run();
}

async function defaultLauncher(binding: unknown): Promise<BrowserSession> {
  const puppeteer = await import('@cloudflare/puppeteer');
  return (await puppeteer.launch(binding as never)) as unknown as BrowserSession;
}

/**
 * Renders the monitor target with Cloudflare Browser Rendering and stores the
 * image next to the outage. Returns the stored row, or null when the binding is
 * missing, the page cannot be rendered, or the target is not a web page.
 */
export async function captureOutageScreenshot(
  env: Env,
  options: CaptureOptions,
): Promise<ScreenshotRow | null> {
  const binding = (env as { BROWSER?: unknown }).BROWSER;
  if (!binding) return null;

  let session: BrowserSession | null = null;
  try {
    session = await (options.launcher ?? defaultLauncher)(binding);
    const page = await session.newPage();
    await page.setViewport(VIEWPORT);
    await page
      .goto(options.target, { waitUntil: 'networkidle0', timeout: NAVIGATION_TIMEOUT_MS })
      .catch(() => undefined);
    const bytes = await page.screenshot({ type: 'jpeg', quality: 70 });
    const capturedAt = Math.floor(Date.now() / 1000);

    await env.DB.prepare(
      `
        INSERT INTO outage_screenshots (outage_id, content_type, width, height, bytes, captured_at)
        VALUES (?1, 'image/jpeg', ?2, ?3, ?4, ?5)
        ON CONFLICT(outage_id) DO UPDATE SET
          content_type = excluded.content_type,
          width = excluded.width,
          height = excluded.height,
          bytes = excluded.bytes,
          captured_at = excluded.captured_at
      `,
    )
      .bind(options.outageId, VIEWPORT.width, VIEWPORT.height, bytes, capturedAt)
      .run();

    return {
      outageId: options.outageId,
      contentType: 'image/jpeg',
      width: VIEWPORT.width,
      height: VIEWPORT.height,
      bytes: toBytes(bytes),
      capturedAt,
    };
  } catch {
    return null;
  } finally {
    await session?.close().catch(() => undefined);
  }
}

export async function loadOutageScreenshot(
  env: Env,
  outageId: number,
): Promise<ScreenshotRow | null> {
  const row = await env.DB.prepare(
    `
      SELECT outage_id, content_type, width, height, bytes, captured_at
      FROM outage_screenshots
      WHERE outage_id = ?1
    `,
  )
    .bind(outageId)
    .first<{
      outage_id: number;
      content_type: string;
      width: number | null;
      height: number | null;
      bytes: unknown;
      captured_at: number;
    }>();

  if (!row) return null;
  return {
    outageId: row.outage_id,
    contentType: row.content_type,
    width: row.width,
    height: row.height,
    bytes: toBytes(row.bytes),
    capturedAt: row.captured_at,
  };
}

/** Open outages that have never been rendered; the cron tick captures one per run. */
export async function findOutageAwaitingScreenshot(
  env: Env,
): Promise<{ outageId: number; target: string } | null> {
  const row = await env.DB.prepare(
    `
      SELECT o.id AS outage_id, m.target AS target
      FROM outages o
      INNER JOIN monitors m ON m.id = o.monitor_id
      LEFT JOIN outage_screenshots s ON s.outage_id = o.id
      WHERE o.ended_at IS NULL
        AND m.type = 'http'
        AND s.outage_id IS NULL
      ORDER BY o.started_at ASC
      LIMIT 1
    `,
  ).first<{ outage_id: number; target: string }>();

  return row ? { outageId: row.outage_id, target: row.target } : null;
}

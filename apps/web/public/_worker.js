// The worker refreshes the status snapshot every 5 minutes; keep the preloaded HTML cacheable
// within that same budget.
const SNAPSHOT_MAX_AGE_SECONDS = 5 * 60;
const PREFERRED_MAX_AGE_SECONDS = 30;

function acceptsHtml(request) {
  const accept = request.headers.get('Accept') || '';
  return accept.includes('text/html');
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function safeJsonForInlineScript(value) {
  // Prevent breaking out of <script> tags via `</script>`.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

function normalizeSnapshotText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function computeCacheControl(ageSeconds) {
  const remaining = Math.max(0, SNAPSHOT_MAX_AGE_SECONDS - ageSeconds);
  const maxAge = Math.min(PREFERRED_MAX_AGE_SECONDS, remaining);
  const stale = Math.max(0, remaining - maxAge);
  return `public, max-age=${maxAge}, stale-while-revalidate=${stale}, stale-if-error=${stale}`;
}

function formatTime(tsSec) {
  try {
    return new Date(tsSec * 1000).toLocaleString();
  } catch {
    return '';
  }
}

function statusDotClass(status) {
  switch (status) {
    case 'up':
      return 'bg-emerald-500 dark:bg-emerald-400';
    case 'down':
      return 'bg-red-500 dark:bg-red-400';
    case 'maintenance':
      return 'bg-blue-500 dark:bg-blue-400';
    case 'paused':
      return 'bg-amber-500 dark:bg-amber-400';
    default:
      return 'bg-slate-400 dark:bg-slate-500';
  }
}

function statusBadgeClass(status) {
  switch (status) {
    case 'up':
      return 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20';
    case 'down':
      return 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20';
    case 'maintenance':
      return 'bg-blue-50 text-blue-700 ring-blue-600/20 dark:bg-blue-500/10 dark:text-blue-400 dark:ring-blue-400/20';
    case 'paused':
      return 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20';
    default:
      return 'bg-slate-50 text-slate-600 ring-slate-500/20 dark:bg-slate-500/10 dark:text-slate-400 dark:ring-slate-400/20';
  }
}

function upsertHeadTag(html, pattern, tag) {
  if (pattern.test(html)) {
    return html.replace(pattern, tag);
  }
  return html.replace('</head>', `  ${tag}\n</head>`);
}

function injectStatusMetaTags(html, snapshot, url) {
  const siteTitle = normalizeSnapshotText(snapshot?.site_title, 'Uptimer');
  const fallbackDescription = normalizeSnapshotText(
    snapshot?.banner?.title,
    'Real-time status and incident updates.',
  );
  const siteDescription = normalizeSnapshotText(snapshot?.site_description, fallbackDescription)
    .replace(/\s+/g, ' ')
    .trim();
  const pageUrl = new URL('/', url).toString();

  const escapedTitle = escapeHtml(siteTitle);
  const escapedDescription = escapeHtml(siteDescription);
  const escapedUrl = escapeHtml(pageUrl);

  let injected = html;
  injected = upsertHeadTag(injected, /<title>[^<]*<\/title>/i, `<title>${escapedTitle}</title>`);
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+name=["']description["'][^>]*>/i,
    `<meta name="description" content="${escapedDescription}" />`,
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+property=["']og:type["'][^>]*>/i,
    '<meta property="og:type" content="website" />',
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+property=["']og:title["'][^>]*>/i,
    `<meta property="og:title" content="${escapedTitle}" />`,
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+property=["']og:description["'][^>]*>/i,
    `<meta property="og:description" content="${escapedDescription}" />`,
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+property=["']og:site_name["'][^>]*>/i,
    `<meta property="og:site_name" content="${escapedTitle}" />`,
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+property=["']og:url["'][^>]*>/i,
    `<meta property="og:url" content="${escapedUrl}" />`,
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+name=["']twitter:card["'][^>]*>/i,
    '<meta name="twitter:card" content="summary" />',
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+name=["']twitter:title["'][^>]*>/i,
    `<meta name="twitter:title" content="${escapedTitle}" />`,
  );
  injected = upsertHeadTag(
    injected,
    /<meta[^>]+name=["']twitter:description["'][^>]*>/i,
    `<meta name="twitter:description" content="${escapedDescription}" />`,
  );

  return injected;
}

function renderPreload(snapshot) {
  const overall = typeof snapshot.overall_status === 'string' ? snapshot.overall_status : 'unknown';
  const siteTitle = typeof snapshot.site_title === 'string' ? snapshot.site_title : 'Uptimer';
  const bannerTitle =
    snapshot && snapshot.banner && typeof snapshot.banner.title === 'string'
      ? snapshot.banner.title
      : 'Status';
  const generatedAt =
    typeof snapshot.generated_at === 'number'
      ? snapshot.generated_at
      : Math.floor(Date.now() / 1000);

  const monitors = Array.isArray(snapshot.monitors) ? snapshot.monitors : [];

  const monitorCards = monitors
    .map((m) => {
      const id = typeof m.id === 'number' ? m.id : 0;
      const name = escapeHtml(m.name ?? `#${id}`);
      const type = escapeHtml(m.type ?? '');
      const status = typeof m.status === 'string' ? m.status : 'unknown';
      const lastCheckedAt = typeof m.last_checked_at === 'number' ? m.last_checked_at : null;

      const lastChecked = lastCheckedAt
        ? `Last checked: ${escapeHtml(formatTime(lastCheckedAt))}`
        : 'Never checked';

      return `
        <div class="bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-soft dark:shadow-none p-4">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2.5 min-w-0">
              <span class="relative flex h-2.5 w-2.5"><span class="relative inline-flex h-2.5 w-2.5 rounded-full ${statusDotClass(
                status,
              )}"></span></span>
              <div class="min-w-0">
                <div class="font-semibold text-slate-900 dark:text-slate-100 truncate">${name}</div>
                <div class="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wide">${type}</div>
              </div>
            </div>
            <span class="inline-flex items-center rounded-full font-medium ring-1 ring-inset px-2 py-0.5 text-xs ${statusBadgeClass(
              status,
            )}">${escapeHtml(status)}</span>
          </div>
          <div class="text-xs text-slate-400 dark:text-slate-500">${lastChecked}</div>
        </div>
      `;
    })
    .join('');

  return `
    <div class="min-h-screen bg-slate-50 dark:bg-slate-900">
      <header class="bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700">
        <div class="max-w-5xl mx-auto px-4 py-4 flex justify-between items-center">
          <div class="text-lg font-bold text-slate-900 dark:text-slate-100">${escapeHtml(siteTitle)}</div>
          <span class="inline-flex items-center rounded-full font-medium ring-1 ring-inset px-2.5 py-1 text-sm ${statusBadgeClass(
            overall,
          )}">${escapeHtml(overall)}</span>
        </div>
      </header>

      <main class="max-w-5xl mx-auto px-4 py-6">
        <div class="rounded-2xl p-5 border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-soft dark:shadow-none mb-6">
          <div class="text-sm text-slate-500 dark:text-slate-300">${escapeHtml(bannerTitle)}</div>
          <div class="text-xs text-slate-400 dark:text-slate-500 mt-1">Updated: ${escapeHtml(formatTime(generatedAt))}</div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">${monitorCards}</div>
      </main>
    </div>
  `;
}

async function fetchIndexHtml(env, url) {
  const indexUrl = new URL('/index.html', url);

  // Do not pass the original navigation request as init. In Pages runtime the
  // navigation request can carry redirect mode = manual; if we forward that
  // into `env.ASSETS.fetch`, we might accidentally return a redirect response
  // (and cache it), causing ERR_TOO_MANY_REDIRECTS.
  const req = new Request(indexUrl.toString(), {
    method: 'GET',
    headers: { Accept: 'text/html' },
    redirect: 'follow',
  });

  return env.ASSETS.fetch(req);
}

async function fetchPublicStatusSnapshot(env) {
  const apiOrigin = env.UPTIMER_API_ORIGIN;
  if (typeof apiOrigin !== 'string' || apiOrigin.length === 0) return null;

  const statusUrl = new URL('/api/v1/public/status', apiOrigin);

  // Keep HTML fast: if the API is slow, fall back to a static HTML shell.
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 800);

  try {
    const resp = await fetch(statusUrl.toString(), {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data || typeof data !== 'object') return null;

    return data;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // HTML requests: serve SPA entry for client-side routes.
    const wantsHtml = request.method === 'GET' && acceptsHtml(request);

    // Special-case the status page for HTML injection.
    const isStatusPage = url.pathname === '/' || url.pathname === '/index.html';
    if (wantsHtml && isStatusPage) {
      const cacheKey = new Request(url.origin + '/', { method: 'GET' });
      const cached = await caches.default.match(cacheKey);
      if (cached) return cached;

      const base = await fetchIndexHtml(env, url);
      const html = await base.text();

      const snapshot = await fetchPublicStatusSnapshot(env);
      if (!snapshot) {
        const headers = new Headers(base.headers);
        headers.set('Content-Type', 'text/html; charset=utf-8');
        headers.append('Vary', 'Accept');
        headers.delete('Location');

        return new Response(html, { status: 200, headers });
      }

      const now = Math.floor(Date.now() / 1000);
      const generatedAt = typeof snapshot.generated_at === 'number' ? snapshot.generated_at : now;
      const age = Math.max(0, now - generatedAt);

      let injected = html.replace(
        '<div id="root"></div>',
        `<div id="uptimer-preload">${renderPreload(snapshot)}</div><div id="root"></div>`,
      );

      injected = injectStatusMetaTags(injected, snapshot, url);

      injected = injected.replace(
        '</head>',
        `  <script>globalThis.__UPTIMER_INITIAL_STATUS__=${safeJsonForInlineScript(snapshot)};</script>\n</head>`,
      );

      const headers = new Headers(base.headers);
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.set('Cache-Control', computeCacheControl(age));
      headers.append('Vary', 'Accept');
      headers.delete('Location');

      const resp = new Response(injected, { status: 200, headers });

      ctx.waitUntil(caches.default.put(cacheKey, resp.clone()));
      return resp;
    }

    // Default: serve static assets.
    const assetResp = await env.ASSETS.fetch(request);

    // SPA fallback for client-side routes.
    if (wantsHtml && assetResp.status === 404) {
      const indexResp = await fetchIndexHtml(env, url);
      const html = await indexResp.text();

      const headers = new Headers(indexResp.headers);
      headers.set('Content-Type', 'text/html; charset=utf-8');
      headers.append('Vary', 'Accept');
      headers.delete('Location');

      return new Response(html, { status: 200, headers });
    }

    return assetResp;
  },
};

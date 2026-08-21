#!/usr/bin/env node
/**
 * One-shot diagnosis for "my published page shows Page not found".
 *
 *   node scripts/diagnose-page.js <slug> [site]
 *
 *   slug   exactly what the admin's Address column shows (raw, unencoded)
 *   site   optional: "local" (default) or "preview"
 *
 * Walks the exact chain a page visit uses, from the same places the app
 * itself calls them, and prints a verdict:
 *
 *   1. is the API up at all               (health)
 *   2. is the page in the published list  (GET /api/pages)
 *   3. does the by-slug lookup succeed    (GET /api/pages/slug/<slug>)
 *   4. does the storefront render it      (GET /p/<slug>)
 *   5. what the storefront actually shows ("Page not found" vs the
 *      temporary-error view vs the real content)
 *
 * Why each step exists: the admin LIST is fetched by the browser, while the
 * /p/<slug> lookup is made by the Next server process. Both ends must
 * agree, and this is the only way to see which one doesn't. Exit code 0 =
 * page healthy end to end, 1 = a problem was found and named.
 */
const http = require('http');

const SITES = {
  local: {
    api: process.env.API_URL || 'http://127.0.0.1:3001',
    web: process.env.WEB_URL || 'http://127.0.0.1:3000',
  },
  preview: {
    api: process.env.API_URL || 'http://127.0.0.1:3001',
    web: process.env.WEB_URL || 'http://127.0.0.1:3000',
  },
};

function get(url, { timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ ok: true, status: res.statusCode, body }));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, error: 'timed out' });
    });
    req.on('error', (err) => resolve({ ok: false, status: 0, error: err.code || err.message }));
  });
}

const label = (s) => s.replace(/\s+/g, ' ').trim().slice(0, 90);

async function main() {
  const slug = process.argv[2];
  const site = SITES[process.argv[3] || 'local'] || SITES.local;

  if (!slug) {
    console.error('usage: node scripts/diagnose-page.js <slug> [local|preview]');
    console.error('  <slug>  the exact value from Admin -> Pages -> Address (without /p/)');
    process.exit(1);
  }

  const enc = encodeURIComponent(slug);
  let problems = 0;
  const problem = (msg) => {
    problems++;
    console.log(`  ❌ ${msg}`);
  };
  const ok = (msg) => console.log(`  ✅ ${msg}`);

  // ---- 1. API health --------------------------------------------------
  console.log(`\n1. API at ${site.api}`);
  const health = await get(`${site.api}/health`);
  if (health.ok && health.status === 200) ok('API is up');
  else {
    problem(
      `API is NOT reachable (${health.error || `status ${health.status}`}). The web server ` +
        'cannot load pages even though your browser can still show the admin list. ' +
        'Restart the API (npm run dev) and check nothing else claims port 3001.'
    );
    console.log('\nVerdict: the API process is down or unreachable — that alone explains');
    console.log('every symptom. Fix that first, then re-run this script.');
    process.exit(1);
  }

  // ---- 2. published list ----------------------------------------------
  console.log('\n2. Published pages known to the API');
  const list = await get(`${site.api}/api/pages`);
  let inList = null;
  if (list.ok && list.status === 200) {
    try {
      const rows = JSON.parse(list.body).data || [];
      const row = rows.find((r) => r.slug === slug);
      inList = row || null;
      ok(`${rows.length} published page(s); ${row ? `"${slug}" is among them` : `"${slug}" is NOT among them`}`);
    } catch {
      problem('API answered but the response was not valid JSON');
    }
  } else {
    problem(`listing failed (${list.error || `status ${list.status}`})`);
  }

  // ---- 3. by-slug lookup (what /p/<slug> actually calls) ---------------
  console.log('\n3. By-slug lookup the storefront uses');
  const bySlug = await get(`${site.api}/api/pages/slug/${enc}`);
  if (bySlug.ok && bySlug.status === 200) {
    const title = (() => {
      try {
        return JSON.parse(bySlug.body).data.title;
      } catch {
        return '?';
      }
    })();
    ok(`200 — the API serves "${label(String(title))}" for this slug`);
  } else if (bySlug.ok && bySlug.status === 404) {
    problem(
      `the API itself answers 404 for this slug. ${
        inList
          ? 'It IS in the published list — two different databases are in play (two API processes or two dev.db files). Check for a second process on port 3001.'
          : 'The row is a draft or was saved under a different slug. In Admin -> Pages compare the Address column character by character with what you typed.'
      }`
    );
  } else {
    problem(`lookup failed (${bySlug.error || `status ${bySlug.status}`}) — an API error, not a missing page`);
  }

  // ---- 4 + 5. storefront ------------------------------------------------
  console.log('\n4. Storefront render');
  const page = await get(`${site.web}/p/${enc}`);

  // Visible HTML only. The RSC flight payload inside <script> tags embeds
  // the not-found boundary markup on EVERY streamed page ("Page not
  // found" included), so searching the raw body would cry wolf on healthy
  // pages. Stripping scripts leaves what the user actually sees.
  const visible = (page.body || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '');

  let pageTitle = null;
  try {
    pageTitle = JSON.parse(bySlug.body).data.title;
  } catch {
    /* unknown - fall back to marker-independent checks */
  }

  if (page.ok && page.status === 200) {
    if (pageTitle && visible.includes(pageTitle)) {
      ok('storefront returns 200 and renders the page content');
    } else if (visible.includes('could not be loaded')) {
      problem(
        'the storefront shows the TEMPORARY-ERROR view: the web server could not reach the ' +
          'API on its own (works from your browser, fails from the Next process). Typical on ' +
          'Docker, a proxy/VPN intercepting localhost, or NEXT_PUBLIC_API_URL pointing at an ' +
          'address only your browser can reach.'
      );
    } else if (visible.includes('Page not found')) {
      problem('the storefront renders its not-found view despite the checks above — copy this whole output and report it');
    } else {
      problem('storefront returned 200 but the page content is missing from the visible HTML');
    }
  } else if (page.ok && page.status === 404) {
    problem(`storefront answers a real 404 — the API told it the slug does not exist. ${
      bySlug.ok && bySlug.status === 200
        ? 'The API serves it but the WEB SERVER gets a 404 from ITS API call: the web process is talking to a different API than this script did (check NEXT_PUBLIC_API_URL in apps/web/.env.local).'
        : ''
    }`);
  } else {
    problem(`storefront failed (${page.error || `status ${page.status}`})`);
  }

  // ---- verdict -----------------------------------------------------------
  console.log('\n' + (problems === 0 ? '✅ Everything healthy — the page works end to end.' : `⚠️  ${problems} problem(s) found above.`));
  process.exit(problems === 0 ? 0 : 1);
}

main();

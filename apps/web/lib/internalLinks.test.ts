/**
 * Every hard-coded internal href must correspond to a real route.
 *
 * Regression this guards
 * ----------------------
 * ProductView rendered a trust badge linking to `/help`. Only `/help/<slug>`
 * exists (app/help/[slug]), so `/help` is a 404. Next's <Link> prefetches the
 * RSC payload for a link in the viewport, and a prefetch of a missing route
 * retries -- which meant the product page NEVER reached `networkidle`. The
 * browser regression sweep timed out after 60s on the third page and aborted
 * the whole run, so 34 later pages went unchecked and the failure looked like
 * an unrelated "no add-to-cart buttons" error.
 *
 * A dead <Link> is therefore not cosmetic here: it can hang the page's network
 * lifecycle. This test walks the App Router directory, builds the set of real
 * routes, and asserts every literal href in the source resolves to one.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const WEB_ROOT = path.resolve(__dirname, '..');
const APP_DIR = path.join(WEB_ROOT, 'app');

/** Collect every routable path from the App Router tree. */
function collectRoutes(dir: string, prefix = ''): { static: Set<string>; dynamic: RegExp[] } {
  const staticRoutes = new Set<string>();
  const dynamic: RegExp[] = [];

  const walk = (current: string, urlPrefix: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const name = entry.name;
      // Route groups `(marketing)` and private `_components` add no segment.
      if (name.startsWith('_')) continue;
      const child = path.join(current, name);
      let nextPrefix: string;
      if (name.startsWith('(') && name.endsWith(')')) {
        nextPrefix = urlPrefix;
      } else if (name.startsWith('[')) {
        // A dynamic segment matches any single value.
        nextPrefix = `${urlPrefix}/:seg`;
      } else {
        nextPrefix = `${urlPrefix}/${name}`;
      }

      const hasPage = ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((f) =>
        fs.existsSync(path.join(child, f)),
      );
      if (hasPage) {
        if (nextPrefix.includes('/:seg')) {
          dynamic.push(new RegExp(`^${nextPrefix.replace(/\/:seg/g, '/[^/]+')}$`));
        } else {
          staticRoutes.add(nextPrefix || '/');
        }
      }
      walk(child, nextPrefix);
    }
  };

  walk(dir, prefix);
  if (fs.existsSync(path.join(dir, 'page.tsx'))) staticRoutes.add('/');
  return { static: staticRoutes, dynamic };
}

/** Every .tsx source file under app/ and components/. */
function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name === '.next') continue;
        walk(full);
      } else if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) {
        out.push(full);
      }
    }
  };
  walk(APP_DIR);
  walk(path.join(WEB_ROOT, 'components'));
  return out;
}

const routes = collectRoutes(APP_DIR);

function isRoutable(href: string): boolean {
  if (routes.static.has(href)) return true;
  return routes.dynamic.some((re) => re.test(href));
}

describe('internal links point at real routes', () => {
  it('discovers the App Router routes', () => {
    // Sanity-check the collector itself, so a bug here cannot make the
    // assertion below vacuously pass.
    expect(routes.static.has('/')).toBe(true);
    expect(routes.static.has('/products')).toBe(true);
    expect(routes.static.has('/faq')).toBe(true);
    // /help is a dynamic-only route: /help/<slug> exists, bare /help does not.
    expect(routes.static.has('/help')).toBe(false);
    expect(isRoutable('/help/shipping')).toBe(true);
  });

  it('has no href pointing at a non-existent route', () => {
    const broken: string[] = [];

    for (const file of sourceFiles()) {
      const src = fs.readFileSync(file, 'utf8');
      // Literal hrefs only. Template literals and expressions are dynamic and
      // cannot be resolved statically.
      //
      // Two spellings, both of which reach a <Link href>:
      //   href="/faq"        JSX attribute
      //   href: '/faq'       object property in a link/config array -- this is
      //                      the form the /help bug used, so matching only the
      //                      JSX attribute would have missed it entirely.
      const patterns = [
        /href=["'](\/[a-zA-Z0-9/_-]*)["']/g,
        /href:\s*["'](\/[a-zA-Z0-9/_-]*)["']/g,
      ];
      // exec-loop rather than spreading matchAll: the project's tsconfig
      // target does not allow iterating a RegExp match iterator.
      const found: string[] = [];
      for (const re of patterns) {
        let hit: RegExpExecArray | null;
        while ((hit = re.exec(src)) !== null) found.push(hit[1]);
      }
      for (const m of found.map((h) => [h, h] as [string, string])) {
        const href = m[1].replace(/\/$/, '') || '/';
        // Files under /public (assets) are served directly, not routed.
        if (/\.[a-z0-9]{2,4}$/i.test(href)) continue;
        if (!isRoutable(href)) {
          broken.push(`${path.relative(WEB_ROOT, file)} -> ${href}`);
        }
      }
    }

    expect(broken).toEqual([]);
  });
});

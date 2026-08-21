import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { serverFetch } from '@/lib/serverFetch';
import { encodeRouteParam } from '@/lib/routeParam';

/**
 * Returns a real HTTP 404 for unknown category and product URLs.
 *
 * WHY THIS IS IN MIDDLEWARE AND NOT THE PAGE
 * ------------------------------------------
 * `notFound()` in a server component only sets the status code when the
 * response is NOT streamed. Next's own docs are explicit:
 *
 *   "Next.js will return a 200 HTTP status code for streamed responses,
 *    and 404 for non-streamed responses."
 *   https://nextjs.org/docs/app/api-reference/file-conventions/not-found
 *
 * This app streams. The root layout renders an interactive shell (cart, theme,
 * toasts, header, footer) and several routes have `loading.tsx`, both of which
 * put the response into streaming mode. By the time `notFound()` runs the
 * headers are already on the wire, so the status is locked at 200 — verified
 * repeatedly here, including with a bare `notFound()` in a trivial page.
 *
 * Middleware runs BEFORE any rendering begins, so it is the one place that can
 * still choose the status. We ask the API whether the slug exists and, if it
 * definitively does not, rewrite to /not-found with `status: 404`. The user
 * still sees the normal styled not-found page; crawlers now get a 404.
 *
 * FAIL-OPEN BY DESIGN
 * A slug is only treated as missing when the API explicitly answers 404. Any
 * other outcome — network error, 500, timeout — falls through to normal
 * rendering. A flaky API must never turn a real category into a 404.
 */

const CHECKS: { pattern: RegExp; endpoint: (slug: string) => string }[] = [
  {
    pattern: /^\/category\/([^/]+)\/?$/,
    endpoint: (slug) => `/categories/${encodeRouteParam(slug)}`,
  },
  {
    pattern: /^\/products\/([^/]+)\/?$/,
    endpoint: (slug) => `/products/slug/${encodeRouteParam(slug)}`,
  },
  {
    // Admin-authored pages. The API 404s for unknown slugs AND for drafts, so
    // an unpublished page is indistinguishable from a missing one - which is
    // what we want publicly.
    pattern: /^\/p\/([^/]+)\/?$/,
    endpoint: (slug) => `/pages/slug/${encodeRouteParam(slug)}`,
  },
  {
    // Blog posts. Same rule: drafts and unknown slugs both 404.
    pattern: /^\/blog\/([^/]+)\/?$/,
    endpoint: (slug) => `/blog/slug/${encodeRouteParam(slug)}`,
  },
];

/**
 * Sub-paths that look like a slug but are real routes.
 *
 * Scoped per pattern: applying one shared set to every route family would mean
 * a blog post legitimately called "category" got skipped.
 */
const RESERVED_BY_PREFIX: Record<string, Set<string>> = {
  '/products': new Set(['category']),
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  for (const { pattern, endpoint } of CHECKS) {
    const m = pathname.match(pattern);
    if (!m) continue;

    const slug = decodeURIComponent(m[1]);
    const prefix = '/' + pathname.split('/')[1];
    if (RESERVED_BY_PREFIX[prefix]?.has(slug)) return NextResponse.next();

    try {
      // AbortController: middleware sits in the critical path of every
      // matching request, so a hung API must not hang the page.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);

      // serverFetch: falls back across loopback spellings (localhost /
      // 127.0.0.1 / [::1]) when one family is dead - the split that made
      // published pages render as not-found while the admin list loaded.
      const res = await serverFetch(endpoint(slug), {
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.status === 404) {
        // Fetch the real, fully-styled /not-found page and re-serve its HTML
        // with a 404 status.
        //
        // Why not NextResponse.rewrite()? Because the rewritten route still
        // renders through the streaming app shell, which locks the status back
        // to 200 - measured: the rewrite fired and the response was 200. Only
        // a response constructed here keeps the status.
        //
        // Fetching keeps the header, footer, theme and styling identical to
        // every other page; nothing is hand-written here.
        const nf = await fetch(new URL('/not-found', req.nextUrl.origin), {
          headers: { 'accept-language': req.headers.get('accept-language') ?? 'en' },
        });
        const html = await nf.text();

        return new NextResponse(html, {
          status: 404,
          headers: {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
            'x-robots-tag': 'noindex, follow',
          },
        });
      }
    } catch {
      // Fail open — see the note above.
    }

    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  // Only the two dynamic route families need checking. Everything else -
  // static assets, _next internals, the API proxy, images - is skipped so
  // middleware costs nothing on the rest of the site.
  matcher: ['/category/:path*', '/products/:path*', '/p/:path*', '/blog/:path*'],
};

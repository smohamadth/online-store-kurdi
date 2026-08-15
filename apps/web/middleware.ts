import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { API_BASE } from '@/lib/apiBase';

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
    endpoint: (slug) => `${API_BASE}/categories/${encodeURIComponent(slug)}`,
  },
  {
    pattern: /^\/products\/([^/]+)\/?$/,
    endpoint: (slug) => `${API_BASE}/products/slug/${encodeURIComponent(slug)}`,
  },
];

/** Sub-paths under /products that are real pages, not product slugs. */
const PRODUCT_RESERVED = new Set(['category']);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  for (const { pattern, endpoint } of CHECKS) {
    const m = pathname.match(pattern);
    if (!m) continue;

    const slug = decodeURIComponent(m[1]);
    if (PRODUCT_RESERVED.has(slug)) return NextResponse.next();

    try {
      // AbortController: middleware sits in the critical path of every
      // matching request, so a hung API must not hang the page.
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(endpoint(slug), {
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
  matcher: ['/category/:path*', '/products/:path*'],
};

/**
 * Component / provider test setup.
 *
 * Mounts React components under happy-dom. Stubs the `next/*` modules the
 * storefront components import so they don't try to spin up the Next runtime.
 *
 * Why stubs instead of the real next packages:
 *   - `next/link` reads a server-side `__next_router` global that isn't
 *     available in vitest. The stub renders a plain `<a>` with the same
 *     `href`/`target` props so behaviour-level assertions still work.
 *   - `next/navigation` exports `useRouter` / `usePathname` / etc. The
 *     implementations just call into a shared store here; tests reset it
 *     with `setNextRouter({})` between cases.
 */
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// `next/link` - render an <a> with the destination. This is what the
// component is really trying to tell us about (the user can reach the URL)
// and the rest of the test stack doesn't care that we didn't go through
// Next's client-side prefetcher.
vi.mock('next/link', () => ({
  default: ({ children, href, target, rel, onClick, onMouseEnter, onMouseLeave, ...rest }: any) => {
    const Tag = 'a';
    return (
      <Tag
        href={typeof href === 'string' ? href : '#'}
        target={target}
        rel={rel}
        onClick={onClick}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        {...rest}
      >
        {children}
      </Tag>
    );
  },
}));

// `next/navigation` - tiny test-double router. The real `useRouter` returns
// a stable object identity; tests push/pop routes by mutating the store.
const nextRouterStore: {
  pathname: string;
  searchParams: URLSearchParams;
  pushedTo: string[];
  replaceCalls: string[];
} = {
  pathname: '/',
  searchParams: new URLSearchParams(),
  pushedTo: [],
  replaceCalls: [],
};

export function getNextRouter() {
  return nextRouterStore;
}

export function setNextRouter(overrides: {
  pathname?: string;
  searchParams?: URLSearchParams;
}) {
  if (overrides.pathname !== undefined) nextRouterStore.pathname = overrides.pathname;
  if (overrides.searchParams) nextRouterStore.searchParams = overrides.searchParams;
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: (url: string) => nextRouterStore.pushedTo.push(url),
    replace: (url: string) => nextRouterStore.replaceCalls.push(url),
    back: () => {},
    forward: () => {},
    refresh: () => {},
    prefetch: () => {},
  }),
  usePathname: () => nextRouterStore.pathname,
  useSearchParams: () => ({
    get: (k: string) => nextRouterStore.searchParams.get(k),
    getAll: (k: string) => nextRouterStore.searchParams.getAll(k),
    has: (k: string) => nextRouterStore.searchParams.has(k),
    toString: () => nextRouterStore.searchParams.toString(),
    entries: () => nextRouterStore.searchParams.entries(),
    keys: () => nextRouterStore.searchParams.keys(),
    values: () => nextRouterStore.searchParams.values(),
    forEach: (cb: any) => nextRouterStore.searchParams.forEach(cb as any),
  }),
  useParams: () => ({}),
  redirect: (url: string) => {
    nextRouterStore.pushedTo.push(url);
  },
  notFound: () => {},
}));

// Each test owns its DOM. RTL auto-unmounts but cleaning the router store
// keeps assertions like "called router.push with X" deterministic.
beforeEach(() => {
  nextRouterStore.pathname = '/';
  nextRouterStore.searchParams = new URLSearchParams();
  nextRouterStore.pushedTo = [];
  nextRouterStore.replaceCalls = [];
  // Wipe any localStorage written by the test (ThemeProvider, CartProvider,
  // i18n all persist).
  try {
    localStorage.clear();
  } catch {
    /* noop in environments without localStorage */
  }
  // Default fetch: 404 JSON. Tests that care override with their own mock.
  // Setting this every test means a previous test's vi.fn() doesn't leak
  // into the next one.
  const defaultFetch: any = (url: any, _init?: any) =>
    Promise.resolve({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      url: typeof url === 'string' ? url : '',
      json: () => Promise.resolve({ data: null }),
      text: () => Promise.resolve(''),
    });
  globalThis.fetch = defaultFetch as any;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

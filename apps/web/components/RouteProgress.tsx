'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Thin progress bar across the top of the viewport during navigation.
 *
 * App Router gives no navigation-start event, so we detect intent ourselves:
 * a click on an internal <a>, or a history back/forward. The bar then clears
 * when the resulting pathname/search actually changes.
 *
 * Shows on EVERY navigation, fast or slow. A minimum visible duration keeps
 * quick transitions from flashing the bar in and straight back out.
 */
function RouteProgressInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shownAt = useRef<number>(0);

  // Keep the bar on screen at least this long once shown, so a 40ms
  // navigation still reads as deliberate feedback rather than a glitch.
  const MIN_VISIBLE_MS = 400;

  const clearTimers = () => {
    if (trickle.current) clearInterval(trickle.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    trickle.current = null;
    hideTimer.current = null;
  };

  const start = () => {
    clearTimers();
    // Show immediately - the user asked for feedback on every navigation.
    setVisible(true);
    setProgress(12);
    shownAt.current = Date.now();
    // Creep toward 90% but never reach it - completion happens on arrival.
    trickle.current = setInterval(() => {
      setProgress((p) => (p >= 90 ? p : p + Math.max(0.6, (90 - p) * 0.08)));
    }, 180);
  };

  const done = () => {
    clearTimers();
    const elapsed = Date.now() - shownAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    hideTimer.current = setTimeout(() => {
      setProgress(100);
      hideTimer.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 240);
    }, wait);
  };

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Ignore modified clicks — those open a new tab, the page doesn't change.
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
        return;
      }

      const anchor = (e.target as HTMLElement)?.closest?.('a');
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      // Skip new tabs, downloads, and non-navigational schemes.
      if (
        anchor.target === '_blank' ||
        anchor.hasAttribute('download') ||
        href.startsWith('#') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
      ) {
        return;
      }

      // External links leave the app entirely.
      try {
        const url = new URL(href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // Same URL = no navigation, so no progress bar.
        if (url.pathname + url.search === window.location.pathname + window.location.search) return;
      } catch {
        return;
      }

      start();
    };

    document.addEventListener('click', onClick, { capture: true });
    window.addEventListener('popstate', start);
    return () => {
      document.removeEventListener('click', onClick, { capture: true } as any);
      window.removeEventListener('popstate', start);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The route actually changed -> finish.
  // Skip the very first run: this effect also fires on mount, and completing
  // a navigation that never started would flash the bar on every page load.
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    done();
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, searchParams]);

  useEffect(() => clearTimers, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: '3px',
        zIndex: 10000,
        pointerEvents: 'none',
        backgroundColor: 'transparent',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #111, #4b5563)',
          boxShadow: '0 0 8px rgba(0,0,0,0.35)',
          transition: 'width 200ms ease',
        }}
      />
    </div>
  );
}

/**
 * Self-contained export.
 *
 * The Suspense boundary lives HERE rather than in the layout on purpose.
 * `useSearchParams()` forces a client-side bailout that must be wrapped in
 * Suspense - but a Suspense boundary anywhere between the root layout and a
 * page puts the whole response into streaming mode, and a streamed response
 * has its HTTP status locked to 200 before `notFound()` ever runs. That is
 * what made every unknown category and product URL a soft 404.
 *
 * Wrapping the boundary inside this component keeps it off the layout ->
 * page path, so pages can still return a real 404.
 */
export default function RouteProgress() {
  return (
    <Suspense fallback={null}>
      <RouteProgressInner />
    </Suspense>
  );
}

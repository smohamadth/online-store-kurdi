'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * Thin progress bar across the top of the viewport during navigation.
 *
 * App Router gives no navigation-start event, so we detect intent ourselves:
 * a click on an internal <a>, or a history back/forward. The bar then clears
 * when the resulting pathname/search actually changes.
 *
 * Deliberately delayed: showing a loading bar for an instant navigation just
 * makes the UI flicker, so nothing appears unless the page takes >150ms.
 */
export default function RouteProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(0);

  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trickle = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (showTimer.current) clearTimeout(showTimer.current);
    if (trickle.current) clearInterval(trickle.current);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    showTimer.current = null;
    trickle.current = null;
    hideTimer.current = null;
  };

  const start = () => {
    clearTimers();
    showTimer.current = setTimeout(() => {
      setVisible(true);
      setProgress(12);
      // Creep toward 90% but never reach it — completion happens on arrival.
      trickle.current = setInterval(() => {
        setProgress((p) => (p >= 90 ? p : p + Math.max(0.6, (90 - p) * 0.08)));
      }, 180);
    }, 150);
  };

  const done = () => {
    clearTimers();
    setProgress(100);
    hideTimer.current = setTimeout(() => {
      setVisible(false);
      setProgress(0);
    }, 240);
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

  // The route actually changed → finish.
  useEffect(() => {
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

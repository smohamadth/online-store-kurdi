'use client';

import { useEffect, useState } from 'react';

/**
 * Reading progress bar for article pages.
 *
 * A thin bar pinned to the top of the viewport that fills as the reader
 * scrolls through the article. Deliberately tiny: one passive scroll
 * listener, no layout impact (position: fixed), and it only becomes
 * visible once the reader has started, so static pages never show a
 * floating line.
 *
 * RTL-correct: the bar anchors to the inline start (right in RTL), so it
 * fills in the reading direction.
 */
export default function ReadingProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const measure = () => {
      raf = 0;
      const doc = document.documentElement;
      const total = doc.scrollHeight - window.innerHeight;
      if (total > 0) {
        setProgress(Math.min(1, Math.max(0, window.scrollY / total)));
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  const visible = progress > 0.005;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        top: 0,
        insetInlineStart: 0,
        zIndex: 90,
        width: '100%',
        height: '3px',
        pointerEvents: 'none',
        opacity: visible ? 1 : 0,
        transition: 'opacity 200ms ease',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${(progress * 100).toFixed(2)}%`,
          backgroundColor: 'var(--brand, #111)',
          transition: 'width 80ms linear',
        }}
      />
    </div>
  );
}

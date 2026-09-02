// On-this-page table of contents for blog posts.
//
// Builds itself from the article's OWN rendered headings (h2/h3 inside
// .post-body) after mount — so it works for both the HTML-content and
// the layout-blocks render paths without parsing anything server-side.
// It also assigns stable ids to headings that lack them, so the links
// double as in-article anchors. The active heading is tracked while the
// visitor scrolls (IntersectionObserver, with a scroll fallback) and
// the list renders nothing until there are at least two headings, so a
// short post never gets a stub box. Initial render is always empty —
// no hydration mismatch with the server HTML.

'use client';

import { useEffect, useState } from 'react';

interface TocItem {
  id: string;
  text: string;
  level: 2 | 3;
}

function slugify(text: string): string {
  const base = text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06FF\u0400-\u04FF\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return base || 'section';
}

export default function TableOfContents() {
  const [items, setItems] = useState<TocItem[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    // The blog page toggles between a single centered column and a
    // two-column rail purely from this class, so it must be removed when
    // there is nothing to list (short posts, still-loading content).
    const article = document.querySelector<HTMLElement>('.post-article');
    const syncClass = (on: boolean) => article?.classList.toggle('has-toc', on);

    const root = document.querySelector('.post-body');
    if (!root) {
      syncClass(false);
      return;
    }

    const headings = Array.from(root.querySelectorAll<HTMLHeadingElement>('h2, h3'));
    if (headings.length < 2) {
      syncClass(false);
      return;
    }

    // Assign stable ids to headings that don't have one yet.
    const seen = new Set<string>();
    const list: TocItem[] = headings.map((h, i) => {
      let id = h.id || slugify(h.textContent || `section-${i}`);
      let n = 2;
      while (seen.has(id)) id = `${slugify(h.textContent || 'section')}-${n++}`;
      seen.add(id);
      h.id = id;
      return { id, text: (h.textContent || '').trim(), level: h.tagName === 'H3' ? 3 : 2 };
    });
    setItems(list);
    setActiveId(list[0].id);
    syncClass(true);

    // Deep links: a shared #section URL only becomes meaningful once the
    // ids above exist, so honour it right after assigning them. Deferred
    // a tick so images/layout above the fold have settled.
    const hashTimer = window.setTimeout(() => {
      if (!window.location.hash) return;
      try {
        const target = document.getElementById(
          decodeURIComponent(window.location.hash.slice(1))
        );
        target?.scrollIntoView({ block: 'start' });
      } catch {
        // Malformed hash — never crash the article.
      }
    }, 50);

    const els = headings.map((h) => h.id);
    let cleanup: () => void = () => {};

    if (typeof IntersectionObserver !== 'undefined') {
      const observer = new IntersectionObserver(
        (entries) => {
          // Of the headings crossing the reading line, keep the topmost.
          const visible = entries.filter((e) => e.isIntersecting);
          if (visible.length > 0) {
            const first = visible.reduce((a, b) => (a.boundingClientRect.top <= b.boundingClientRect.top ? a : b));
            setActiveId(first.target.id);
          }
        },
        // The reading line sits below the sticky header and above the
        // bottom 70% — exactly one heading is "current" at a time.
        { rootMargin: '-80px 0px -70% 0px', threshold: 0 }
      );
      headings.forEach((h) => observer.observe(h));
      cleanup = () => observer.disconnect();
    } else {
      const onScroll = () => {
        let current: string | null = null;
        for (const h of headings) {
          if (h.getBoundingClientRect().top <= 120) current = h.id;
          else break;
        }
        setActiveId(current || els[0]);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
      cleanup = () => window.removeEventListener('scroll', onScroll);
    }

    return () => {
      window.clearTimeout(hashTimer);
      cleanup();
      syncClass(false);
    };
  }, []);

  if (items.length < 2) return null;

  return (
    <nav
      aria-label="On this page"
      className="rich-toc"
      style={{
        border: '1px solid var(--border, #e5e7eb)',
        borderRadius: 'calc(var(--radius, 10px) + 2px)',
        backgroundColor: 'var(--card-bg, #fff)',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'var(--muted, #6b7280)',
          marginBottom: '10px',
        }}
      >
        On this page
      </div>
      <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '2px' }}>
        {items.map((h, i) => {
          const on = activeId === h.id;
          return (
            <li key={h.id}>
              <a
                href={`#${h.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  document.getElementById(h.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  history.replaceState(null, '', `#${h.id}`);
                  setActiveId(h.id);
                }}
                style={{
                  display: 'flex',
                  gap: '8px',
                  alignItems: 'baseline',
                  marginInlineStart: h.level === 3 ? '14px' : 0,
                  padding: '5px 8px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  lineHeight: 1.45,
                  fontWeight: on ? 700 : 500,
                  textDecoration: 'none',
                  color: on ? 'var(--accent, #2563eb)' : 'var(--muted, #555)',
                  backgroundColor: on ? 'var(--surface-2, #f1f1f2)' : 'transparent',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{ fontSize: '11px', opacity: 0.55, fontVariantNumeric: 'tabular-nums' }}
                >
                  {i + 1}
                </span>
                <span>{h.text}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

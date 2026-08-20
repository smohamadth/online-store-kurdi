'use client';

import { useEffect } from 'react';
import { API_BASE } from '@/lib/http';

/**
 * Records one view of a post.
 *
 * Deliberately fire-and-forget and rendered as a client island inside an
 * otherwise server-rendered article: counting a read must never delay or
 * block the reader seeing it, and a failure here is not worth surfacing.
 *
 * The ref guard stops React 18 StrictMode double-invoking the effect in
 * development and inflating every count by two.
 */
export default function PostViewCounter({ slug }: { slug: string }) {
  useEffect(() => {
    let done = false;
    const t = setTimeout(() => {
      if (done) return;
      done = true;
      fetch(`${API_BASE}/blog/slug/${encodeURIComponent(slug)}/view`, {
        method: 'POST',
        keepalive: true,
      }).catch(() => {
        /* analytics only */
      });
    }, 1200); // only count a read that lasted a moment

    return () => {
      done = true;
      clearTimeout(t);
    };
  }, [slug]);

  return null;
}

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { API_BASE } from '@/lib/apiBase';
import { getStoreInfo, buildMetadata } from '@/lib/seo';

/**
 * Renders an admin-authored page at /p/<slug>.
 *
 * A SERVER component on purpose: an unknown or draft slug must return a real
 * HTTP 404, and notFound() only sets the status before the response is
 * committed. See KNOWN_GAPS.md section 7 for the streaming caveat - the
 * middleware handles the storefront's dynamic routes, and this route is listed
 * there too.
 *
 * API_BASE comes from lib/apiBase, NOT lib/http: the latter is 'use client',
 * and importing a value from it into a server component yields a
 * client-reference Symbol rather than a string.
 */

interface Page {
  slug: string;
  title: string;
  content: string;
  excerpt?: string | null;
  metaTitle?: string | null;
  metaDescription?: string | null;
  updatedAt: string;
}

async function getPage(slug: string): Promise<Page | null> {
  try {
    // no-store: an edit must be visible on the next load, and a page pulled
    // back to draft must stop being served immediately.
    const res = await fetch(`${API_BASE}/pages/slug/${encodeURIComponent(slug)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()).data || null;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [page, store] = await Promise.all([getPage(params.slug), getStoreInfo()]);

  if (!page) {
    return { title: 'Page not found', robots: { index: false, follow: true } };
  }

  const description =
    page.metaDescription?.trim() ||
    page.excerpt?.trim() ||
    `${page.title} — ${store.storeName}`;

  return buildMetadata({
    title: page.metaTitle?.trim() || `${page.title} | ${store.storeName}`,
    description,
    path: `/p/${page.slug}`,
    storeName: store.storeName,
  });
}

export default async function CustomPage({ params }: { params: { slug: string } }) {
  const page = await getPage(params.slug);

  if (!page) notFound();

  return (
    <article
      style={{
        maxWidth: '760px',
        margin: '0 auto',
        padding: '56px 20px 72px',
        color: 'var(--body-text, #111)',
      }}
    >
      <h1
        style={{
          fontSize: '34px',
          fontWeight: 'var(--heading-weight, 800)' as any,
          letterSpacing: '-0.02em',
          lineHeight: 1.15,
        }}
      >
        {page.title}
      </h1>

      {page.excerpt && (
        <p style={{ marginTop: '12px', fontSize: '17px', color: 'var(--muted, #666)', lineHeight: 1.6 }}>
          {page.excerpt}
        </p>
      )}

      <div
        style={{
          marginTop: '28px',
          fontSize: '16px',
          lineHeight: 1.75,
        }}
        // Sanitised server-side on write (see pages/page.routes.ts), never on
        // read - so nothing dangerous is ever stored.
        dangerouslySetInnerHTML={{ __html: page.content || '' }}
      />

      <p style={{ marginTop: '40px', fontSize: '13px', color: 'var(--muted, #888)' }}>
        Last updated {new Date(page.updatedAt).toLocaleDateString()}
      </p>
    </article>
  );
}

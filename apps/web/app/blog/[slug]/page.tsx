import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import Link from 'next/link';
import { API_BASE } from '@/lib/apiBase';
import { getStoreInfo, buildMetadata, SITE } from '@/lib/seo';
import { BlogPost, formatPostDate } from '@/lib/blog';
import PostViewCounter from '@/components/PostViewCounter';
import { encodeRouteParam } from '@/lib/routeParam';

/**
 * A single blog post at /blog/<slug>.
 *
 * SERVER component so the article body is in the initial HTML for crawlers,
 * and so an unknown or draft slug returns a REAL 404 — notFound() only sets
 * the status before the response is committed. /blog/:path* is registered in
 * middleware.ts alongside the other dynamic routes for the streaming case
 * described in KNOWN_GAPS.md section 7.
 */

async function getPost(slug: string): Promise<BlogPost | null> {
  try {
    // no-store: an edit must show on the next load, and a post pulled back to
    // draft must stop being served immediately.
    const res = await fetch(`${API_BASE}/blog/slug/${encodeRouteParam(slug)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()).data || null;
  } catch {
    return null;
  }
}

function absolute(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  return `${API_BASE.replace('/api', '')}${url}`;
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const [post, store] = await Promise.all([getPost(params.slug), getStoreInfo()]);

  if (!post) {
    return { title: 'Post not found', robots: { index: false, follow: true } };
  }

  const description =
    post.metaDescription?.trim() ||
    post.excerpt?.trim() ||
    `${post.title} — ${store.storeName}`;

  const meta = buildMetadata({
    title: post.metaTitle?.trim() || `${post.title} | ${store.storeName}`,
    description,
    path: `/blog/${post.slug}`,
    storeName: store.storeName,
  });

  const image = absolute(post.coverImage);

  return {
    ...meta,
    keywords: post.tags.length ? post.tags : undefined,
    openGraph: {
      ...meta.openGraph,
      // An article, not a generic website — this is what gives a post a proper
      // card with a date and author when shared.
      type: 'article',
      publishedTime: post.publishedAt || undefined,
      modifiedTime: post.updatedAt,
      authors: post.author ? [post.author] : undefined,
      tags: post.tags,
      images: image ? [{ url: image, alt: post.title }] : undefined,
    },
    twitter: {
      ...meta.twitter,
      card: image ? 'summary_large_image' : 'summary',
      images: image ? [image] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  const post = await getPost(params.slug);

  if (!post) notFound();

  const store = await getStoreInfo();
  const image = absolute(post.coverImage);

  // Structured data: lets Google show the headline, date and image directly in
  // results. Cheap to emit and the main reason a blog earns traffic.
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt || post.metaDescription || undefined,
    image: image ? [image] : undefined,
    datePublished: post.publishedAt || post.createdAt,
    dateModified: post.updatedAt,
    author: { '@type': 'Person', name: post.author || store.storeName },
    publisher: { '@type': 'Organization', name: store.storeName },
    mainEntityOfPage: { '@type': 'WebPage', '@id': `${SITE}/blog/${post.slug}` },
    keywords: post.tags.join(', ') || undefined,
  };

  return (
    <article style={{ maxWidth: '760px', margin: '0 auto', padding: '48px 20px 72px' }}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      <PostViewCounter slug={post.slug} />

      <nav style={{ marginBottom: '20px', fontSize: '14px' }}>
        <Link href="/blog" style={{ color: 'var(--accent, #3b82f6)', textDecoration: 'none' }}>
          ← All posts
        </Link>
      </nav>

      <header>
        <h1
          style={{
            fontSize: '38px',
            fontWeight: 'var(--heading-weight, 800)' as any,
            letterSpacing: '-0.02em',
            lineHeight: 1.15,
            color: 'var(--body-text, #111)',
          }}
        >
          {post.title}
        </h1>

        <p style={{ marginTop: '12px', fontSize: '14px', color: 'var(--muted, #666)' }}>
          {post.author ? `By ${post.author} · ` : ''}
          {formatPostDate(post.publishedAt || post.createdAt)} · {post.readingMinutes} min read
        </p>

        {post.tags.length > 0 && (
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '14px' }}>
            {post.tags.map((t) => (
              <Link
                key={t}
                href={`/blog?tag=${encodeURIComponent(t)}`}
                style={{
                  fontSize: '12px',
                  padding: '4px 12px',
                  borderRadius: '999px',
                  textDecoration: 'none',
                  backgroundColor: 'var(--body-bg, #f3f4f6)',
                  border: '1px solid var(--border, #e5e5e5)',
                  color: 'var(--muted, #555)',
                }}
              >
                {t}
              </Link>
            ))}
          </div>
        )}
      </header>

      {image && (
        <img
          src={image}
          alt={post.title}
          style={{
            width: '100%',
            marginTop: '28px',
            borderRadius: 'var(--radius, 12px)',
            display: 'block',
          }}
        />
      )}

      {post.excerpt && (
        <p
          style={{
            marginTop: '24px',
            fontSize: '18px',
            lineHeight: 1.65,
            color: 'var(--muted, #555)',
            fontWeight: 500,
          }}
        >
          {post.excerpt}
        </p>
      )}

      <div
        style={{ marginTop: '24px', fontSize: '17px', lineHeight: 1.8, color: 'var(--body-text, #222)' }}
        // Sanitised server-side ON WRITE (blog.routes.ts), never on read.
        dangerouslySetInnerHTML={{ __html: post.content || '' }}
      />

      {post.related && post.related.length > 0 && (
        <section
          style={{
            marginTop: '56px',
            paddingTop: '28px',
            borderTop: '1px solid var(--border, #e5e5e5)',
          }}
        >
          <h2 style={{ fontSize: '20px', fontWeight: 800, marginBottom: '16px' }}>Keep reading</h2>
          <div style={{ display: 'grid', gap: '12px' }}>
            {post.related.map((r) => (
              <Link
                key={r.id}
                href={`/blog/${r.slug}`}
                style={{
                  display: 'block',
                  padding: '14px 16px',
                  borderRadius: 'var(--radius, 10px)',
                  border: '1px solid var(--border, #e8e8e8)',
                  backgroundColor: 'var(--card-bg, #fff)',
                  textDecoration: 'none',
                  color: 'var(--body-text, #111)',
                }}
              >
                <p style={{ fontWeight: 700, fontSize: '15px' }}>{r.title}</p>
                <p style={{ fontSize: '13px', color: 'var(--muted, #777)', marginTop: '3px' }}>
                  {formatPostDate(r.publishedAt || r.createdAt)} · {r.readingMinutes} min read
                </p>
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  );
}
